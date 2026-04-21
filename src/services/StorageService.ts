import { Note, PureNotesVaultConfig, DomainType } from '../types/Note';
import { getFrontmatterProperty } from './FrontmatterService';
import { StorageProvider } from './providers/StorageProvider';
import { LocalFileProvider } from './providers/LocalFileProvider';
import { AndroidSafProvider } from './providers/AndroidSafProvider';
import { IosCloudProvider } from './providers/IosCloudProvider';
import { WebStorageProvider } from './providers/WebStorageProvider';
import { Platform } from 'react-native';

class StorageService {
    private config: PureNotesVaultConfig | null = null;
    private localProvider: StorageProvider;
    private externalProvider: StorageProvider | null = null;

    constructor() {
        this.localProvider = new LocalFileProvider();
        this.initializeExternalProvider();
    }

    private initializeExternalProvider() {
        if (Platform.OS === 'web') {
            const webProvider = new WebStorageProvider();
            if (webProvider.isSupported()) this.externalProvider = webProvider;
        } else if (Platform.OS === 'ios') {
            const iosProvider = new IosCloudProvider();
            if (iosProvider.isSupported()) this.externalProvider = iosProvider;
        } else if (Platform.OS === 'android') {
            const androidProvider = new AndroidSafProvider();
            if (androidProvider.isSupported()) this.externalProvider = androidProvider;
        }
    }

    setConfig(config: PureNotesVaultConfig | null) {
        this.config = config;
        if (this.externalProvider && this.externalProvider.setConfig) {
            this.externalProvider.setConfig(config);
        }
    }

    getConfig(): PureNotesVaultConfig | null {
        return this.config;
    }

    private isExternal(): boolean {
        return !!(this.config && this.config.isConnected && this.config.vaultDirectoryUri && this.externalProvider);
    }

    private get activeProvider(): StorageProvider {
        return this.isExternal() ? this.externalProvider! : this.localProvider;
    }

    async selectExternalFolder(): Promise<PureNotesVaultConfig | null> {
        if (this.externalProvider && this.externalProvider.selectFolder) {
            return await this.externalProvider.selectFolder();
        }
        throw new Error('External storage is not supported on this platform');
    }

    async verifyPermission(): Promise<boolean> {
        if (this.externalProvider && this.externalProvider.verifyPermission) {
            return await this.externalProvider.verifyPermission();
        }
        return true; // Assume granted for basic providers or if not supported
    }

    async listNotes(cachedNotes: Note[] = []): Promise<Note[]> {
        try {
            const provider = this.activeProvider;
            const files = await provider.list();

            const notes: Note[] = [];
            const cacheMap = new Map(cachedNotes.map(n => [n.id, n]));

            for (const file of files) {
                const cachedNote = cacheMap.get(file.name);

                // If timestamp is exactly or very close, use cache
                if (cachedNote && Math.abs(cachedNote.updatedAt.getTime() - file.modificationTime) < 2000) {
                    notes.push(cachedNote);
                    continue;
                }

                try {
                    const content = await provider.read(file.name);
                    const title = file.name.replace('.md', '');
                    const pinned = getFrontmatterProperty<boolean>(content, 'pinned') || false;
                    const domain = getFrontmatterProperty<DomainType>(content, 'domain');

                    notes.push({
                        id: file.name, // Use filename as ID to be consistent across providers
                        title,
                        content,
                        createdAt: new Date(file.modificationTime),
                        updatedAt: new Date(file.modificationTime),
                        filePath: file.name,
                        syncStatus: 'synced',
                        tags: [],
                        pinned,
                        domain,
                    });
                } catch (readError) {
                    console.warn(`Failed to read note ${file.name}:`, readError);
                }
            }

            return notes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        } catch (error) {
            console.error('Error listing notes:', error);
            return [];
        }
    }

    async saveNote(note: Note): Promise<Note> {
        const fileName = note.title.endsWith('.md') ? note.title : `${note.title}.md`;

        const pinned = getFrontmatterProperty<boolean>(note.content, 'pinned') || false;
        const domain = getFrontmatterProperty<DomainType>(note.content, 'domain');

        const updatedNote = {
            ...note,
            updatedAt: new Date(),
            filePath: fileName,
            pinned,
            domain
        };

        await this.activeProvider.write(fileName, updatedNote.content);
        return updatedNote;
    }

    async deleteNote(note: Note): Promise<void> {
        const fileName = note.title.endsWith('.md') ? note.title : `${note.title}.md`;
        await this.activeProvider.delete(fileName);
    }

    async archiveNote(note: Note): Promise<void> {
        const fileName = note.title.endsWith('.md') ? note.title : `${note.title}.md`;
        await this.activeProvider.write(fileName, note.content, 'archive');
        await this.activeProvider.delete(fileName);
    }

    async listArchivedNotes(): Promise<Note[]> {
        try {
            const provider = this.activeProvider;
            const files = await provider.list('archive');
            const notes: Note[] = [];

            for (const file of files) {
                try {
                    const content = await provider.read(file.name, 'archive');
                    const title = file.name.replace('.md', '');
                    const pinned = getFrontmatterProperty<boolean>(content, 'pinned') || false;
                    const domain = getFrontmatterProperty<DomainType>(content, 'domain');

                    notes.push({
                        id: file.name,
                        title,
                        content,
                        createdAt: new Date(file.modificationTime),
                        updatedAt: new Date(file.modificationTime),
                        filePath: `archive/${file.name}`,
                        syncStatus: 'synced',
                        tags: [],
                        pinned,
                        domain,
                    });
                } catch (e) {
                    console.warn(`Failed to read archived note ${file.name}:`, e);
                }
            }

            return notes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        } catch (error) {
            console.error('Error listing archived notes:', error);
            return [];
        }
    }

    async deleteArchivedNote(note: Note): Promise<void> {
        const fileName = note.title.endsWith('.md') ? note.title : `${note.title}.md`;
        await this.activeProvider.delete(fileName, 'archive');
    }

    async restoreNote(note: Note): Promise<void> {
        const fileName = note.title.endsWith('.md') ? note.title : `${note.title}.md`;
        await this.activeProvider.write(fileName, note.content);
        await this.activeProvider.delete(fileName, 'archive');
    }

    async emptyArchive(): Promise<void> {
        const archivedNotes = await this.listArchivedNotes();
        for (const note of archivedNotes) {
            await this.deleteArchivedNote(note);
        }
    }
}

export default new StorageService();
