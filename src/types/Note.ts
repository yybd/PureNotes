// Note.ts - TypeScript interfaces for the app

// Domain Types - Cognitive Contexts
export type DomainType = 'action' | 'knowledge' | 'library';

export const DOMAINS: Record<DomainType, { label: string; color: string; icon: string }> = {
  action: { label: 'לעשות', color: '#E53935', icon: 'checkbox-outline' }, // Red
  knowledge: { label: 'לדעת', color: '#1E88E5', icon: 'book-outline' }, // Blue
  library: { label: 'לספרייה', color: '#8E24AA', icon: 'library-outline' }, // Purple
};

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  filePath: string;
  syncStatus: 'synced' | 'pending' | 'error';
  tags?: string[];
  pinned?: boolean;
  domain?: DomainType;
}

export interface PureNotesVaultConfig {
  vaultName: string;
  folderPath?: string; // Optional folder path within the vault (e.g., "Notes/Mobile")
  vaultDirectoryUri?: string; // Actual file system URI to the vault directory for direct sync
  isConnected: boolean;
}

export interface AppSettings {
  vault: PureNotesVaultConfig | null;
  autoSync: boolean;
  syncInterval: number; // in minutes
  theme: 'light' | 'dark' | 'auto';
  defaultView: 'grid' | 'list';
  editorMode: 'markdown' | 'richtext';
  // Multiplier applied to note text size in the list (title + body).
  // 1.0 = default. Range enforced by the Settings slider (0.85–1.4).
  textScale: number;
}

export interface SearchResult {
  note: Note;
  matches: Array<{
    key: string;
    indices: number[][];
  }>;
  score: number;
}
