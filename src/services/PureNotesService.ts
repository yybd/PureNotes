// PureNotesService.ts - Integration with Obsidian via URI scheme

import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { PureNotesVaultConfig } from '../types/Note';

class PureNotesService {
    private vaultConfig: PureNotesVaultConfig | null = null;

    /**
     * Set the vault configuration
     */
    setVaultConfig(config: PureNotesVaultConfig): void {
        this.vaultConfig = config;
    }

    /**
     * Get current vault configuration
     */
    getVaultConfig(): PureNotesVaultConfig | null {
        return this.vaultConfig;
    }

    /**
     * Open a note in Obsidian
     */
    async openInObsidian(noteTitle: string): Promise<void> {
        if (!this.vaultConfig || !this.vaultConfig.isConnected) {
            throw new Error('Vault not configured. Please set up Obsidian integration first.');
        }

        const vaultName = encodeURIComponent(this.vaultConfig.vaultName);

        let filePath = this.vaultConfig.folderPath
            ? `${this.vaultConfig.folderPath}/${noteTitle}`
            : noteTitle;

        // Ensure .md extension
        if (!filePath.endsWith('.md')) {
            filePath = `${filePath}.md`;
        }

        // Encode path segments separately to preserve folder structure
        const encodedFilePath = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
        const uri = `obsidian://open?vault=${vaultName}&file=${encodedFilePath}`;

        try {
            const canOpen = await Linking.canOpenURL(uri);
            if (canOpen) {
                await Linking.openURL(uri);
            } else {
                throw new Error('Obsidian app is not installed or cannot be opened');
            }
        } catch (error) {
            console.error('Error opening note in Obsidian:', error);
            throw error;
        }
    }

    /**
     * Create or update a note in Obsidian (silently, without opening the app)
     */
    async createInObsidian(title: string, content: string, silent: boolean = true, overwrite: boolean = true): Promise<void> {
        if (!this.vaultConfig || !this.vaultConfig.isConnected) {
            throw new Error('Vault not configured');
        }

        const vaultName = encodeURIComponent(this.vaultConfig.vaultName);

        // Build the file path
        let filePath = this.vaultConfig.folderPath
            ? `${this.vaultConfig.folderPath}/${title}`
            : title;

        // Ensure .md extension
        if (!filePath.endsWith('.md')) {
            filePath = `${filePath}.md`;
        }

        // For iOS with x-success callback, use Advanced URI plugin format
        // Standard obsidian://new doesn't support x-callback-url properly
        const useAdvancedURI = Platform.OS === 'ios';

        let uri: string;

        if (useAdvancedURI) {
            // Advanced URI format: obsidian://advanced-uri
            // Requires "Advanced URI" community plugin installed in Obsidian
            const encodedData = encodeURIComponent(content);
            const encodedPath = encodeURIComponent(filePath);
            const xSuccess = encodeURIComponent('purenotes://success');

            uri = `obsidian://advanced-uri?vault=${vaultName}&filepath=${encodedPath}&data=${encodedData}&mode=overwrite&x-success=${xSuccess}`;

            console.log('📝 Using Advanced URI (supports x-success)');
        } else {
            // Standard URI for Android
            const encodedFilePath = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
            const encodedContent = encodeURIComponent(content);
            const silentParam = silent ? '&silent' : '';
            const overwriteParam = overwrite ? '&overwrite=true' : '';

            uri = `obsidian://new?vault=${vaultName}&file=${encodedFilePath}&content=${encodedContent}${overwriteParam}${silentParam}`;
        }

        console.log('📝 PureNotes Sync Debug:');
        console.log('  Title:', title);
        console.log('  Folder:', this.vaultConfig.folderPath || 'root');
        console.log('  File path:', filePath);
        console.log('  Full URI:', uri);
        if (useAdvancedURI) {
            console.log('  ⚠️  Requires "Advanced URI" plugin in Obsidian!');
        }

        try {
            await Linking.openURL(uri);
        } catch (error) {
            console.error('Error creating note in Obsidian:', error);
            throw error;
        }
    }

    /**
     * Append content to daily note in Obsidian (silently)
     */
    async appendToDailyNote(content: string, silent: boolean = true): Promise<void> {
        if (!this.vaultConfig || !this.vaultConfig.isConnected) {
            throw new Error('Vault not configured');
        }

        const vaultName = encodeURIComponent(this.vaultConfig.vaultName);
        const encodedContent = encodeURIComponent(content);
        const silentParam = silent ? '&silent' : '';
        const uri = `obsidian://daily?vault=${vaultName}&content=${encodedContent}&append=true${silentParam}`;

        try {
            await Linking.openURL(uri);
        } catch (error) {
            console.error('Error appending to daily note:', error);
            throw error;
        }
    }

    /**
     * Search in Obsidian vault
     */
    async searchInObsidian(query: string): Promise<void> {
        if (!this.vaultConfig || !this.vaultConfig.isConnected) {
            throw new Error('Vault not configured');
        }

        const vaultName = encodeURIComponent(this.vaultConfig.vaultName);
        const encodedQuery = encodeURIComponent(query);
        const uri = `obsidian://search?vault=${vaultName}&query=${encodedQuery}`;

        try {
            const canOpen = await Linking.canOpenURL(uri);
            if (canOpen) {
                await Linking.openURL(uri);
            } else {
                throw new Error('Obsidian app is not installed');
            }
        } catch (error) {
            console.error('Error searching in Obsidian:', error);
            throw error;
        }
    }

    /**
     * Check if Obsidian is installed
     */
    async isObsidianInstalled(): Promise<boolean> {
        try {
            return await Linking.canOpenURL('obsidian://');
        } catch {
            return false;
        }
    }

    /**
     * Set up deep linking to receive callbacks from Obsidian
     */
    setupDeepLinking(callback: (url: string) => void): void {
        // Listen for incoming URLs (x-callback-url responses)
        const subscription = Linking.addEventListener('url', ({ url }) => {
            if (url.startsWith('purenotes://')) {
                callback(url);
            }
        });

        // Get initial URL if app was opened via deep link
        Linking.getInitialURL().then((url) => {
            if (url && url.startsWith('purenotes://')) {
                callback(url);
            }
        });
    }

    /**
     * Format note title for Obsidian (remove .md extension if present)
     */
    formatNoteTitle(title: string): string {
        return title.endsWith('.md') ? title.slice(0, -3) : title;
    }

    /**
     * Create a shareable URI for this app
     */
    createAppUri(action: string, params: Record<string, string>): string {
        const queryParams = Object.entries(params)
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join('&');

        return `purenotes://${action}?${queryParams}`;
    }
}

export default new PureNotesService();
