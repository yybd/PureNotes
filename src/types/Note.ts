// Note.ts - TypeScript interfaces for the app

// Domain Types - Cognitive Contexts
export type DomainType = 'action' | 'knowledge' | 'insight' | 'experience' | 'person';

export const DOMAINS: Record<DomainType, { label: string; color: string; icon: string }> = {
  action: { label: 'לעשות', color: '#E53935', icon: 'checkbox-outline' }, // Red
  knowledge: { label: 'לדעת', color: '#1E88E5', icon: 'book-outline' }, // Blue
  insight: { label: 'תובנה', color: '#8E24AA', icon: 'bulb-outline' }, // Purple
  experience: { label: 'חוויה', color: '#43A047', icon: 'heart-outline' }, // Green
  person: { label: 'אדם', color: '#FB8C00', icon: 'person-outline' }, // Orange
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
}

export interface SearchResult {
  note: Note;
  matches: Array<{
    key: string;
    indices: number[][];
  }>;
  score: number;
}
