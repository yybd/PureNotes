import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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

// Stacked-View gradient — a stack of horizontal strips with decreasing
// rgba alpha builds a smooth fade without depending on SVG (which had
// inconsistent sizing on iPad/web due to viewBox + preserveAspectRatio
// interactions). Pure RN primitives, identical behavior on every platform.
const FADE_COLOR = '240, 242, 245'; // #F0F2F5 in rgb
const FADE_STEPS = 12;
const ScrollFade: React.FC<{
    style: any;
    /** Which edge holds the solid color. The opposite edge is transparent. */
    solidEdge: 'top' | 'bottom';
}> = ({ style, solidEdge }) => {
    return (
        <View style={style} pointerEvents="none">
            {Array.from({ length: FADE_STEPS }).map((_, i) => {
                // Strip 0 sits at the top; strip N-1 at the bottom. Compute
                // its alpha based on which edge should be solid.
                const fromTop = i / (FADE_STEPS - 1);
                const alpha = solidEdge === 'top' ? 1 - fromTop : fromTop;
                return (
                    <View
                        key={i}
                        style={{
                            flex: 1,
                            backgroundColor: `rgba(${FADE_COLOR}, ${alpha})`,
                        }}
                    />
                );
            })}
        </View>
    );
};

export const NotesListScreen = ({ navigation }: any) => {
    const { t } = useTranslation();
    const {
        notes,
        filteredNotes,
        isLoading,
        error,
        loadNotes,
        searchNotes,
        archiveNote,
        createNote,
        updateNote,
        currentDomain,
        filterByDomain,
        settings,
        isVaultPermissionGranted,
        reconnectWebVault,
        lockNote,
        unlockNote,
    } = useNotesStore();

    const domainCounts = notes.reduce((acc, note) => {
        if (note.domain) {
            acc[note.domain] = (acc[note.domain] || 0) + 1;
        }
        return acc;
    }, {} as Record<DomainType, number>);

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
            if (url && url.includes('purenotes://add')) {
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

    // Handle keyboard dismiss (hide bottom section and discard draft)
    useEffect(() => {
        const hideListener = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            async () => {
                setIsQuickNoteActive(false);

                if (isSending) return;
                if (editModalVisible) return;

                if (quickNoteText) {
                    quickAddInputRef.current?.clear();
                    setQuickNoteText('');
                    setQuickNotePinned(false);
                    setQuickNoteDomain(null);
                    AsyncStorage.removeItem('quickNoteDraft').catch(() => {});
                }
            }
        );

        return () => {
            hideListener.remove();
        };
    }, [isSending, editModalVisible, quickNoteText]);

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
    // `freshContent` (when provided) is the editor's live content captured by
    // EditorModal — preferred over quickNoteText state which may trail the
    // editor by one debounce cycle (~150ms) while typing.
    const handleSendNote = async (freshContent?: string) => {
        const sourceText = freshContent !== undefined ? freshContent : quickNoteText;
        const text = sourceText.trim();
        if (!text || isSending) return;

        if (!quickNoteDomain) {
            setShowToast(true);
            setTimeout(() => {
                setShowToast(false);
            }, 1000);
            return;
        }

        // Build content snapshot upfront so UI can be cleared immediately
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

        // Optimistic UI: clear input + dismiss keyboard immediately so the
        // user gets instant feedback. Persistence happens in the background.
        setIsSending(true);
        Keyboard.dismiss();
        quickAddInputRef.current?.blur();
        quickAddInputRef.current?.clear();
        setQuickNoteText('');
        setQuickNotePinned(false);
        setQuickNoteDomain(null);
        AsyncStorage.removeItem('quickNoteDraft').catch(() => {});

        try {
            // createNote already updates the store, so no extra loadNotes() needed.
            await createNote(filename, formattedText);
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

    // Prevent background sync from clobbering the note while the edit modal is open.
    // Releases automatically on any close path (save, dismiss, unmount).
    useEffect(() => {
        if (editModalVisible && editModalNote) {
            const id = editModalNote.id;
            lockNote(id);
            return () => unlockNote(id);
        }
    }, [editModalVisible, editModalNote, lockNote, unlockNote]);

    // ── Save edited note from modal ──────────────────────────────────────
    // Optimistic: builds content snapshot, closes modal immediately, then
    // persists in the background. updateNote already updates the store, so
    // refreshSort() / loadNotes() are not needed on this path.
    // `freshBody` (when provided) is the editor's live content captured by
    // EditorModal — preferred over editModalBody state which may trail the
    // editor by one debounce cycle (~150ms) while typing.
    const handleEditModalSave = (freshBody?: string) => {
        if (!editModalNote) return;

        // Snapshot all values before clearing modal state
        const noteToSave = editModalNote;
        const titleSnapshot = editModalTitle;
        const bodySnapshot = freshBody !== undefined ? freshBody : editModalBody;
        const domainSnapshot = editModalDomain;
        const pinnedSnapshot = editModalPinned;
        const otherFmSnapshot = editModalOtherFm.current;

        // Reconstruct body with title as first line
        let body = bodySnapshot;
        if (titleSnapshot.trim()) {
            body = '# ' + titleSnapshot.trim() + '\n' + body;
        }

        let fullContent = FrontmatterService.composeContent(
            { ...otherFmSnapshot, domain: domainSnapshot },
            body
        );

        if (pinnedSnapshot) {
            fullContent = updateFrontmatter(fullContent, 'pinned', true);
        } else {
            fullContent = removeFrontmatterKey(fullContent, 'pinned');
        }

        // Close modal immediately for instant UI response
        setEditModalVisible(false);

        // Persist in background — store update happens inside updateNote
        updateNote(noteToSave.id, noteToSave.filePath, fullContent).catch((error) => {
            console.error('Error saving edited note:', error);
        });
    };

    const handleEditModalClose = (freshBody?: string) => {
        // Auto-save on close, using fresh content from the editor when available
        handleEditModalSave(freshBody);
    };

    const renderRightActions = (_progress: any, _dragX: any, item: Note) => {
        return (
            <TouchableOpacity
                style={styles.archiveAction}
                onPress={() => handleArchive(item)}
            >
                <Ionicons name="archive-outline" size={24} color="#FFF" />
                <Text style={styles.archiveText}>{t('to_archive')}</Text>
            </TouchableOpacity>
        );
    };

    const renderNote = useCallback(({ item }: { item: Note }) => {
        return (
            <View style={{ marginBottom: 12 }}>
                <Swipeable
                    renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
                    containerStyle={{ overflow: 'visible' }}
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
                title={t('main_title')}
                onSettingsPress={handleSettings}
                onSearch={searchNotes}
                onSearchFocus={() => setIsSearchFocused(true)}
                onSearchBlur={() => setIsSearchFocused(false)}
                isSearchFocused={isSearchFocused}
                currentDomain={currentDomain}
                onFilterByDomain={filterByDomain}
                domainCounts={domainCounts}
                hideSearchAndDomain={isQuickNoteActive}
                showReconnect={Platform.OS === 'web' && !!settings.vault && !isVaultPermissionGranted}
                onReconnect={reconnectWebVault}
            />

            {/* Notes List — wrapped so we can lay a top blur over its first
                visible row. Notes scroll behind the blur for a soft fade. */}
            <View style={styles.listWrapper}>
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
                // Virtualization tuning: keep memory + JS work bounded for
                // large vaults. Render ~10 items per batch and a 10-screen
                // window. removeClippedSubviews trims native views that have
                // scrolled out of the viewport.
                initialNumToRender={8}
                maxToRenderPerBatch={6}
                updateCellsBatchingPeriod={50}
                windowSize={10}
                removeClippedSubviews={Platform.OS === 'android'}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={async () => {
                            setRefreshing(true);
                            await loadNotes();
                            setRefreshing(false);
                        }}
                        colors={['#000000']}
                        tintColor="#000000"
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
                {/* Top fade: solid gray at the very top (touching the
                    Header), transparent at the bottom edge so the list
                    shows through cleanly while scrolling under it. */}
                <ScrollFade style={styles.topBlur} solidEdge="top" />
            </View>

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
                    {/* Bottom fade: solid gray at the very bottom (touching
                        the QuickAdd bar), transparent at the top edge so the
                        list dissolves into it without a hard line. */}
                    <ScrollFade style={styles.bottomBlur} solidEdge="bottom" />
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
                isSaving={false}
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
                    <Text style={styles.toastText}>{t('select_domain_before_save')}</Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // Match the centered content's surround color so the "wings" on wide
        // screens (web/tablet) blend with the search bar / quick-add bar /
        // editor surround instead of showing a slightly different shade.
        backgroundColor: '#F0F2F5',
    },
    bottomSection: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 100,
    },
    listWrapper: {
        flex: 1,
    },
    topBlur: {
        // Soft fade at the top of the list — notes scroll behind this strip
        // and dissolve into the surrounding gray for a clean, minimal look.
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 32,
    },
    bottomBlur: {
        // Anchored to the top of bottomSection and extends upward, so it
        // overlays the FlatList area just above the QuickAdd bar.
        position: 'absolute',
        top: -32,
        left: 0,
        right: 0,
        height: 32,
    },
    listContent: {
        padding: 20,
        paddingBottom: 120,
        // Cap notes list width on wide screens so cards don't span the
        // entire monitor on web/tablet — keeps them readable and aligned
        // with the search bar / quick add bar above and below.
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
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
