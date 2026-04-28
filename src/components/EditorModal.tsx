// EditorModal.tsx
// Shared full-screen modal editor used by both QuickAddInput (new notes)
// and NotesListScreen (editing existing notes).

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Modal,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    StyleSheet,
    BackHandler,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useNotesStore } from '../stores/notesStore';
import { DomainSelector } from './DomainSelector';
import { SmartEditor, SmartEditorRef } from './SmartEditor';
import { MarkdownToolbar } from './MarkdownToolbar';
import { TiptapToolbar } from './TiptapToolbar';
import { EnrichedToolbar } from './EnrichedToolbar';
import { EnrichedTitleInput } from './EnrichedTitleInput';
import type { EnrichedEditorBridge } from './EnrichedEditor';
import { type EditorBridge } from '@10play/tentap-editor';
import type { OnChangeStateEvent } from 'react-native-enriched';
import { DomainType } from '../types/Note';
import { RTL_TEXT_STYLE } from '../utils/rtlUtils';
import { USE_NATIVE_EDITOR } from '../config/editorMode';

// ─── Public ref ───────────────────────────────────────────────────────────────

export interface EditorModalRef {
    /** Clear editor content. */
    clear: () => void;
    /** Replace editor content + cursor. */
    setTextAndSelection: (text: string, sel: { start: number; end: number }) => void;
    /** Dismiss modal and blur editor. */
    blur: () => void;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface EditorModalProps {
    visible: boolean;
    /** Raw markdown content. */
    text: string;
    domain: DomainType | null;
    isPinned: boolean;
    isSaving: boolean;
    onTextChange: (text: string) => void;
    onDomainChange: (domain: DomainType | null) => void;
    onPinChange: (isPinned: boolean) => void;
    /**
     * Save handler. Receives the freshest markdown content read directly from
     * the editor — preferred over reading from props/state which may lag the
     * editor by up to one debounce cycle (150ms) while the user is typing.
     */
    onSave: (content?: string) => void;
    /**
     * Close handler. Same freshness guarantee as onSave for consumers that
     * auto-save on close.
     */
    onClose: (content?: string) => void;
    /** If true, domain is required before saving (shows toast). */
    requireDomain?: boolean;
    /** Optional title field (for editing existing notes). */
    title?: string;
    onTitleChange?: (title: string) => void;
    showTitle?: boolean;
    /** Show domain selector in compact mode (single chip). */
    compactDomain?: boolean;
    /**
     * When true, render with a permanent screen-level View overlay (instead
     * of RN <Modal>) and pre-mount the SmartEditor at app start regardless
     * of `visible`. The whole purpose: keep the WKWebView in the visible
     * window from t=0 so iOS launches the WebContent process in the
     * background while the user is still browsing the notes list. The
     * first tap is then instant rather than paying a 4-6 s WebKit cold start.
     *
     * Use SPARINGLY — every eagerMount=true instance keeps a permanent
     * WebView alive, which costs ~30-50 MB on iOS. Reserve this for the
     * single most-frequent flow (QuickAdd). Other flows (Edit) should stay
     * lazy-mounted on visible to avoid resource competition.
     */
    eagerMount?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const EditorModal = React.forwardRef<EditorModalRef, EditorModalProps>(({
    visible,
    text,
    domain,
    isPinned,
    isSaving,
    onTextChange,
    onDomainChange,
    onPinChange,
    onSave,
    onClose,
    requireDomain = false,
    title,
    onTitleChange,
    showTitle = false,
    compactDomain = false,
    eagerMount = false,
}, ref) => {
    const { t } = useTranslation();
    const [showDomainToast, setShowDomainToast] = useState(false);
    const [editorBridge, setEditorBridge] = useState<EditorBridge | null>(null);
    const [enrichedBridge, setEnrichedBridge] = useState<EnrichedEditorBridge | null>(null);
    // RNE-only: latest formatting state for highlighting toolbar buttons.
    // For the Tiptap path the toolbar uses useBridgeState internally and
    // doesn't need this state to be lifted up here.
    const [enrichedState, setEnrichedState] = useState<OnChangeStateEvent | null>(null);
    const [editorInstance, setEditorInstance] = useState<SmartEditorRef | null>(null);
    const editorRef = useRef<SmartEditorRef>(null);
    const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

    const insets = useSafeAreaInsets();
    const { keyboardVisible: isKeyboardVisible } = useKeyboardHeight();

    const { settings } = useNotesStore();
    // [INACTIVE] editorMode — תמיד richtext, בחירת מצב מושבתת
    const editorMode = 'richtext'; // settings.editorMode || 'richtext';

    const handleEditorRef = useCallback((r: SmartEditorRef | null) => {
        editorRef.current = r;
        setEditorInstance(r);
        if (r && editorMode === 'richtext') {
            // Pull the right bridge based on the active editor implementation.
            // SmartEditor returns null for whichever path isn't active.
            if (USE_NATIVE_EDITOR) {
                setEnrichedBridge(r.getEnrichedBridge());
            } else {
                setEditorBridge(r.getEditorBridge());
            }
        }
    }, [editorMode]);

    // Mount the SmartEditor.
    //
    // - eagerMount=true: mount immediately on component mount (i.e. at app
    //   start), regardless of `visible`. Combined with the View-overlay
    //   render path below, this puts the WKWebView in the visible window
    //   from t=0 — which is the trigger iOS needs to launch the WebContent
    //   process. By the time the user taps "new note", the editor is alive.
    //
    // - eagerMount=false (default): lazy-mount on the FIRST visible=true.
    //   Pre-mounting inside the hidden RN <Modal visible={false}> doesn't
    //   help on iOS — Modal hides children from the visible window, so iOS
    //   doesn't launch the WebContent process until visible flips true.
    //
    // Either way, once mounted the editor stays mounted across every
    // open/close cycle (we never set shouldMountEditor back to false), so
    // subsequent opens are instant.
    const [shouldMountEditor, setShouldMountEditor] = useState(eagerMount);
    useEffect(() => {
        if (visible && !shouldMountEditor) {
            setShouldMountEditor(true);
        }
    }, [visible, shouldMountEditor]);

    // Track previous visibility to detect the false→true transition.
    const previousVisibleRef = useRef(false);
    // Mirror the latest text in a ref so the open-transition effect reads
    // the freshest value without re-firing on every keystroke (text would
    // otherwise update on every change via onTextChange).
    const textRef = useRef(text);
    textRef.current = text;
    useEffect(() => {
        const wasVisible = previousVisibleRef.current;
        previousVisibleRef.current = visible;
        if (!visible || wasVisible) return;

        if (visible && editorRef.current) {
            editorRef.current.setText?.(textRef.current);
            // Focus retry strategy depends on the active editor:
            //
            //   - Native (RNE / UITextView): a single focus call right after
            //     setText is reliable. UITextView responds synchronously to
            //     becomeFirstResponder; no race conditions.
            //
            //   - WebView (Tiptap): iOS WKWebView sometimes drops the first
            //     focus call after a layout transition (translateY → screen).
            //     Retry 0/100/300 ms to ensure the keyboard reliably comes up.
            //
            // Skipping the retries on the native path saves the 100-300 ms
            // perceptual delay the user reported as "still some latency".
            const delays = USE_NATIVE_EDITOR ? [0] : [0, 100, 300];
            const timers = delays.map(delay =>
                setTimeout(() => {
                    if (previousVisibleRef.current) editorRef.current?.focus?.();
                }, delay),
            );
            return () => timers.forEach(clearTimeout);
        }
    }, [visible]);

    // Android Back Button handling. Uses a ref to handleClose so we can
    // declare the effect before handleClose is defined (avoiding TDZ
    // issues) and so we don't have to add handleClose to the deps array
    // and re-register the listener every render.
    const handleCloseRef = useRef<(() => void) | null>(null);
    useEffect(() => {
        if (Platform.OS !== 'android' || !visible) return;
        const onBackPress = () => {
            handleCloseRef.current?.();
            return true;
        };
        // RN >= 0.65: addEventListener returns a subscription with .remove();
        // the older `BackHandler.removeEventListener` API is gone in 0.74+.
        const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => sub.remove();
    }, [visible]);

    // Track Tiptap WebView readiness so we can mask the empty editor area
    // with a spinner during the cold-start window. Once the editor reports
    // ready, it stays ready across visibility toggles since we now keep
    // it mounted. So the spinner only ever appears on the very first open.
    const [editorReady, setEditorReady] = useState(false);
    const LOADER_DELAY_MS = 400;
    const [showLoader, setShowLoader] = useState(false);
    // Mirror editorReady in a ref so the deferred timer reads the LATEST
    // value at fire time, not the stale closure capture from scheduling.
    const editorReadyRef = useRef(editorReady);
    editorReadyRef.current = editorReady;
    useEffect(() => {
        if (!visible) {
            // Hide spinner on close, but DON'T reset editorReady — the
            // editor remains alive and ready across opens, so the spinner
            // stays inactive on every open after the first.
            setShowLoader(false);
            return;
        }
        // Skip spinner schedule entirely on warm opens — editor is ready.
        if (editorReadyRef.current) return;
        const id = setTimeout(() => {
            if (!editorReadyRef.current) setShowLoader(true);
        }, LOADER_DELAY_MS);
        return () => clearTimeout(id);
    }, [visible]);
    // Hide the spinner the moment the editor reports ready, and aggressively
    // re-focus when the user tapped "new note" before the WebView finished
    // its cold start.
    //
    // WHY MULTIPLE RETRIES: iOS WKWebView empirically drops the first 1-2
    // focus() calls on a freshly-loaded WebView — the bridge accepts the
    // command but the contenteditable inside doesn't actually receive focus
    // (no caret, no keyboard). Retrying with progressive backoff gives the
    // WebView time to settle. Without this the user sees a fully-loaded
    // editor area but has to tap manually to start typing — exactly the UX
    // bug reported on iPad when tapping within the 4 s cold-start window.
    // Once one of these focus calls sticks, the editor becomes interactive
    // and subsequent calls are harmless no-ops.
    const visibleRef = useRef(visible);
    visibleRef.current = visible;
    useEffect(() => {
        if (!editorReady) return;
        setShowLoader(false);
        if (!visibleRef.current || !editorRef.current) return;
        // Re-push the text in case the open-transition's setText was a
        // no-op against a not-yet-ready editor.
        editorRef.current.setText?.(textRef.current);
        // RNE: a single focus call is reliable (UITextView is synchronous).
        // Tiptap WebView: needs progressive retries — see below.
        const delays = USE_NATIVE_EDITOR ? [50] : [50, 200, 500, 1000];
        const timers = delays.map(delay =>
            setTimeout(() => {
                if (visibleRef.current) editorRef.current?.focus?.();
            }, delay),
        );
        return () => timers.forEach(clearTimeout);
    }, [editorReady]);

    React.useImperativeHandle(ref, () => ({
        clear: () => { editorRef.current?.setText?.(''); },
        setTextAndSelection: (t, sel) => { editorRef.current?.setTextAndSelection?.(t, sel); },
        blur: () => {
            editorRef.current?.blur?.();
        },
    }), []);

    // Pull the freshest markdown directly from the editor instead of relying
    // on parent state (which may lag by one debounce cycle while typing).
    const captureFreshContent = async (): Promise<string | undefined> => {
        try {
            return await editorRef.current?.getMarkdown?.();
        } catch (e) {
            console.warn('captureFreshContent failed', e);
            return undefined;
        }
    };

    const handleSave = async () => {
        if (requireDomain && !domain) {
            setShowDomainToast(true);
            setTimeout(() => setShowDomainToast(false), 1500);
            return;
        }
        const fresh = await captureFreshContent();
        // Keep parent state in sync (best-effort) for the next render cycle.
        if (fresh !== undefined && fresh !== text) onTextChange(fresh);
        onSave(fresh);
    };

    const handleClose = async () => {
        editorRef.current?.blur?.();
        const fresh = await captureFreshContent();
        if (fresh !== undefined && fresh !== text) onTextChange(fresh);
        onClose(fresh);
    };
    // Mirror handleClose into the ref the BackHandler effect reads from.
    // Updated on every render so the listener always invokes the latest version.
    handleCloseRef.current = handleClose;

    // Android: closing the keyboard dismisses the modal (same effect as
    // tapping the toolbar's "down" arrow). Avoids the residual gap below
    // the toolbar when the keyboard goes down — the bottom system insets
    // (gesture bar) can be ~56 dp on some devices, capping doesn't fully
    // eliminate the visual lift, so the cleanest UX is just to close.
    // Only fires on a true→false transition while the modal is visible,
    // and only on Android.
    const prevKeyboardVisibleRef = useRef(isKeyboardVisible);
    useEffect(() => {
        const wasKeyboardVisible = prevKeyboardVisibleRef.current;
        prevKeyboardVisibleRef.current = isKeyboardVisible;
        if (
            Platform.OS === 'android' &&
            visible &&
            wasKeyboardVisible &&
            !isKeyboardVisible
        ) {
            handleCloseRef.current?.();
        }
    }, [isKeyboardVisible, visible]);

    // Web only: Cmd/Ctrl+S triggers the same flow as the send button. Held
    // in a ref so the listener always calls the latest handleSave (which
    // closes over current `text`/`domain`) without needing to re-attach
    // the global listener on every render.
    const handleSaveRef = useRef(handleSave);
    handleSaveRef.current = handleSave;
    useEffect(() => {
        if (Platform.OS !== 'web' || !visible) return;
        if (typeof window === 'undefined') return;
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                handleSaveRef.current();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [visible]);

    // Inner contents shared between the RN <Modal> and the View-overlay
    // render paths. Hoisted so we don't duplicate ~100 lines of JSX.
    const innerContents = (
        <View style={[styles.modalOverlay, { paddingTop: insets.top }]}>
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior="padding"
                    keyboardVerticalOffset={0}
                >
                    {/* Tap backdrop to close */}
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1} />

                    <View style={styles.modalSheet}>
                        {/* Optional title input. Branches on USE_NATIVE_EDITOR
                            so rolling back the editor flag also rolls back the
                            title input — keeps both surfaces consistent.
                              - native (USE_NATIVE_EDITOR=true): EnrichedTitleInput
                                renders inline markdown (`**bold**`, `*italic*`,
                                etc.) instead of leaking the raw markers.
                              - WebView fallback (USE_NATIVE_EDITOR=false):
                                plain TextInput — same as before the migration. */}
                        {showTitle && (
                            <View style={styles.titleContainer}>
                                {USE_NATIVE_EDITOR ? (
                                    <EnrichedTitleInput
                                        value={title ?? ''}
                                        onChangeText={onTitleChange ?? (() => {})}
                                        placeholder={t('title_placeholder')}
                                        placeholderTextColor="#999"
                                    />
                                ) : (
                                    <TextInput
                                        style={[styles.titleInput, { writingDirection: 'auto', textAlign: 'auto' }]}
                                        value={title}
                                        onChangeText={onTitleChange}
                                        placeholder={t('title_placeholder')}
                                        placeholderTextColor="#999"
                                    />
                                )}
                            </View>
                        )}

                        {/* Editor fills remaining space. When the title card
                            is showing, sit close to it (8 px gap); otherwise
                            keep the original 20 px breathing room. */}
                        <View style={[styles.editorArea, !showTitle && styles.editorAreaNoTitle]}>
                            {shouldMountEditor && (
                                <SmartEditor
                                    ref={handleEditorRef}
                                    initialContent={text}
                                    onChange={onTextChange}
                                    onEditorReady={() => setEditorReady(true)}
                                    onEnrichedStateChange={setEnrichedState}
                                    placeholder=""
                                    autoFocus={false}
                                    backgroundColor="#FFFFFF"
                                    style={{ flex: 1 }}
                                />
                            )}
                            {/* Loader masks the empty WebView during cold start.
                                Only renders if loading takes >150ms — warm
                                opens never see it (avoids a spinner→editor
                                flash that perceived as added latency). */}
                            {showLoader && (
                                <View style={styles.editorLoader} pointerEvents="none">
                                    <ActivityIndicator size="large" color="#000000" />
                                </View>
                            )}
                        </View>

                        {/* Domain selector + Send. Domain takes the available
                            space; send sits at the trailing edge so the user
                            picks the domain right next to the action button. */}
                        <View style={styles.domainSelectorRow}>
                            <View style={styles.domainSelectorFill}>
                                <DomainSelector
                                    selectedDomain={domain}
                                    onSelectDomain={onDomainChange}
                                    mode="select"
                                    compact={compactDomain}
                                    // Override the ScrollView's bottom margin
                                    // (which would otherwise pull the chips up
                                    // 4 px relative to the centered send button).
                                    style={{ marginBottom: 0 }}
                                />
                            </View>
                            <TouchableOpacity
                                style={[styles.sendButtonModal, (!text.trim() || isSaving) && styles.sendButtonDisabled]}
                                onPress={handleSave}
                                disabled={!text.trim() || isSaving}
                                // Visual button is small (matches chip height)
                                // but the touch target is expanded to ~44 px
                                // for thumb-friendly tapping per Apple HIG.
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                {isSaving
                                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                                    : (
                                        <Ionicons
                                            name="send"
                                            size={16}
                                            // Icon stays visible in the disabled
                                            // (no-text-yet) state — black on the
                                            // light gray surface — and flips to
                                            // white once the button is active on
                                            // the black surface.
                                            color={!text.trim() ? '#000000' : '#FFFFFF'}
                                        />
                                    )}
                            </TouchableOpacity>
                        </View>

                    </View>

                    {/* Toolbar — outside modalSheet so it spans the FULL
                        screen width on wide displays (web/tablet) instead of
                        being awkwardly capped at the 720 px content rail.
                        Branches on USE_NATIVE_EDITOR: each path has its own
                        toolbar (different bridge shape, different state
                        propagation mechanism). Same visual layout. */}
                    {USE_NATIVE_EDITOR ? (
                        enrichedBridge && (
                            <View style={[styles.bottomBar, { paddingBottom: isKeyboardVisible ? 0 : (Platform.OS === 'android' ? Math.min(insets.bottom, 16) : Math.max(insets.bottom, 16)) }]}>
                                <EnrichedToolbar
                                    editor={enrichedBridge}
                                    state={enrichedState}
                                    onPinPress={() => onPinChange(!isPinned)}
                                    isPinned={isPinned}
                                    onDismiss={handleClose}
                                />
                            </View>
                        )
                    ) : (
                        editorBridge && (
                            <View style={[styles.bottomBar, { paddingBottom: isKeyboardVisible ? 0 : (Platform.OS === 'android' ? Math.min(insets.bottom, 16) : Math.max(insets.bottom, 16)) }]}>
                                <TiptapToolbar
                                    editor={editorBridge}
                                    onPinPress={() => onPinChange(!isPinned)}
                                    isPinned={isPinned}
                                    onDismiss={handleClose}
                                />
                            </View>
                        )
                    )}

                    {/* Domain validation toast — absolute positioned so it
                        floats above everything regardless of where it sits in
                        the tree. */}
                    {showDomainToast && (
                        <View style={styles.domainToast}>
                            <Text style={styles.domainToastText}>{t('select_domain_before_save')}</Text>
                        </View>
                    )}
                </KeyboardAvoidingView>
            </View>
    );

    // eagerMount path: render with a permanent screen-level View overlay.
    //
    // Hiding strategy depends on the active editor implementation:
    //
    //   - USE_NATIVE_EDITOR=true (RNE): use opacity: 0. UITextView doesn't
    //     have a WebContent process to wake up and isn't subject to the
    //     iOS quirk that defers WKWebView lifecycle when opacity is 0.
    //     Opacity is cheaper than translate (no layout pass when toggling)
    //     and avoids the implicit re-layout iOS does when the view moves
    //     back into viewable bounds.
    //
    //   - USE_NATIVE_EDITOR=false (Tiptap WebView): use translateY: -100000.
    //     iOS WebKit empirically defers the WebContent process launch when
    //     a WKWebView sits at opacity=0 (treats it as "not needed yet");
    //     but it DOES launch the process when the WKWebView is in the
    //     window and translated to off-screen coordinates. The same trick
    //     is used by the legacy <EditorPrewarm />.
    if (eagerMount) {
        return (
            <View
                style={[
                    StyleSheet.absoluteFillObject,
                    USE_NATIVE_EDITOR
                        ? { zIndex: 1000, opacity: visible ? 1 : 0 }
                        : {
                              zIndex: 1000,
                              // -100000 is far enough off-screen on any
                              // device, even unfolded foldables / wide displays.
                              transform: [{ translateY: visible ? 0 : -100000 }],
                          },
                ]}
                pointerEvents={visible ? 'auto' : 'none'}
            >
                {innerContents}
            </View>
        );
    }

    // Default path: RN <Modal>. Lazy-mounts the editor on first visible=true.
    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent={true}
            onRequestClose={handleClose}
        >
            {innerContents}
        </Modal>
    );
});

EditorModal.displayName = 'EditorModal';

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        // Same gray as the centered modalSheet's background so the wings on
        // wide screens are uniform with the writing surface surround.
        backgroundColor: '#F0F2F5',
    },
    modalSheet: {
        flex: 1,
        backgroundColor: '#F0F2F5',
        // Cap the writing surface on wide screens so the editor stays
        // readable instead of stretching to ~1500 px on web.
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
    },
    domainSelectorRow: {
        flexDirection: 'row',
        // Force LTR layout so the send button stays on the trailing edge
        // (right) regardless of locale — matches the previous bottomBar.
        direction: 'ltr',
        alignItems: 'center',
        // Match the editor window's gray surround (modalSheet background) so
        // the row blends seamlessly with the area surrounding the editor.
        backgroundColor: '#F0F2F5',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 8,
    },
    // Wraps DomainSelector so it grows to fill the row, leaving the send
    // button at the trailing edge instead of stretching across.
    domainSelectorFill: {
        flex: 1,
        minWidth: 0,
    },
    // Title card — same horizontal inset and rounded corners as the editor
    // card below, so they read as a matched pair on the gray surround.
    titleContainer: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: 20,
        marginTop: 20,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    titleInput: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1A1A1A',
        ...RTL_TEXT_STYLE,
    },
    editorArea: {
        flex: 1,
        // Match titleContainer's horizontal inset. The 4 px top keeps the
        // title and editor reading as a single tight pair when both are
        // shown; the no-title fallback below uses a larger top inset so the
        // editor doesn't crowd the top of the modal in QuickAdd mode.
        marginHorizontal: 20,
        marginTop: 4,
        marginBottom: 20,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
        // The "Border Trick"
        borderWidth: 1,
        borderColor: '#FFFFFF',
    },
    // No-title flow (QuickAdd) — give the editor card more breathing room
    // above so it doesn't hug the top of the modal.
    editorAreaNoTitle: {
        marginTop: 32,
    },
    editorLoader: {
        // Sits on top of the (still-empty) editor area while the WebView and
        // Tiptap finish their cold init. backgroundColor matches editorArea so
        // the user sees a clean white surface with a spinner, not a flicker.
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    bottomBar: {
        flexDirection: 'row',
        direction: 'ltr',
        alignItems: 'center',
        // Center the toolbar group within the full-width strip — looks much
        // cleaner on wide screens where the bar would otherwise hug the left
        // edge below the centered content rail.
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
        paddingHorizontal: 4,
    },
    sendButtonModal: {
        // Matches the height of the domain chips (paddingVertical:8 + ~14
        // line-height ≈ 32 px) so the row reads as a single row of pills.
        // Touch target is expanded via hitSlop on the TouchableOpacity.
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#000000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#E8E8E8',
        shadowOpacity: 0,
        elevation: 0,
    },
    domainToast: {
        position: 'absolute',
        top: '40%',
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 24,
        zIndex: 20000,
    },
    domainToastText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
