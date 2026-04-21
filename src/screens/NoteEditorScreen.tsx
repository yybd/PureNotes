// NoteEditorScreen.tsx - TenTap Rich Text Editor
// True WYSIWYG: shows formatted text, saves markdown to file
// Toolbar floats above keyboard, RTL support

import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    TextInput,
    TouchableOpacity,
    Text,
    SafeAreaView,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SmartEditor, SmartEditorRef } from '../components/SmartEditor';
import { MarkdownToolbar } from '../components/MarkdownToolbar';
import { TiptapToolbar } from '../components/TiptapToolbar';
import { type EditorBridge } from '@10play/tentap-editor';
import { DomainSelector } from '../components/DomainSelector';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNotesStore } from '../stores/notesStore';
import { Note, DomainType } from '../types/Note';
import FrontmatterService, { updateFrontmatter, removeFrontmatterKey } from '../services/FrontmatterService';
import { RTL_TEXT_STYLE } from '../utils/rtlUtils';
import { appendChecklistItem, handleListContinuation } from '../utils/markdownUtils';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

export const NoteEditorScreen = ({ navigation, route }: any) => {
    // Safe Area Insets for bottom padding
    const insets = useSafeAreaInsets();
    const existingNoteFromRoute = route.params?.note;
    const { createNote, updateNote, settings } = useNotesStore();
    // [INACTIVE] editorMode — תמיד richtext, בחירת מצב מושבתת (אבל משתמשים ב-settings כדי למנוע שגיאות טיפוס)
    const editorMode = settings.editorMode || 'richtext';

    // Parse content immediately to separate frontmatter from body
    // We use a ref or simple const because route params don't change
    const initialParse = useRef(
        existingNoteFromRoute?.content
            ? FrontmatterService.parseFrontmatter(existingNoteFromRoute.content)
            : { frontmatter: {}, body: '' }
    ).current;

    // Checklist detection
    const [hasChecklist, setHasChecklist] = useState(false);

    // Domain & Frontmatter state
    const [domain, setDomain] = useState<DomainType | null>(initialParse.frontmatter.domain as DomainType || null);
    const [isPinned, setIsPinned] = useState<boolean>(initialParse.frontmatter.pinned === true);
    const [otherFrontmatter, setOtherFrontmatter] = useState<Record<string, any>>(() => {
        const { domain: _, ...others } = initialParse.frontmatter;
        return others;
    });
    const [showToast, setShowToast] = useState(false);

    const [editorInstance, setEditorInstance] = useState<SmartEditorRef | null>(null);
    const [editorBridge, setEditorBridge] = useState<EditorBridge | null>(null);
    // Refs for accessing state in closures (TenTap bridge callbacks)
    const domainRef = useRef(domain);
    const otherFrontmatterRef = useRef(otherFrontmatter);
    const isPinnedRef = useRef(isPinned);

    useEffect(() => {
        domainRef.current = domain;
    }, [domain]);

    useEffect(() => {
        isPinnedRef.current = isPinned;
    }, [isPinned]);

    useEffect(() => {
        otherFrontmatterRef.current = otherFrontmatter;
    }, [otherFrontmatter]);

    const [title, setTitle] = useState(existingNoteFromRoute?.title || '');
    const [savingStatus, setSavingStatus] = useState<'saved' | 'saving' | 'error'>('saved');
    const lastSavedContent = useRef(existingNoteFromRoute?.content || '');
    const cssInjected = useRef(false);

    // Track the current note (either from route or after first create)
    const currentNoteRef = useRef<Note | null>(existingNoteFromRoute || null);
    const editorRef = useRef<SmartEditorRef>(null);

    // Initial content (Body only)
    const initialBody = initialParse.body || '';
    const [bodyText, setBodyTextState] = useState(initialBody);
    const lastProcessedTextRef = useRef(initialBody);
    const [selection, setSelection] = useState({ start: initialBody.length, end: initialBody.length });

    // Custom setter for bodyText to also update lastProcessedTextRef
    const setBodyText = (newBody: string) => {
        setBodyTextState(newBody);
        lastProcessedTextRef.current = newBody;
    };

    // Initialize checklist state
    useEffect(() => {
        setHasChecklist(/[-\*]\s?\[[ x]\]/i.test(initialBody));
    }, [initialBody]);

    // Keyboard state
    const { keyboardVisible: isKeyboardVisible, keyboardHeight } = useKeyboardHeight();

    const handleEditorChange = (rawBodyMarkdown: string) => {
        let bodyMarkdown = rawBodyMarkdown;

        // List continuation is a markdown-only concern — Tiptap handles Enter natively.
        if (editorMode === 'markdown') {
            const result = handleListContinuation(rawBodyMarkdown, lastProcessedTextRef.current);
            if (result) {
                bodyMarkdown = result.modifiedText;
                lastProcessedTextRef.current = result.modifiedText;
                if (result.cursorShouldMove) {
                    const newSelection = { start: result.newCursorPos, end: result.newCursorPos };
                    setSelection(newSelection);
                    editorRef.current?.setTextAndSelection?.(result.modifiedText, newSelection);
                } else {
                    editorRef.current?.setText?.(result.modifiedText);
                }
            } else {
                lastProcessedTextRef.current = bodyMarkdown;
            }
        } else {
            lastProcessedTextRef.current = bodyMarkdown;
        }

        setBodyText(bodyMarkdown);
        setSavingStatus('saved'); // It's visually 'saved' but only persists on back/done

        // Update checklist state immediately for UI
        const detected = /\[[ xX]\]/i.test(bodyMarkdown);
        setHasChecklist(detected);
    };

    useEffect(() => {
        navigation.setOptions({
            headerShown: false,
        });
    }, []);

    const handleBack = async () => {
        // Get final content and save
        try {
            const bodyMarkdown = await editorRef.current?.getMarkdown() || '';

            let fullContent = FrontmatterService.composeContent(
                { ...otherFrontmatterRef.current, domain: domain },
                bodyMarkdown
            );

            // Apply pinned state
            if (isPinned) {
                fullContent = updateFrontmatter(fullContent, 'pinned', true);
            } else {
                fullContent = removeFrontmatterKey(fullContent, 'pinned');
            }

            if (title.trim() && fullContent !== lastSavedContent.current) {
                if (currentNoteRef.current) {
                    await updateNote(
                        currentNoteRef.current.id,
                        currentNoteRef.current.filePath,
                        fullContent
                    );
                } else {
                    await createNote(title, fullContent);
                }
            }
        } catch (error) {
            console.error('Final save error:', error);
        }

        navigation.goBack();
    };

    const handleAddItem = async () => {
        try {
            const bodyMarkdown = bodyText;
            const newBodyMarkdown = appendChecklistItem(bodyMarkdown);

            if (newBodyMarkdown !== bodyMarkdown) {
                setBodyText(newBodyMarkdown);
                editorRef.current?.focus();

                // Trigger save
                if (currentNoteRef.current) {
                    let fullContent = FrontmatterService.composeContent(
                        { ...otherFrontmatterRef.current, domain: domainRef.current },
                        newBodyMarkdown
                    );

                    // Apply pinned state
                    if (isPinnedRef.current) {
                        fullContent = updateFrontmatter(fullContent, 'pinned', true);
                    } else {
                        fullContent = removeFrontmatterKey(fullContent, 'pinned');
                    }

                    await updateNote(
                        currentNoteRef.current.id,
                        currentNoteRef.current.filePath,
                        fullContent
                    );
                    lastSavedContent.current = fullContent;
                }
            }
        } catch (error) {
            console.error('Error adding item:', error);
        }
    };

    // Render saving status indicator
    const renderSavingStatus = () => {
        if (savingStatus === 'saving') {
            return <ActivityIndicator size="small" color="#6200EE" />;
        } else if (savingStatus === 'error') {
            return <Ionicons name="alert-circle" size={20} color="#F44336" />;
        }
        return <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />;
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
        >
            {/* Custom Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={handleBack} style={styles.headerButton}>
                    <Ionicons name="arrow-back" size={24} color="#6200EE" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>עריכת פתק</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity
                        onPress={() => {
                            const newPinned = !isPinned;
                            setIsPinned(newPinned);
                            // Trigger save to persist metadata immediately
                            setSavingStatus('saving');

                            // We need to update the content with the new pin state
                            // But we can't easily get the *current* editor content here without async
                            // So we'll update our internal refs and let the next auto-save or back action handle the content
                            // However, we should try to update the frontmatter in our refs at least

                            // Best approach for immediate feedback:
                            // 1. Update state (done)
                            // 2. We'll inject this into the content during save/back
                        }}
                        style={styles.headerButton}
                    >
                        <MaterialCommunityIcons
                            name={isPinned ? "pin" : "pin-outline"}
                            size={24}
                            color={isPinned ? "#FFC107" : "#666"}
                        />
                    </TouchableOpacity>
                    <View style={styles.statusContainer}>
                        {renderSavingStatus()}
                    </View>
                </View>
            </View>

            {/* Title Input */}
            <View style={styles.titleContainer}>
                <TextInput
                    style={[
                        styles.titleInput,
                        { writingDirection: 'auto', textAlign: 'auto' }
                    ]}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="כותרת הפתק"
                    placeholderTextColor="#999"
                />
            </View>

            {/* Domain Selector */}
            {isKeyboardVisible && (
                <View style={styles.domainContainer}>
                    <DomainSelector
                        selectedDomain={domain}
                        onSelectDomain={setDomain}
                        compact
                    />
                </View>
            )}

            {/* Rich Text Editor — WebView grows with content via dynamicHeight */}
            <View style={styles.editorScrollView}>
                <SmartEditor
                    ref={(ref) => {
                        editorRef.current = ref;
                        if (ref && ref !== editorInstance) {
                            setEditorInstance(ref);
                            if (editorMode === 'richtext') {
                                setEditorBridge(ref.getEditorBridge());
                            }
                        }
                    }}
                    initialContent={bodyText}
                    onChange={handleEditorChange}
                    onSelectionChange={(e: any) => setSelection(e.nativeEvent.selection)}
                    autoFocus={true}
                    backgroundColor="#FFFFFF"
                />
            </View>

            {/* Toolbar — in flow, sits above keyboard thanks to KeyboardAvoidingView */}
            <View style={[styles.toolbarWrapper, { paddingBottom: isKeyboardVisible ? 0 : Math.max(insets.bottom, 16) }]}>
                {/* [INACTIVE] markdown toolbar — מושבת, תמיד משתמשים ב-richtext
                {editorMode === 'markdown' ? (
                    <MarkdownToolbar
                        inputRef={editorRef as any}
                        text={bodyText}
                        onTextChange={(newText: string) => {
                            setBodyText(newText);
                            handleEditorChange(newText);
                        }}
                        selection={selection}
                        onSelectionChangeRequest={setSelection}
                    />
                ) : */}
                {editorBridge ? (
                    <TiptapToolbar
                        editor={editorBridge}
                        onPinPress={() => setIsPinned(!isPinned)}
                        isPinned={isPinned}
                    />
                ) : null}
            </View>

            {/* Helper FAB for adding checklist items */}
            {hasChecklist && !isKeyboardVisible && (
                <TouchableOpacity
                    onPress={handleAddItem}
                    style={styles.fab}
                >
                    <Ionicons name="add" size={30} color="#FFFFFF" />
                </TouchableOpacity>
            )}
        </KeyboardAvoidingView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F0F2F5',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1A1A1A',
    },
    headerButton: {
        padding: 8,
    },
    statusContainer: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    titleContainer: {
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    domainContainer: {
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 0,
        paddingTop: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    titleInput: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1A1A1A',
        ...RTL_TEXT_STYLE,
    },
    editorScrollView: {
        flex: 1,
        margin: 12,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
    },
    toolbarWrapper: {
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
    },
    toolbarContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        gap: 12,
    },
    toolbarButton: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: '#F5F5F5',
        minWidth: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fab: {
        position: 'absolute',
        bottom: 110, // Just above the toolbar area
        left: 24, // Left side as requested by user
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#6200EE',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 6,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 3,
        },
        shadowOpacity: 0.27,
        shadowRadius: 4.65,
        zIndex: 30000,
    },
    toast: {
        position: 'absolute',
        top: '50%',
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 24,
        zIndex: 20000,
    },
    toastText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
