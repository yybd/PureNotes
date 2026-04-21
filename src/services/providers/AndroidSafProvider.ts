import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { StorageProvider, FileStat } from './StorageProvider';
import { PureNotesVaultConfig } from '../../types/Note';

export class AndroidSafProvider implements StorageProvider {
    private config: PureNotesVaultConfig | null = null;
    private safUriCache: Map<string, string> = new Map();

    isSupported(): boolean {
        return Platform.OS === 'android';
    }

    setConfig(config: PureNotesVaultConfig | null): void {
        this.config = config;
    }

    async selectFolder(): Promise<PureNotesVaultConfig | null> {
        // @ts-ignore
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
            return {
                vaultName: 'Android Vault',
                vaultDirectoryUri: permissions.directoryUri,
                isConnected: true
            };
        }
        return null;
    }

    private getUri(): string {
        if (!this.config || !this.config.vaultDirectoryUri) {
            throw new Error('Android SAF Provider not configured with a valid directory URI');
        }
        return this.config.vaultDirectoryUri;
    }

    async list(subDirectory: string = ''): Promise<FileStat[]> {
        if (subDirectory) {
            console.warn('Listing subdirectories for external Android storage relies on native subfolder traversal which is currently unsupported via SAF directly here.');
            return []; // Parity with previous implementation 
        }

        const uri = this.getUri();
        const stats: FileStat[] = [];

        try {
            // @ts-ignore
            const startFiles = await FileSystem.StorageAccessFramework.readDirectoryAsync(uri);

            // Limit concurrency for Android SAF to avoid overloading it
            for (const fileUri of startFiles) {
                const fileName = decodeURIComponent(fileUri).split('/').pop() || '';
                if (!fileName.endsWith('.md')) continue;

                this.safUriCache.set(fileName, fileUri as string);

                try {
                    const info = await FileSystem.getInfoAsync(fileUri as string);
                    const modTime = new Date(info.exists ? (info.modificationTime || Date.now()) : Date.now()).getTime();

                    stats.push({
                        name: fileName,
                        modificationTime: modTime
                    });
                } catch (e) {
                    console.warn(`Failed to get info for Android SAF file: ${fileName}`, e);
                }
            }
        } catch (error) {
            console.error('Error reading Android SAF directory', error);
        }

        return stats;
    }

    async read(fileName: string, subDirectory: string = ''): Promise<string> {
        if (subDirectory) throw new Error('Subdirectories not supported in current SAF implementation');

        let fileUri = this.safUriCache.get(fileName);
        if (!fileUri) {
            // Force refresh cache by listing
            await this.list();
            fileUri = this.safUriCache.get(fileName);
        }

        if (!fileUri) {
            throw new Error(`File not found: ${fileName}`);
        }

        return await FileSystem.readAsStringAsync(fileUri);
    }

    async write(fileName: string, content: string, subDirectory: string = ''): Promise<void> {
        if (subDirectory) {
            console.warn('Subdirectories not properly supported in writing via simple SAF implementation. Proceeding securely.');
            // Usually, writing to archive in SAF was ignored or skipped previously for external
        }

        const dirUri = this.getUri();
        let existingUri = this.safUriCache.get(fileName);

        if (!existingUri) {
            // @ts-ignore
            const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri);
            existingUri = files.find((uri: string) => decodeURIComponent(uri).endsWith(fileName));
            if (existingUri) {
                this.safUriCache.set(fileName, existingUri);
            }
        }

        if (existingUri) {
            await FileSystem.writeAsStringAsync(existingUri, content);
        } else {
            const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
            // @ts-ignore
            const newUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, sanitizedFileName, 'text/markdown');
            this.safUriCache.set(fileName, newUri);
            await FileSystem.writeAsStringAsync(newUri, content);
        }
    }

    async delete(fileName: string, subDirectory: string = ''): Promise<void> {
        if (subDirectory) {
            console.warn(`SAF delete ignores subdirectory: ${subDirectory}`);
        }

        const uri = this.getUri();
        try {
            let fileUri = this.safUriCache.get(fileName);
            if (!fileUri) {
                // @ts-ignore
                const startFiles = await FileSystem.StorageAccessFramework.readDirectoryAsync(uri);
                fileUri = startFiles.find((fUri: string) => decodeURIComponent(fUri).endsWith(fileName));
            }

            if (fileUri) {
                await FileSystem.deleteAsync(fileUri);
                this.safUriCache.delete(fileName);
                console.log(`Deleted file via SAF: ${fileUri}`);
            } else {
                console.warn(`Could not find file to delete via SAF: ${fileName}`);
            }
        } catch (error) {
            console.error('Error deleting file via Android SAF:', error);
            throw error;
        }
    }
}
