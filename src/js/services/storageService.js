// Storage Service - handles IndexedDB and localStorage

import { logger } from '../utils/logger.js';

export class StorageService {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('IPTVPlayerDB', 3); // Increment version to trigger upgrade
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                logger.log('IndexedDB upgrade needed, creating stores...');
                
                // Categories store
                if (!db.objectStoreNames.contains('categories')) {
                    db.createObjectStore('categories', { keyPath: 'key' });
                    logger.log('Created categories store');
                }
                
                // Streams store
                if (!db.objectStoreNames.contains('streams')) {
                    db.createObjectStore('streams', { keyPath: 'key' });
                    logger.log('Created streams store');
                }
                
                // User info store
                if (!db.objectStoreNames.contains('userInfo')) {
                    db.createObjectStore('userInfo', { keyPath: 'key' });
                    logger.log('Created userInfo store');
                }
                
                // Favorites store
                if (!db.objectStoreNames.contains('favorites')) {
                    db.createObjectStore('favorites', { keyPath: 'key' });
                    logger.log('Created favorites store');
                }
                
                // EPG store
                if (!db.objectStoreNames.contains('epg')) {
                    db.createObjectStore('epg', { keyPath: 'key' });
                    logger.log('Created epg store');
                }
                
                logger.log('Available stores:', Array.from(db.objectStoreNames));
            };
        });
    }

    // IndexedDB operations
    saveToIndexedDB(storeName, key, data) {
        if (!this.db) {
            logger.warn('IndexedDB not available, skipping cache save');
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put({ key, data, timestamp: Date.now() });
                
                request.onsuccess = () => resolve();
                request.onerror = () => {
                    logger.error(`Failed to save to IndexedDB: ${storeName}/${key}`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                logger.error(`Error accessing IndexedDB store ${storeName}:`, error);
                reject(error);
            }
        });
    }

    getFromIndexedDB(storeName, key) {
        if (!this.db) {
            logger.warn('IndexedDB not available, skipping cache read');
            return Promise.resolve(null);
        }
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(key);
                
                request.onsuccess = () => {
                    if (request.result) {
                        resolve(request.result.data);
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => {
                    logger.error(`Failed to read from IndexedDB: ${storeName}/${key}`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                logger.error(`Error accessing IndexedDB store ${storeName}:`, error);
                reject(error);
            }
        });
    }

    clearIndexedDB() {
        if (!this.db) {
            logger.warn('IndexedDB not available, skipping cache clear');
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            const stores = ['categories', 'streams', 'userInfo', 'favorites'];
            const transaction = this.db.transaction(stores, 'readwrite');
            
            let completed = 0;
            stores.forEach(storeName => {
                const store = transaction.objectStore(storeName);
                const request = store.clear();
                request.onsuccess = () => {
                    completed++;
                    if (completed === stores.length) resolve();
                };
                request.onerror = () => reject(request.error);
            });
        });
    }

    // Credentials management
    saveCredentials(serverUrl, username, password) {
        const credentials = { serverUrl, username, password };
        localStorage.setItem('iptv_credentials', JSON.stringify(credentials));
    }

    loadCredentials() {
        const saved = localStorage.getItem('iptv_credentials');
        if (saved) {
            return JSON.parse(saved);
        }
        return null;
    }

    clearCredentials() {
        localStorage.removeItem('iptv_credentials');
    }

    saveFilterMarkers(value) {
        localStorage.setItem('filterMarkers', value);
    }

    loadFilterMarkers() {
        const saved = localStorage.getItem('filterMarkers');
        return saved !== null ? saved === 'true' : true; // Default to true
    }

    saveM3u8Logging(value) {
        localStorage.setItem('enableM3u8Logging', value);
    }

    loadM3u8Logging() {
        const saved = localStorage.getItem('enableM3u8Logging');
        return saved !== null ? saved === 'true' : false; // Default to false
    }

    saveConsoleLogLevels(levels) {
        localStorage.setItem('consoleLogLevels', JSON.stringify(levels));
    }

    loadConsoleLogLevels() {
        const saved = localStorage.getItem('consoleLogLevels');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                // Return defaults if parsing fails
                return { log: true, warn: true, error: true };
            }
        }
        // Default: all enabled
        return { log: true, warn: true, error: true };
    }

    // EPG data management
    async saveEPGData(channels, programmes) {
        const epgData = {
            channels,
            programmes,
            lastUpdated: Date.now()
        };
        return await this.saveToIndexedDB('epg', 'epg_data', epgData);
    }

    async getEPGData() {
        return await this.getFromIndexedDB('epg', 'epg_data');
    }

    async clearEPGData() {
        if (!this.db) {
            logger.warn('IndexedDB not available, skipping EPG cache clear');
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction(['epg'], 'readwrite');
                const store = transaction.objectStore('epg');
                const request = store.clear();
                
                request.onsuccess = () => resolve();
                request.onerror = () => {
                    logger.error('Failed to clear EPG data:', request.error);
                    reject(request.error);
                };
            } catch (error) {
                logger.error('Error clearing EPG data:', error);
                reject(error);
            }
        });
    }
}

