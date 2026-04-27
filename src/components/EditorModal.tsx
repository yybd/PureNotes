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

    // Reset bridge when modal hides
    useEffect(() => {
        if (!visible) {
            setEditorBridge(null);
            setEditorInstance(null);
        }
    }, [visible]);

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

    return (
        <Modal
            visible={visible}
            animationType="slide"
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
                        {/* Header row */}
                        <View style={styles.modalHeader}>
                            <DomainSelector
                                selectedDomain={domain}
                                onSelectDomain={onDomainChange}
                                mode="select"
                                compact={compactDomain}
                            />
                        </View>

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

                        {/* Editor fills remaining space */}
                        <View style={styles.editorArea}>
                            <SmartEditor
                                ref={handleEditorRef}
                                initialContent={text}
                                onChange={onTextChange}
                                placeholder=""
                                autoFocus={true}
                                backgroundColor="#FFFFFF"
                                style={{ flex: 1 }}
                            />
                        </View>

                        {/* Toolbar + Save */}
                        <View style={[styles.bottomBar, { paddingBottom: isKeyboardVisible ? 0 : Math.max(insets.bottom, 16) }]}>
                            {editorBridge ? (
                                <TiptapToolbar
                                    editor={editorBridge}
                                    onPinPress={() => onPinChange(!isPinned)}
                                    isPinned={isPinned}
                                    onDismiss={handleClose}
                                />
                            ) : null}

                            <TouchableOpacity
                                style={[styles.sendButtonModal, (!text.trim() || isSaving) && styles.sendButtonDisabled]}
                                onPress={handleSave}
                                disabled={!text.trim() || isSaving}
                            >
                                {isSaving
                                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                                    : <Ionicons name="send" size={20} color="#FFFFFF" />}
                            </TouchableOpacity>
                        </View>

                        {/* Domain validation toast */}
                        {showDomainToast && (
                            <View style={styles.domainToast}>
                                <Text style={styles.domainToastText}>{t('select_domain_before_save')}</Text>
                            </View>
                        )}
                    </View>
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
        backgroundColor: '#FFFFFF',
    },
    modalSheet: {
        flex: 1,
        backgroundColor: '#F0F2F5',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    titleContainer: {
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
        paddingHorizontal: 20,
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
        margin: 20,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
        // The "Border Trick"
        borderWidth: 1,
        borderColor: '#FFFFFF',
    },
    bottomBar: {
        flexDirection: 'row',
        direction: 'ltr',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
        paddingHorizontal: 4,
    },
    sendButtonModal: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#000000',
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 8,
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
