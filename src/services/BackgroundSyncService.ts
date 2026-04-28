// BackgroundSyncService.ts
// Periodically polls the active storage provider for external changes and
// merges them quietly into the notes store, without disturbing currently-edited notes.

import { AppState, AppStateStatus, Platform } from 'react-native';
import { useNotesStore } from '../stores/notesStore';

const DEFAULT_INTERVAL_MS = Platform.OS === 'android' ? 8000 : 5000;

class BackgroundSyncService {
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private intervalMs: number = DEFAULT_INTERVAL_MS;
    private appStateSub: { remove: () => void } | null = null;
    private isAppActive: boolean = AppState.currentState === 'active';
    private isSyncing: boolean = false;

    start(intervalMs: number = DEFAULT_INTERVAL_MS): void {
        this.stop();
        this.intervalMs = intervalMs;

        // Track foreground/background to skip ticks while backgrounded
        this.appStateSub = AppState.addEventListener('change', this.handleAppStateChange);

        this.intervalId = setInterval(() => {
            this.tick().catch(() => {});
        }, this.intervalMs);
    }

    stop(): void {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.appStateSub) {
            this.appStateSub.remove();
            this.appStateSub = null;
        }
    }

    private handleAppStateChange = (next: AppStateStatus) => {
        const wasActive = this.isAppActive;
        this.isAppActive = next === 'active';
        // On resume, run an immediate tick to refresh fast
        if (!wasActive && this.isAppActive) {
            this.tick().catch(() => {});
        }
    };

    private async tick(): Promise<void> {
        if (!this.isAppActive) return;
        if (this.isSyncing) return;
        // Skip while the user is editing a note. `lockedNoteIds` is non-empty
        // whenever a card is in inline-edit mode or open in the EditorModal.
        // Polling the file system + rebuilding the Fuse search index during
        // typing produces visible jank on the JS thread; deferring is safe
        // because the user's local edits are the source of truth anyway.
        if (useNotesStore.getState().lockedNoteIds.size > 0) return;
        this.isSyncing = true;
        try {
            const syncFromExternal = useNotesStore.getState().syncFromExternal;
            if (typeof syncFromExternal === 'function') {
                await syncFromExternal();
            }
        } catch (error) {
            // Swallow errors quietly — background sync is best-effort
            console.warn('BackgroundSyncService tick failed:', error);
        } finally {
            this.isSyncing = false;
        }
    }
}

export default new BackgroundSyncService();
