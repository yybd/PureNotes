// webStorage.ts - IndexedDB wrapper for storing File System Handles
// LocalStorage cannot store complex objects like FileSystemHandle, so we use IndexedDB.

const DB_NAME = 'PureNotesDB';
const STORE_NAME = 'handles';
const KEY = 'vaultHandle';

export const saveDirectoryHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const putRequest = store.put(handle, KEY);

            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject('Failed to save handle');
        };

        request.onerror = () => reject('Failed to open DB');
    });
};

export const getDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const getRequest = store.get(KEY);

            getRequest.onsuccess = () => {
                resolve(getRequest.result || null);
            };
            getRequest.onerror = () => reject('Failed to get handle');
        };

        request.onerror = () => reject('Failed to open DB');
    });
};

export const clearDirectoryHandle = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onsuccess = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const deleteRequest = store.delete(KEY);

            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject('Failed to delete handle');
        };

        request.onerror = () => reject('Failed to open DB');
    });
};
