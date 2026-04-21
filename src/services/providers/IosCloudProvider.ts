import { Platform } from 'react-native';
import { StorageProvider, FileStat } from './StorageProvider';
import { PureNotesVaultConfig } from '../../types/Note';

// Dynamic import to prevent crash on non-iOS
let CloudFileService: any = null;
try {
    CloudFileService = require('../CloudFileService').default;
} catch (e) {
    console.warn('CloudFileService not available');
}

export class IosCloudProvider implements StorageProvider {
    isSupported(): boolean {
        return Platform.OS === 'ios' && CloudFileService !== null;
    }

    async selectFolder(): Promise<PureNotesVaultConfig | null> {
        if (!CloudFileService) throw new Error('Native module not linked');
        const result = await CloudFileService.selectFolder();
        if (result) {
            return {
                vaultName: 'iCloud Vault',
                vaultDirectoryUri: result,
                isConnected: true
            };
        }
        return null;
    }

    async list(subDirectory: string = ''): Promise<FileStat[]> {
        if (subDirectory) {
            const files = await CloudFileService.listSubdirFilesWithAttributes(subDirectory);
            return files.map((f: any) => ({
                name: f.name,
                modificationTime: f.modificationTime || Date.now()
            }));
        } else {
            const files = await CloudFileService.listMarkdownFilesWithAttributes();
            return files.map((f: any) => ({
                name: f.name,
                modificationTime: f.modificationTime || Date.now()
            }));
        }
    }

    async read(fileName: string, subDirectory: string = ''): Promise<string> {
        const path = subDirectory ? `${subDirectory}/${fileName}` : fileName;
        return await CloudFileService.readFile(path);
    }

    async write(fileName: string, content: string, subDirectory: string = ''): Promise<void> {
        const path = subDirectory ? `${subDirectory}/${fileName}` : fileName;
        await CloudFileService.writeFile(path, content);
    }

    async delete(fileName: string, subDirectory: string = ''): Promise<void> {
        const path = subDirectory ? `${subDirectory}/${fileName}` : fileName;
        await CloudFileService.deleteFile(path);
    }
}
