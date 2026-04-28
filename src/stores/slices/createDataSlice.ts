import { StateCreator } from 'zustand';
import { Note } from '../../types/Note';
import StorageService from '../../services/StorageService';
import SearchService from '../../services/SearchService';
import { updateFrontmatter, removeFrontmatterKey } from '../../services/FrontmatterService';
import { StoreState } from '../notesStore';

// Defer the (expensive) Fuse index rebuild off the critical save path.
// Multiple successive calls within the same tick collapse into one init.
// Safe to use only when no active search query depends on the immediate index.
let pendingInitNotes: Note[] | null = null;
let initScheduled = false;
const scheduleSearchInit = (notes: Note[]) => {
    pendingInitNotes = notes;
    if (initScheduled) return;
    initScheduled = true;
    setTimeout(() => {
        initScheduled = false;
        if (pendingInitNotes) {
            SearchService.initialize(pendingInitNotes);
            pendingInitNotes = null;
        }
    }, 0);
};

export interface DataSlice {
    notes: Note[];
    filteredNotes: Note[];
    isVaultPermissionGranted: boolean;
    lockedNoteIds: Set<string>;
    loadNotes: () => Promise<void>;
    syncFromExternal: () => Promise<void>;
    lockNote: (id: string) => void;
    unlockNote: (id: string) => void;
    createNote: (title: string, content: string) => Promise<Note>;
    updateNote: (id: string, filePath: string, content: string, skipSort?: boolean) => Promise<Note>;
    deleteNote: (filePath: string) => Promise<void>;
    archiveNote: (filePath: string) => Promise<void>;
    togglePinNote: (noteId: string, currentContent?: string, skipSort?: boolean) => Promise<void>;
    refreshSort: () => void;
}

export const createDataSlice: StateCreator<
    StoreState,
    [],
    [],
    DataSlice
> = (set, get) => ({
    notes: [],
    filteredNotes: [],
    isVaultPermissionGranted: true, // Default to true, update in loadNotes
    lockedNoteIds: new Set<string>(),

    lockNote: (id: string) => {
        const next = new Set(get().lockedNoteIds);
        next.add(id);
        set({ lockedNoteIds: next });
    },

    unlockNote: (id: string) => {
        const next = new Set(get().lockedNoteIds);
        next.delete(id);
        set({ lockedNoteIds: next });
    },

    syncFromExternal: async () => {
        try {
            const state = get();
            const currentNotes = state.notes;
            const lockedIds = state.lockedNoteIds;

            const fresh = await StorageService.listNotes(currentNotes);

            const currentMap = new Map(currentNotes.map((n) => [n.id, n]));
            const freshMap = new Map(fresh.map((n) => [n.id, n]));

            // Detect any change to avoid unnecessary re-renders
            let hasChanges = currentMap.size !== freshMap.size;
            if (!hasChanges) {
                for (const [id, freshNote] of freshMap) {
                    const curr = currentMap.get(id);
                    if (!curr) { hasChanges = true; break; }
                    if (curr.updatedAt.getTime() !== freshNote.updatedAt.getTime()) { hasChanges = true; break; }
                    if (curr.content !== freshNote.content) { hasChanges = true; break; }
                }
            }

            if (!hasChanges) return;

            // Preserve locked notes (currently being edited) from current state
            const merged = fresh.map((n) => {
                if (lockedIds.has(n.id)) {
                    const curr = currentMap.get(n.id);
                    if (curr) return curr;
                }
                return n;
            });

            const sorted = merged.sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                return b.updatedAt.getTime() - a.updatedAt.getTime();
            });

            SearchService.initialize(sorted);

            const { searchQuery, selectedTag, currentDomain } = state;
            let filtered: Note[] = sorted;
            if (searchQuery) {
                filtered = SearchService.search(searchQuery).map((r) => r.note);
            } else if (selectedTag) {
                filtered = SearchService.filterByTag(sorted, selectedTag);
            } else if (currentDomain) {
                filtered = sorted.filter((n) => n.domain === currentDomain);
            }

            set({ notes: sorted, filteredNotes: filtered });
        } catch (error) {
            console.warn('Background sync (syncFromExternal) failed:', error);
        }
    },

    loadNotes: async () => {
        set({ isLoading: true, error: null });
        try {
            const currentSettings = get().settings;
            if (currentSettings.vault) {
                StorageService.setConfig(currentSettings.vault);
                const granted = await StorageService.verifyPermission();
                set({ isVaultPermissionGranted: granted });
            }

            const currentNotes = get().notes;
            const notes = await StorageService.listNotes(currentNotes);
            const sortedNotes = notes.sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                return b.updatedAt.getTime() - a.updatedAt.getTime();
            });
            SearchService.initialize(sortedNotes);
            set({ notes: sortedNotes, filteredNotes: sortedNotes, isLoading: false });
        } catch (error) {
            set({ error: (error as Error).message, isLoading: false });
        }
    },

    createNote: async (title: string, content: string) => {
        set({ isLoading: true, error: null });
        try {
            const newNote: Note = {
                id: title.endsWith('.md') ? title : `${title}.md`,
                title,
                content,
                createdAt: new Date(),
                updatedAt: new Date(),
                syncStatus: 'synced',
                tags: [],
                filePath: '',
            };

            const savedNote = await StorageService.saveNote(newNote);
            const notes = [savedNote, ...get().notes];
            notes.sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                return b.updatedAt.getTime() - a.updatedAt.getTime();
            });
            // No active search at note-create time → defer Fuse index rebuild.
            scheduleSearchInit(notes);
            set({ notes, filteredNotes: notes, isLoading: false });

            return savedNote;
        } catch (error) {
            set({ error: (error as Error).message, isLoading: false });
            throw error;
        }
    },

    updateNote: async (id: string, filePath: string, content: string, skipSort?: boolean) => {
        try {
            let currentNote = get().notes.find((n) => n.id === id);

            if (!currentNote) {
                currentNote = {
                    id,
                    title: id.replace('.md', ''),
                    content,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    filePath,
                    syncStatus: 'synced',
                    tags: [],
                    pinned: false,
                    domain: undefined,
                } as Note;
            }

            const updatedNoteBase = { ...currentNote, content };
            const savedNote = await StorageService.saveNote(updatedNoteBase);

            let notes = get().notes;
            if (notes.some((n) => n.id === id)) {
                notes = notes.map((note) => {
                    if (note.id === id) {
                        const newNote = { ...savedNote };
                        if (savedNote.pinned === undefined) delete newNote.pinned;
                        if (savedNote.domain === undefined) delete newNote.domain;
                        return newNote;
                    }
                    return note;
                });
            } else {
                notes = [savedNote, ...notes];
            }

            if (!skipSort) {
                notes.sort((a, b) => {
                    if (a.pinned && !b.pinned) return -1;
                    if (!a.pinned && b.pinned) return 1;
                    return b.updatedAt.getTime() - a.updatedAt.getTime();
                });
            }

            const { searchQuery, selectedTag } = get();
            let filtered = notes;
            if (searchQuery) {
                // Active search needs a fresh index synchronously.
                SearchService.initialize(notes);
                const results = SearchService.search(searchQuery);
                filtered = results.map((r) => r.note);
            } else if (selectedTag) {
                filtered = SearchService.filterByTag(notes, selectedTag);
                scheduleSearchInit(notes);
            } else {
                filtered = notes;
                scheduleSearchInit(notes);
            }

            set({ notes, filteredNotes: filtered });
            return savedNote;
        } catch (error) {
            set({ error: (error as Error).message });
            throw error;
        }
    },

    deleteNote: async (filePath: string) => {
        set({ isLoading: true, error: null });
        try {
            const noteToDelete = get().notes.find((n) => n.filePath === filePath);
            if (noteToDelete) {
                await StorageService.deleteNote(noteToDelete);
            }

            const notes = get().notes.filter((note) => note.filePath !== filePath);
            SearchService.initialize(notes);
            set({ notes, filteredNotes: notes, isLoading: false });
        } catch (error) {
            set({ error: (error as Error).message, isLoading: false });
        }
    },

    archiveNote: async (filePath: string) => {
        set({ isLoading: true, error: null });
        try {
            const noteToArchive = get().notes.find((n) => n.filePath === filePath);
            if (noteToArchive) {
                await StorageService.archiveNote(noteToArchive);
            }

            const notes = get().notes.filter((note) => note.filePath !== filePath);
            SearchService.initialize(notes);
            set({ notes, filteredNotes: notes, isLoading: false });
        } catch (error) {
            set({ error: (error as Error).message, isLoading: false });
        }
    },

    togglePinNote: async (noteId: string, currentContent?: string, skipSort?: boolean) => {
        try {
            const note = get().notes.find((n) => n.id === noteId);
            if (!note) throw new Error('Note not found');

            const newPinned = !note.pinned;
            let contentToUpdate = currentContent !== undefined ? currentContent : note.content;
            let newContent: string;

            if (newPinned) {
                newContent = updateFrontmatter(contentToUpdate, 'pinned', true);
            } else {
                newContent = removeFrontmatterKey(contentToUpdate, 'pinned');
            }

            const updatedNote = { ...note, content: newContent, pinned: newPinned };
            await StorageService.saveNote(updatedNote);

            const notes = get().notes.map((n) => (n.id === noteId ? updatedNote : n));
            if (!skipSort) {
                notes.sort((a, b) => {
                    if (a.pinned && !b.pinned) return -1;
                    if (!a.pinned && b.pinned) return 1;
                    return b.updatedAt.getTime() - a.updatedAt.getTime();
                });
            }
            SearchService.initialize(notes);

            const { searchQuery, selectedTag, currentDomain } = get();
            let filtered = notes;
            if (searchQuery) {
                const results = SearchService.search(searchQuery);
                filtered = results.map((r) => r.note);
            } else if (selectedTag) {
                filtered = SearchService.filterByTag(notes, selectedTag);
            } else if (currentDomain) {
                filtered = notes.filter((n) => n.domain === currentDomain);
            } else {
                filtered = notes;
            }

            set({ notes, filteredNotes: filtered });
        } catch (error) {
            set({ error: (error as Error).message });
        }
    },

    refreshSort: () => {
        const notes = [...get().notes];
        notes.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return b.updatedAt.getTime() - a.updatedAt.getTime();
        });

        SearchService.initialize(notes);

        const { searchQuery, selectedTag, currentDomain } = get();
        let filtered = notes;
        if (searchQuery) {
            const results = SearchService.search(searchQuery);
            filtered = results.map((r) => r.note);
        } else if (selectedTag) {
            filtered = SearchService.filterByTag(notes, selectedTag);
        } else if (currentDomain) {
            filtered = notes.filter((n) => n.domain === currentDomain);
        } else {
            filtered = notes;
        }

        set({ notes, filteredNotes: filtered });
    },
});
