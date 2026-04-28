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
    InteractionManager,
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
import { type EditorBridge } from '@10play/tentap-editor';
import { DomainType } from '../types/Note';
import { RTL_TEXT_STYLE } from '../utils/rtlUtils';

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
}, ref) => {
    const { t } = useTranslation();
    const [showDomainToast, setShowDomainToast] = useState(false);
    const [editorBridge, setEditorBridge] = useState<EditorBridge | null>(null);
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
            setEditorBridge(r.getEditorBridge());
        }
    }, [editorMode]);

    // Mount the SmartEditor (and its WebView) at app start — NOT on the
    // first time the user taps "new note". The WebView's cold start
    // (~300-800 ms, 2-3× more on iPad) is the dominant cost of opening
    // the editor; if it happens during the user's tap they wait for it.
    // By pre-mounting in the background while the user is browsing the
    // notes list, the editor is already alive and ready by the time they
    // tap, and the modal opens at near-zero cost.
    //
    // InteractionManager defers until React Native's interaction queue
    // is idle — so this doesn't compete with the initial notes-list
    // render. The WebView mount + Tiptap load happens silently in the
    // background between t=~100 ms and t=~600 ms after launch.
    //
    // The editor stays mounted across every open/close cycle (the modal's
    // visible prop just toggles native presentation, not the React tree),
    // so subsequent opens are also instant.
    const [shouldMountEditor, setShouldMountEditor] = useState(false);
    useEffect(() => {
        const handle = InteractionManager.runAfterInteractions(() => {
            setShouldMountEditor(true);
        });
        return () => handle.cancel();
    }, []);

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
        // Modal just opened. On the very first open editorRef is still
        // null (the editor mounts after this effect commits) and SmartEditor's
        // `initialContent` + `autoFocus` props handle setup. On every
        // subsequent open the editor is already alive and sticky — we
        // need to push the parent's text in and re-focus manually, since
        // the autoFocus prop only takes effect on the editor's first mount.
        if (editorRef.current) {
            editorRef.current.setText?.(textRef.current);
            // Defer focus to next tick so the setText bridge command is
            // dispatched first and queued ahead of focus on the WebView.
            setTimeout(() => editorRef.current?.focus?.(), 0);
        }
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
    // Hide the spinner the moment the editor reports ready.
    useEffect(() => {
        if (editorReady) setShowLoader(false);
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

    return (
        <Modal
            visible={visible}
            // "fade" is roughly half the cost of "slide" on the JS+native
            // bridge while still giving a clean visual transition. The slide
            // animation interleaves layout work with the WebView mount and
            // measurably delays the editor becoming interactive.
            animationType="fade"
            transparent={true}
            onRequestClose={handleClose}
        >
            <View style={[styles.modalOverlay, { paddingTop: insets.top }]}>
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior="padding"
                    keyboardVerticalOffset={0}
                >
                    {/* Tap backdrop to close */}
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1} />

                    <View style={styles.modalSheet}>
                        {/* Optional title input */}
                        {showTitle && (
                            <View style={styles.titleContainer}>
                                <TextInput
                                    style={[styles.titleInput, { writingDirection: 'auto', textAlign: 'auto' }]}
                                    value={title}
                                    onChangeText={onTitleChange}
                                    placeholder={t('title_placeholder')}
                                    placeholderTextColor="#999"
                                />
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
                                    placeholder=""
                                    autoFocus={true}
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
                        being awkwardly capped at the 720 px content rail. */}
                    {editorBridge && (
                        <View style={[styles.bottomBar, { paddingBottom: isKeyboardVisible ? 0 : Math.max(insets.bottom, 16) }]}>
                            <TiptapToolbar
                                editor={editorBridge}
                                onPinPress={() => onPinChange(!isPinned)}
                                isPinned={isPinned}
                                onDismiss={handleClose}
                            />
                        </View>
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
