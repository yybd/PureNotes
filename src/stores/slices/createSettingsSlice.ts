import { StateCreator } from 'zustand';
import { AppSettings, PureNotesVaultConfig } from '../../types/Note';
import StorageService from '../../services/StorageService';
import { StoreState } from '../notesStore';

export interface SettingsSlice {
    settings: AppSettings;
    updateSettings: (settings: Partial<AppSettings>) => void;
    setVaultConfig: (config: PureNotesVaultConfig) => void;
    reconnectWebVault: () => Promise<void>;
    setEditorMode: (mode: 'markdown' | 'richtext') => void;
}

const defaultSettings: AppSettings = {
    vault: null,
    autoSync: false,
    syncInterval: 15,
    theme: 'auto',
    defaultView: 'grid',
    editorMode: 'richtext',
};

export const createSettingsSlice: StateCreator<
    StoreState,
    [],
    [],
    SettingsSlice
> = (set, get) => ({
    settings: defaultSettings,

    updateSettings: (newSettings: Partial<AppSettings>) => {
        const settings = { ...get().settings, ...newSettings };
        set({ settings });

        if (newSettings.vault !== undefined) {
            StorageService.setConfig(newSettings.vault);
            get().loadNotes().catch((err) => console.error('Failed to reload notes after settings update:', err));
        }
    },

    setVaultConfig: (config: PureNotesVaultConfig) => {
        const settings = { ...get().settings, vault: config };
        set({ settings });
        StorageService.setConfig(config);
        get().loadNotes().catch((err) => console.error('Failed to reload notes after vault config change:', err));
    },

    reconnectWebVault: async () => {
        const granted = await StorageService.verifyPermission();
        set({ isVaultPermissionGranted: granted });
        if (granted) {
            get().loadNotes().catch(err => console.error('Failed to reload notes after reconnection:', err));
        }
    },

    // [INACTIVE] setEditorMode — מושבת, תמיד משתמשים ב-richtext
    setEditorMode: (mode: 'markdown' | 'richtext') => {
        const settings = { ...get().settings, editorMode: mode };
        set({ settings });
    },
});
