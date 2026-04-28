// BackgroundSyncService.ts
// Periodically polls the active storage provider for external changes and
// merges them quietly into the notes store, without disturbing currently-edited notes.

import { AppState, AppStateStatus, Platform } from 'react-native';
import { useNotesStore } from '../stores/notesStore';

// 30 s interval (was 5-8 s). The Xcode logs showed 8+ file listings of
// 164 files each in the first ~30 s after launch, choking the JS thread
// while the WebView was trying to mount. External edits (e.g., from
// Obsidian on another device) propagating in 30 s instead of 5 s is a
// fine trade-off; foreground transitions still trigger an immediate sync
// via handleAppStateChange below.
const DEFAULT_INTERVAL_MS = 30000;

// Skip the very first periodic tick by this much, so it does NOT fire
// while iOS is still launching the WebView's WebContent process (which
// can take 4-6 s on iPad). Once that's done the first periodic tick is
// fine. AppState foreground transitions still trigger a tick immediately.
const STARTUP_GRACE_MS = 30000;

class BackgroundSyncService {
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private startupTimerId: ReturnType<typeof setTimeout> | null = null;
    private intervalMs: number = DEFAULT_INTERVAL_MS;
    private appStateSub: { remove: () => void } | null = null;
    private isAppActive: boolean = AppState.currentState === 'active';
    private isSyncing: boolean = false;

    start(intervalMs: number = DEFAULT_INTERVAL_MS): void {
        this.stop();
        this.intervalMs = intervalMs;

        // Track foreground/background to skip ticks while backgrounded
        this.appStateSub = AppState.addEventListener('change', this.handleAppStateChange);

        // Defer the FIRST periodic tick by STARTUP_GRACE_MS to keep the
        // JS thread free during the WebView's cold-start window. The
        // initial `loadNotes()` from NotesListScreen mount has already
        // populated the store by the time the user can interact, so
        // there's nothing the user is waiting for during the grace period.
        this.startupTimerId = setTimeout(() => {
            this.startupTimerId = null;
            this.tick().catch(() => {});
            this.intervalId = setInterval(() => {
                this.tick().catch(() => {});
            }, this.intervalMs);
        }, STARTUP_GRACE_MS);
    }

    stop(): void {
        if (this.startupTimerId !== null) {
            clearTimeout(this.startupTimerId);
            this.startupTimerId = null;
        }
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
