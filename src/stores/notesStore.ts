// notesStore.ts - Zustand store for managing app state

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DataSlice, createDataSlice } from './slices/createDataSlice';
import { UISlice, createUISlice } from './slices/createUISlice';
import { SettingsSlice, createSettingsSlice } from './slices/createSettingsSlice';
import SearchService from '../services/SearchService';
import StorageService from '../services/StorageService';
import { Note, AppSettings, PureNotesVaultConfig, DomainType } from '../types/Note';

// Define the full store state type
export type StoreState = DataSlice & UISlice & SettingsSlice & {
    syncToExternal: (note: Note) => Promise<void>;
    importFromExternal: (uri: string) => Promise<void>;
};

export const useNotesStore = create<StoreState>()(
    persist(
        (set, get, api) => ({
            ...createDataSlice(set, get, api),
            ...createUISlice(set, get, api),
            ...createSettingsSlice(set, get, api),

            // Deprecated: Sync logic is now handled in saveNote via StorageService
            syncToExternal: async (note: Note) => {
                await StorageService.saveNote(note);
            },

            // Import note (Legacy/Manual import still useful)
            importFromExternal: async (uri: string) => {
                // Implementation can stay similar if we want to copy *into* current storage
            },
        }),
        {
            name: 'notes-storage',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({ settings: state.settings, notes: state.notes }), // Persist settings and notes for caching
            onRehydrateStorage: () => (state) => {
                if (state?.settings?.vault) {
                    StorageService.setConfig(state.settings.vault);
                }
                if (state?.notes) {
                    // Hydrate Date objects
                    state.notes.forEach(n => {
                        n.createdAt = new Date(n.createdAt);
                        n.updatedAt = new Date(n.updatedAt);
                    });

                    // Immediately make notes available without showing full loading
                    state.filteredNotes = [...state.notes];
                    SearchService.initialize(state.notes);
                }
            }
        }
    )
);
