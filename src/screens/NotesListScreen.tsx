import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
    View,
    FlatList,
    StyleSheet,
    TouchableOpacity,
    Text,
    Platform,
    Keyboard,
    RefreshControl,
    AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotesStore } from '../stores/notesStore';
import { NoteCard } from '../components/NoteCard';
import { updateFrontmatter, removeFrontmatterKey } from '../services/FrontmatterService';
import FrontmatterService from '../services/FrontmatterService';
import { handleListContinuation } from '../utils/markdownUtils';
import { RTL_TEXT_STYLE } from '../utils/rtlUtils';
import { Header } from '../components/Header';
import { QuickAddInput, QuickAddInputRef } from '../components/QuickAddInput';
import { EditorModal, EditorModalRef } from '../components/EditorModal';
import { EmptyNotesList } from '../components/EmptyNotesList';
import { Note, DomainType } from '../types/Note';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

export const NotesListScreen = ({ navigation }: any) => {
    const {
        filteredNotes,
        isLoading,
        error,
        loadNotes,
        searchNotes,
        archiveNote,
        createNote,
        updateNote,
        refreshSort,
        currentDomain,
        filterByDomain,
        settings,
        isVaultPermissionGranted,
        reconnectWebVault,
    } = useNotesStore();

    const [quickNoteText, setQuickNoteText] = useState('');
    const [quickNotePinned, setQuickNotePinned] = useState(false);
    const [quickNoteDomain, setQuickNoteDomain] = useState<DomainType | null>(null);
    const [isSending, setIsSending] = useState(false);
    const { keyboardVisible, keyboardHeight } = useKeyboardHeight();
    const [refreshing, setRefreshing] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [isQuickNoteActive, setIsQuickNoteActive] = useState(false);
    const appState = useRef(AppState.currentState);
    const quickAddInputRef = useRef<QuickAddInputRef>(null);
    const flatListRef = useRef<FlatList>(null);
    const insets = useSafeAreaInsets();
    const [showToast, setShowToast] = useState(false);

    // ── Edit-note modal state ─────────────────────────────────────────────
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editModalNote, setEditModalNote] = useState<Note | null>(null);
    const [editModalBody, setEditModalBody] = useState('');
    const [editModalTitle, setEditModalTitle] = useState('');
    const [editModalDomain, setEditModalDomain] = useState<DomainType | null>(null);
    const [editModalPinned, setEditModalPinned] = useState(false);
    const [editModalSaving, setEditModalSaving] = useState(false);
    const editModalOtherFm = useRef<Record<string, any>>({});
    const editModalRef = useRef<EditorModalRef>(null);

    // Initial load: fetch notes & draft
    useEffect(() => {
        loadNotes();
        
        const loadDraft = async () => {
            try {
                const draftStr = await AsyncStorage.getItem('quickNoteDraft');
                if (draftStr) {
                    const draft = JSON.parse(draftStr);
                    if (draft.text) {
                        setQuickNoteText(draft.text);
                        // Make sure EditorModal sees this text when opened next time
                        setTimeout(() => quickAddInputRef.current?.setTextAndSelection(draft.text, {start: draft.text.length, end: draft.text.length}), 100);
                    }
                    if (draft.isPinned !== undefined) setQuickNotePinned(draft.isPinned);
                    if (draft.domain !== undefined) setQuickNoteDomain(draft.domain);
                }
            } catch (e) {
                console.error('Failed to load quick note draft', e);
            }
        };
        loadDraft();
    }, []);

    // Save draft persistently when changed
    useEffect(() => {
        const saveDraft = async () => {
            try {
                const draft = { text: quickNoteText, isPinned: quickNotePinned, domain: quickNoteDomain };
                await AsyncStorage.setItem('quickNoteDraft', JSON.stringify(draft));
            } catch (e) {
                console.error('Failed to save quick note draft', e);
            }
        };
        // Debounce or just save directly
        saveDraft();
    }, [quickNoteText, quickNotePinned, quickNoteDomain]);

    const [shouldOpenQuickAdd, setShouldOpenQuickAdd] = useState(false);

    // Handle deep links (e.g., from iOS Widget)
    useEffect(() => {
        const handleUrl = (url: string | null) => {
            if (url && url.includes('obsidiannotes://add')) {
                setShouldOpenQuickAdd(true);
            }
        };

        // Handle URL that opened the app
        Linking.getInitialURL().then((url) => {
            if (url) handleUrl(url);
        });

        // Listen for URLs when app is in background/foreground
        const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
            if (url) handleUrl(url);
        });

        return () => {
            linkingSubscription.remove();
        };
    }, []);

    // Try opening the modal reliably when state is set
    useEffect(() => {
        if (!shouldOpenQuickAdd) return;

        let retryCount = 0;
        const openWhenReady = () => {
            if (quickAddInputRef.current) {
                quickAddInputRef.current.openModal();
                setShouldOpenQuickAdd(false); // reset
            } else if (retryCount < 10) {
                retryCount++;
                setTimeout(openWhenReady, 100);
            } else {
                setShouldOpenQuickAdd(false); // give up after 1s
            }
        };
        openWhenReady();
    }, [shouldOpenQuickAdd]);

    // Handle AppState changes (Auto-refresh on foreground)
    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                loadNotes();
            }

            appState.current = nextAppState;
        });

        return () => {
            subscription.remove();
        };
    }, [loadNotes]);

    // Handle keyboard dismiss (hide bottom section if needed)
    useEffect(() => {
        const hideListener = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            async () => {
                setIsQuickNoteActive(false);

                if (isSending) return;
                if (editModalVisible) return;
                // Draft discarding removed - saves in background instead!
            }
        );

        return () => {
            hideListener.remove();
        };
    }, [isSending, editModalVisible]);

    // Handle text change with list/checkbox continuation
    const handleTextChangeWithListContinuation = useCallback((
        newText: string,
        oldText: string,
        setText: (text: string) => void,
    ) => {
        // Skip for web platform as Tiptap handles its own list logic
        // and this helper interferes with the Markdown output from SmartEditor.
        if (Platform.OS === 'web') {
            setText(newText);
            return;
        }

        const result = handleListContinuation(newText, oldText);

        if (result) {
            if (result.cursorShouldMove) {
                const newSelection = { start: result.newCursorPos, end: result.newCursorPos };
                if (setText === setQuickNoteText) {
                    quickAddInputRef.current?.setTextAndSelection(result.modifiedText, newSelection);
                }
            }
            setText(result.modifiedText);
        } else {
            setText(newText);
        }
    }, [setQuickNoteText]);

    // Handle inline note update
    const handleUpdateNote = useCallback(async (note: Note, newContent: string) => {
        try {
            await updateNote(note.id, note.filePath, newContent);
        } catch (error) {
            console.error('Error updating note:', error);
        }
    }, [updateNote]);

    const handleArchive = async (note: Note) => {
        await archiveNote(note.filePath);
    };

    const handleSettings = () => {
        navigation.navigate('Settings');
    };

    // Generate filename from current date with seconds
    const generateFilename = (): string => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
    };

    // Send quick note
    const handleSendNote = async () => {
        const text = quickNoteText.trim();
        if (!text || isSending) return;

        if (!quickNoteDomain) {
            setShowToast(true);
            setTimeout(() => {
                setShowToast(false);
            }, 1000);
            return;
        }

        setIsSending(true);

        try {
            const lines = text.split('\n');
            const firstLine = lines[0];
            if (!firstLine.startsWith('#')) {
                lines[0] = '# ' + firstLine;
            }
            let formattedText = lines.join('\n');

            if (quickNotePinned) {
                formattedText = updateFrontmatter(formattedText, 'pinned', true);
            }

            if (quickNoteDomain) {
                formattedText = updateFrontmatter(formattedText, 'domain', quickNoteDomain);
            }

            const filename = generateFilename();
            await createNote(filename, formattedText);

            Keyboard.dismiss();
            quickAddInputRef.current?.blur();
            quickAddInputRef.current?.clear();
            setQuickNoteText('');
            setQuickNotePinned(false);
            setQuickNoteDomain(null);
            AsyncStorage.removeItem('quickNoteDraft').catch(() => {});

            await loadNotes();
        } catch (error) {
            console.error('Error creating quick note:', error);
        } finally {
            setIsSending(false);
        }
    };

    // ── Open edit modal for an existing note ──────────────────────────────
    const openEditModal = useCallback((note: Note) => {
        const parsed = FrontmatterService.parseFrontmatter(note.content);
        const { domain: d, pinned: p, ...otherFm } = parsed.frontmatter;

        // Extract title from first line if it starts with #
        const lines = parsed.body.split('\n');
        const firstLine = lines[0] || '';
        const hasTitle = firstLine.startsWith('#');
        const titleText = hasTitle ? firstLine.replace(/^#+\s*/, '').trim() : '';
        const bodyWithoutTitle = hasTitle ? lines.slice(1).join('\n') : parsed.body;

        setEditModalNote(note);
        setEditModalTitle(titleText);
        setEditModalBody(bodyWithoutTitle);
        setEditModalDomain((d as DomainType) || null);
        setEditModalPinned(p === true);
        editModalOtherFm.current = otherFm;
        setEditModalVisible(true);
    }, []);

    // ── Save edited note from modal ──────────────────────────────────────
    const handleEditModalSave = async () => {
        if (!editModalNote) return;
        setEditModalSaving(true);

        try {
            // Reconstruct body with title as first line
            let body = editModalBody;
            if (editModalTitle.trim()) {
                body = '# ' + editModalTitle.trim() + '\n' + body;
            }

            let fullContent = FrontmatterService.composeContent(
                { ...editModalOtherFm.current, domain: editModalDomain },
                body
            );

            if (editModalPinned) {
                fullContent = updateFrontmatter(fullContent, 'pinned', true);
            } else {
                fullContent = removeFrontmatterKey(fullContent, 'pinned');
            }

            await updateNote(editModalNote.id, editModalNote.filePath, fullContent);

            setEditModalVisible(false);
            refreshSort();
            await loadNotes();
        } catch (error) {
            console.error('Error saving edited note:', error);
        } finally {
            setEditModalSaving(false);
        }
    };

    const handleEditModalClose = () => {
        // Auto-save on close
        handleEditModalSave();
    };

    const renderRightActions = (_progress: any, _dragX: any, item: Note) => {
        return (
            <TouchableOpacity
                style={styles.archiveAction}
                onPress={() => handleArchive(item)}
            >
                <Ionicons name="archive-outline" size={24} color="#FFF" />
                <Text style={styles.archiveText}>לארכיון</Text>
            </TouchableOpacity>
        );
    };

    const renderNote = useCallback(({ item }: { item: Note }) => {
        return (
            <View style={{ marginBottom: 12 }}>
                <Swipeable
                    renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
                >
                    <NoteCard
                        note={item}
                        style={{ marginBottom: 0 }}
                        onUpdate={(content) => handleUpdateNote(item, content)}
                        onArchive={() => handleArchive(item)}
                        onEditRequest={() => openEditModal(item)}
                        onQuickAddRequest={() => openEditModal(item)}
                    />
                </Swipeable>
            </View>
        );
    }, [handleUpdateNote, openEditModal]);

    return (
        <View style={styles.container}>
            {/* Header / Search & Domain */}
            <Header
                title="הפתקים שלי"
                onSettingsPress={handleSettings}
                onSearch={searchNotes}
                onSearchFocus={() => setIsSearchFocused(true)}
                onSearchBlur={() => setIsSearchFocused(false)}
                isSearchFocused={isSearchFocused}
                currentDomain={currentDomain}
                onFilterByDomain={filterByDomain}
                hideSearchAndDomain={isQuickNoteActive}
                showReconnect={Platform.OS === 'web' && !!settings.vault && !isVaultPermissionGranted}
                onReconnect={reconnectWebVault}
            />

            {/* Notes List */}
            <FlatList
                ref={flatListRef}
                style={{ flex: 1 }}
                data={filteredNotes}
                renderItem={renderNote}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[
                    styles.listContent,
                    { paddingBottom: keyboardVisible ? keyboardHeight + 160 : 120 }
                ]}
                ListEmptyComponent={<EmptyNotesList isLoading={isLoading} />}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={async () => {
                            setRefreshing(true);
                            await loadNotes();
                            setRefreshing(false);
                        }}
                        colors={['#6200EE']}
                        tintColor="#6200EE"
                    />
                }
                onScrollToIndexFailed={(info) => {
                    setTimeout(() => {
                        flatListRef.current?.scrollToOffset({
                            offset: info.averageItemLength * info.index,
                            animated: true,
                        });
                    }, 100);
                }}
            />

            {/* Bottom Section - Quick Note Input */}
            {!isSearchFocused && (
                <View
                    pointerEvents="box-none"
                    style={[
                        styles.bottomSection,
                        keyboardVisible
                            ? { bottom: keyboardHeight }
                            : { bottom: 0 }
                    ]}
                >
                    <QuickAddInput
                        ref={quickAddInputRef}
                        text={quickNoteText}
                        isPinned={quickNotePinned}
                        domain={quickNoteDomain}
                        isSending={isSending}
                        bottomPadding={insets.bottom > 0 ? insets.bottom : 16}
                        onTextChange={(text) => handleTextChangeWithListContinuation(text, quickNoteText, setQuickNoteText)}
                        onPinChange={(newPinned) => {
                            setQuickNotePinned(newPinned);
                        }}
                        onDomainChange={setQuickNoteDomain}
                        onSend={handleSendNote}
                        onFocus={() => setIsQuickNoteActive(true)}
                        onBlur={() => setIsQuickNoteActive(false)}
                    />
                </View>
            )}

            {/* Edit Note Modal — same UI as QuickAddInput modal */}
            <EditorModal
                ref={editModalRef}
                visible={editModalVisible}
                text={editModalBody}
                domain={editModalDomain}
                isPinned={editModalPinned}
                isSaving={editModalSaving}
                onTextChange={setEditModalBody}
                onDomainChange={setEditModalDomain}
                onPinChange={setEditModalPinned}
                onSave={handleEditModalSave}
                onClose={handleEditModalClose}
                title={editModalTitle}
                onTitleChange={setEditModalTitle}
                showTitle={true}
                compactDomain
            />

            {/* Error Message */}
            {error && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            {/* Validation Toast */}
            {showToast && (
                <View style={styles.toast}>
                    <Text style={styles.toastText}>יש לבחור תחום לפני השמירה</Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9F9F9',
    },
    bottomSection: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 100,
    },
    listContent: {
        padding: 20,
        paddingBottom: 120,
    },
    archiveAction: {
        backgroundColor: '#FF9800',
        justifyContent: 'center',
        alignItems: 'center',
        width: 80,
        height: '100%',
        borderRadius: 16,
    },
    archiveText: {
        color: '#FFFFFF',
        fontSize: 12,
        marginTop: 4,
        fontWeight: '500',
    },
    errorContainer: {
        position: 'absolute',
        bottom: 120,
        left: 20,
        right: 20,
        backgroundColor: '#F44336',
        padding: 12,
        borderRadius: 8,
    },
    errorText: {
        color: '#FFFFFF',
        textAlign: 'center',
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
