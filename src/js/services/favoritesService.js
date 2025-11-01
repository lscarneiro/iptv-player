// Favorites Service - manages favorite streams

import { logger } from '../utils/logger.js';

export class FavoritesService {
    constructor(storageService) {
        this.storageService = storageService;
        this.favorites = new Set(); // Stream favorites
        this.seriesFavorites = new Set(); // Series favorites
        this.onFavoriteChange = null; // Callback for when favorites change
        this.onSeriesFavoriteChange = null; // Callback for when series favorites change
    }

    // Initialize favorites from storage
    async init() {
        // Load stream favorites
        try {
            const savedFavorites = await this.storageService.getFromIndexedDB('favorites', 'favorite_streams');
            if (savedFavorites && Array.isArray(savedFavorites)) {
                // Normalize all loaded IDs to strings
                const normalizedFavorites = savedFavorites.map(id => String(id));
                this.favorites = new Set(normalizedFavorites);
                logger.log('Stream favorites loaded from IndexedDB:', Array.from(this.favorites));
            }
        } catch (error) {
            logger.warn('Failed to load stream favorites from IndexedDB:', error);
            // Fallback to localStorage
            const fallbackFavorites = localStorage.getItem('favorite_streams');
            if (fallbackFavorites) {
                try {
                    const parsed = JSON.parse(fallbackFavorites);
                    if (Array.isArray(parsed)) {
                        // Normalize all loaded IDs to strings
                        const normalizedFavorites = parsed.map(id => String(id));
                        this.favorites = new Set(normalizedFavorites);
                        logger.log('Stream favorites loaded from localStorage:', Array.from(this.favorites));
                    }
                } catch (e) {
                    logger.warn('Failed to parse stream favorites from localStorage:', e);
                }
            }
        }

        // Load series favorites
        try {
            const savedSeriesFavorites = await this.storageService.getFromIndexedDB('favorites', 'favorite_series');
            if (savedSeriesFavorites && Array.isArray(savedSeriesFavorites)) {
                // Normalize all loaded IDs to strings
                const normalizedFavorites = savedSeriesFavorites.map(id => String(id));
                this.seriesFavorites = new Set(normalizedFavorites);
                logger.log('Series favorites loaded from IndexedDB:', Array.from(this.seriesFavorites));
            }
        } catch (error) {
            logger.warn('Failed to load series favorites from IndexedDB:', error);
            // Fallback to localStorage
            const fallbackFavorites = localStorage.getItem('favorite_series');
            if (fallbackFavorites) {
                try {
                    const parsed = JSON.parse(fallbackFavorites);
                    if (Array.isArray(parsed)) {
                        // Normalize all loaded IDs to strings
                        const normalizedFavorites = parsed.map(id => String(id));
                        this.seriesFavorites = new Set(normalizedFavorites);
                        logger.log('Series favorites loaded from localStorage:', Array.from(this.seriesFavorites));
                    }
                } catch (e) {
                    logger.warn('Failed to parse series favorites from localStorage:', e);
                }
            }
        }
    }

    // Set callback for favorite changes
    setOnFavoriteChange(callback) {
        this.onFavoriteChange = callback;
    }

    // Check if a stream is favorited
    isFavorite(streamId) {
        // Normalize to string to handle type mismatches
        const normalizedId = String(streamId);
        const result = this.favorites.has(normalizedId);
        return result;
    }

    // Add a stream to favorites
    async addFavorite(streamId) {
        // Normalize to string to handle type mismatches
        const normalizedId = String(streamId);
        if (!this.favorites.has(normalizedId)) {
            this.favorites.add(normalizedId);
            await this.saveFavorites();
            this.notifyChange(normalizedId, true);
        }
    }

    // Remove a stream from favorites
    async removeFavorite(streamId) {
        // Normalize to string to handle type mismatches
        const normalizedId = String(streamId);
        if (this.favorites.has(normalizedId)) {
            this.favorites.delete(normalizedId);
            await this.saveFavorites();
            this.notifyChange(normalizedId, false);
        }
    }

    // Toggle favorite status
    async toggleFavorite(streamId) {
        if (this.isFavorite(streamId)) {
            await this.removeFavorite(streamId);
            return false;
        } else {
            await this.addFavorite(streamId);
            return true;
        }
    }

    // Get all favorite stream IDs
    getFavorites() {
        return Array.from(this.favorites);
    }

    // Get count of favorites
    getFavoriteCount() {
        return this.favorites.size;
    }

    // Filter streams to only show favorites
    filterFavoriteStreams(streams) {
        if (!streams || !Array.isArray(streams)) {
            return [];
        }
        return streams.filter(stream => this.isFavorite(stream.stream_id));
    }

    // Save favorites to storage
    async saveFavorites() {
        const favoritesArray = Array.from(this.favorites);
        
        try {
            // Try IndexedDB first
            await this.storageService.saveToIndexedDB('favorites', 'favorite_streams', favoritesArray);
        } catch (error) {
            logger.warn('Failed to save favorites to IndexedDB, using localStorage:', error);
            // Fallback to localStorage
            localStorage.setItem('favorite_streams', JSON.stringify(favoritesArray));
        }
    }

    // Notify listeners of favorite changes
    notifyChange(streamId, isFavorite) {
        if (this.onFavoriteChange) {
            this.onFavoriteChange(streamId, isFavorite);
        }
    }

    // Clear all favorites
    async clearAllFavorites() {
        this.favorites.clear();
        await this.saveFavorites();
        if (this.onFavoriteChange) {
            this.onFavoriteChange(null, false); // Signal all favorites cleared
        }
    }

    // Clear favorites (alias for clearAllFavorites, for consistency)
    async clear() {
        await this.clearAllFavorites();
    }

    // Series favorites methods

    setOnSeriesFavoriteChange(callback) {
        this.onSeriesFavoriteChange = callback;
    }

    isSeriesFavorite(seriesId) {
        // Normalize to string to handle type mismatches
        const normalizedId = String(seriesId);
        return this.seriesFavorites.has(normalizedId);
    }

    async addSeriesFavorite(seriesId) {
        // Normalize to string to handle type mismatches
        const normalizedId = String(seriesId);
        if (!this.seriesFavorites.has(normalizedId)) {
            this.seriesFavorites.add(normalizedId);
            await this.saveSeriesFavorites();
            this.notifySeriesChange(normalizedId, true);
        }
    }

    async removeSeriesFavorite(seriesId) {
        // Normalize to string to handle type mismatches
        const normalizedId = String(seriesId);
        if (this.seriesFavorites.has(normalizedId)) {
            this.seriesFavorites.delete(normalizedId);
            await this.saveSeriesFavorites();
            this.notifySeriesChange(normalizedId, false);
        }
    }

    async toggleSeriesFavorite(seriesId) {
        if (this.isSeriesFavorite(seriesId)) {
            await this.removeSeriesFavorite(seriesId);
            return false;
        } else {
            await this.addSeriesFavorite(seriesId);
            return true;
        }
    }

    getSeriesFavorites() {
        return Array.from(this.seriesFavorites);
    }

    getSeriesFavoriteCount() {
        return this.seriesFavorites.size;
    }

    filterFavoriteSeries(series) {
        if (!series || !Array.isArray(series)) {
            return [];
        }
        return series.filter(s => this.isSeriesFavorite(s.series_id));
    }

    async saveSeriesFavorites() {
        const favoritesArray = Array.from(this.seriesFavorites);
        
        try {
            // Try IndexedDB first
            await this.storageService.saveToIndexedDB('favorites', 'favorite_series', favoritesArray);
        } catch (error) {
            logger.warn('Failed to save series favorites to IndexedDB, using localStorage:', error);
            // Fallback to localStorage
            localStorage.setItem('favorite_series', JSON.stringify(favoritesArray));
        }
    }

    notifySeriesChange(seriesId, isFavorite) {
        if (this.onSeriesFavoriteChange) {
            this.onSeriesFavoriteChange(seriesId, isFavorite);
        }
    }

    async clearAllSeriesFavorites() {
        this.seriesFavorites.clear();
        await this.saveSeriesFavorites();
        if (this.onSeriesFavoriteChange) {
            this.onSeriesFavoriteChange(null, false); // Signal all series favorites cleared
        }
    }
}