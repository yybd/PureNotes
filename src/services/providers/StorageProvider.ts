import { PureNotesVaultConfig } from '../../types/Note';

export interface FileStat {
    name: string;
    modificationTime: number; // in milliseconds
}

export interface StorageProvider {
    /** 
     * Identify if this provider is supported on the current platform.
     */
    isSupported(): boolean;

    /** 
     * Pass configuration (e.g., Vault config) to the provider. 
     */
    setConfig?(config: PureNotesVaultConfig | null): void;

    /** Connect/Select external folder if applicable */
    selectFolder?(): Promise<PureNotesVaultConfig | null>;

    /** Verify/Request permission (Web specific) */
    verifyPermission?(): Promise<boolean>;

    /** Get all markdown files in the specified directory */
    list(subDirectory?: string): Promise<FileStat[]>;

    /** Read content of a specific file */
    read(fileName: string, subDirectory?: string): Promise<string>;

    /** Write content to a specific file */
    write(fileName: string, content: string, subDirectory?: string): Promise<void>;

    /** Delete a specific file */
    delete(fileName: string, subDirectory?: string): Promise<void>;
}
