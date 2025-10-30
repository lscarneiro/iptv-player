// Favorites Service - manages favorite streams

export class FavoritesService {
    constructor(storageService) {
        this.storageService = storageService;
        this.favorites = new Set();
        this.onFavoriteChange = null; // Callback for when favorites change
    }

    // Initialize favorites from storage
    async init() {
        try {
            const savedFavorites = await this.storageService.getFromIndexedDB('favorites', 'favorite_streams');
            if (savedFavorites && Array.isArray(savedFavorites)) {
                this.favorites = new Set(savedFavorites);
            }
        } catch (error) {
            console.warn('Failed to load favorites from storage:', error);
            // Fallback to localStorage
            const fallbackFavorites = localStorage.getItem('favorite_streams');
            if (fallbackFavorites) {
                try {
                    const parsed = JSON.parse(fallbackFavorites);
                    if (Array.isArray(parsed)) {
                        this.favorites = new Set(parsed);
                    }
                } catch (e) {
                    console.warn('Failed to parse favorites from localStorage:', e);
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
        return this.favorites.has(streamId);
    }

    // Add a stream to favorites
    async addFavorite(streamId) {
        if (!this.favorites.has(streamId)) {
            this.favorites.add(streamId);
            await this.saveFavorites();
            this.notifyChange(streamId, true);
        }
    }

    // Remove a stream from favorites
    async removeFavorite(streamId) {
        if (this.favorites.has(streamId)) {
            this.favorites.delete(streamId);
            await this.saveFavorites();
            this.notifyChange(streamId, false);
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
            console.warn('Failed to save favorites to IndexedDB, using localStorage:', error);
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
}