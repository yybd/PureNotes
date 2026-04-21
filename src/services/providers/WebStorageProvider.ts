import { Platform } from 'react-native';
import { StorageProvider, FileStat } from './StorageProvider';
import { PureNotesVaultConfig } from '../../types/Note';

export class WebStorageProvider implements StorageProvider {
    private config: PureNotesVaultConfig | null = null;

    name = 'Web Local Storage';

    setConfig(config: PureNotesVaultConfig | null): void {
        this.config = config;
    }

    isSupported(): boolean {
        return Platform.OS === 'web';
    }

    private async getWebFileService(): Promise<any> {
        const WebFileService = require('../WebFileService').default;
        // initialize checks permission but doesn't request it
        await WebFileService.initialize();
        return WebFileService;
    }

    async selectFolder(): Promise<PureNotesVaultConfig | null> {
        const WebFileService = await this.getWebFileService();
        const directoryName = await WebFileService.selectDirectory();
        if (directoryName) {
            return {
                vaultName: directoryName,
                vaultDirectoryUri: `web-vault://${directoryName}`,
                isConnected: true
            };
        }
        return null;
    }

    async verifyPermission(): Promise<boolean> {
        const WebFileService = await this.getWebFileService();
        return await WebFileService.verifyPermission(true);
    }

    async list(subDirectory: string = ''): Promise<FileStat[]> {
        const WebFileService = await this.getWebFileService();
        const files: { name: string; modificationTime: number }[] = await WebFileService.listMarkdownFiles(subDirectory);

        return files.map(file => ({
            name: file.name,
            modificationTime: file.modificationTime
        }));
    }

    async read(fileName: string, subDirectory: string = ''): Promise<string> {
        const WebFileService = await this.getWebFileService();
        return await WebFileService.readFile(fileName, subDirectory);
    }

    async write(fileName: string, content: string, subDirectory: string = ''): Promise<void> {
        const WebFileService = await this.getWebFileService();
        await WebFileService.writeFile(fileName, content, subDirectory);
    }

    async delete(fileName: string, subDirectory: string = ''): Promise<void> {
        const WebFileService = await this.getWebFileService();
        await WebFileService.deleteFile(fileName, subDirectory);
    }
}
