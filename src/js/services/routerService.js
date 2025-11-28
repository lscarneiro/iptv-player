// Router Service - Hash-based routing for SPA
// Handles URL parsing, navigation, and browser history

import { logger } from '../utils/logger.js';
import { debounce } from '../utils/debounce.js';

/**
 * Route object structure:
 * {
 *   view: 'live' | 'series' | 'movies',
 *   categoryId: string | null,
 *   contentId: string | null,      // streamId, seriesId, or movieId
 *   episodeId: string | null,      // for series episodes
 *   playing: boolean               // for movies - indicates playback state
 * }
 */

export class RouterService {
    constructor() {
        this.listeners = [];
        this.isRestoringState = false; // Flag to prevent URL updates during state restoration
        
        // Debounced route change handler to prevent rapid navigation issues
        this.debouncedRouteChange = debounce(() => {
            this._handleRouteChange();
        }, 50);
        
        this._boundHashChange = this._onHashChange.bind(this);
    }

    /**
     * Initialize the router - start listening to hash changes
     */
    init() {
        window.addEventListener('hashchange', this._boundHashChange);
        logger.log('RouterService initialized');
    }

    /**
     * Destroy the router - stop listening to hash changes
     */
    destroy() {
        window.removeEventListener('hashchange', this._boundHashChange);
        this.listeners = [];
    }

    /**
     * Parse a hash string into a route object
     * @param {string} hash - The hash string (e.g., '#/live/category/123')
     * @returns {object} Parsed route object
     */
    parseHash(hash) {
        // Default route
        const route = {
            view: 'live',
            categoryId: null,
            contentId: null,
            episodeId: null,
            playing: false
        };

        // Remove leading # and /
        const cleanHash = (hash || '').replace(/^#?\/?/, '');
        console.log('Router.parseHash: input=', hash, ', cleanHash=', cleanHash);
        
        if (!cleanHash) {
            return route;
        }

        const segments = cleanHash.split('/').filter(Boolean);
        
        if (segments.length === 0) {
            return route;
        }

        // First segment is the view
        const view = segments[0];
        if (['live', 'series', 'movies'].includes(view)) {
            route.view = view;
        } else {
            // Unknown view, default to live
            return route;
        }

        // Parse remaining segments based on view
        let i = 1;
        while (i < segments.length) {
            const segment = segments[i];
            
            if (segment === 'category' && segments[i + 1]) {
                route.categoryId = segments[i + 1];
                i += 2;
            } else if (segment === 'stream' && segments[i + 1]) {
                // Live TV stream
                route.contentId = segments[i + 1];
                i += 2;
            } else if (segment === 'episode' && segments[i + 1]) {
                // Series episode
                route.episodeId = segments[i + 1];
                i += 2;
            } else if (segment === 'playing') {
                // Movie playing state
                route.playing = true;
                i += 1;
            } else if (route.view === 'series' && !route.contentId) {
                // Series ID (direct number after /series/)
                route.contentId = segment;
                i += 1;
            } else if (route.view === 'movies' && !route.contentId) {
                // Movie ID (direct number after /movies/)
                route.contentId = segment;
                i += 1;
            } else {
                // Unknown segment, skip
                i += 1;
            }
        }

        return route;
    }

    /**
     * Build a hash string from a route object
     * @param {object} route - Route object
     * @returns {string} Hash string (e.g., '#/live/category/123')
     */
    buildHash(route) {
        const parts = ['#'];
        
        // View
        parts.push(route.view || 'live');
        
        // For live view
        if (route.view === 'live') {
            if (route.categoryId && route.contentId) {
                // Full path: category + stream
                parts.push('category', route.categoryId, 'stream', route.contentId);
            } else if (route.contentId) {
                // Just stream
                parts.push('stream', route.contentId);
            } else if (route.categoryId) {
                // Just category
                parts.push('category', route.categoryId);
            }
        }
        
        // For series view
        if (route.view === 'series') {
            if (route.categoryId && !route.contentId) {
                parts.push('category', route.categoryId);
            } else if (route.contentId) {
                parts.push(route.contentId);
                if (route.episodeId) {
                    parts.push('episode', route.episodeId);
                }
            } else if (route.categoryId) {
                parts.push('category', route.categoryId);
            }
        }
        
        // For movies view
        if (route.view === 'movies') {
            if (route.categoryId && !route.contentId) {
                parts.push('category', route.categoryId);
            } else if (route.contentId) {
                parts.push(route.contentId);
                if (route.playing) {
                    parts.push('playing');
                }
            } else if (route.categoryId) {
                parts.push('category', route.categoryId);
            }
        }
        
        return parts.join('/');
    }

    /**
     * Navigate to a route - updates the URL hash
     * @param {object} route - Route object to navigate to
     * @param {boolean} replace - If true, replace current history entry instead of adding new one
     */
    navigate(route, replace = false) {
        // Skip URL updates during state restoration
        if (this.isRestoringState) {
            logger.log('Router: Skipping URL update during state restoration');
            return;
        }

        const hash = this.buildHash(route);
        const currentHash = window.location.hash || '#/live';
        
        // Don't update if hash hasn't changed
        if (hash === currentHash) {
            logger.log('Router: Hash unchanged, skipping navigation');
            return;
        }

        logger.log(`Router: Navigating to ${hash} (replace: ${replace})`);
        
        if (replace) {
            // Replace current history entry
            window.history.replaceState(null, '', hash);
        } else {
            // Add new history entry
            window.location.hash = hash;
        }
    }

    /**
     * Get the current route from the URL
     * @returns {object} Current route object
     */
    getCurrentRoute() {
        return this.parseHash(window.location.hash);
    }

    /**
     * Register a callback to be called when route changes
     * @param {function} callback - Function to call with new route
     * @returns {function} Unsubscribe function
     */
    onRouteChange(callback) {
        this.listeners.push(callback);
        return () => {
            const index = this.listeners.indexOf(callback);
            if (index > -1) {
                this.listeners.splice(index, 1);
            }
        };
    }

    /**
     * Start state restoration mode - URL updates are skipped
     */
    startRestoration() {
        this.isRestoringState = true;
        logger.log('Router: State restoration started');
    }

    /**
     * End state restoration mode - URL updates resume
     */
    endRestoration() {
        this.isRestoringState = false;
        logger.log('Router: State restoration ended');
    }

    /**
     * Internal: Handle hashchange event
     */
    _onHashChange(event) {
        logger.log('Router: Hash changed', event.newURL);
        this.debouncedRouteChange();
    }

    /**
     * Internal: Process route change and notify listeners
     */
    _handleRouteChange() {
        const route = this.getCurrentRoute();
        logger.log('Router: Route changed to', route);
        
        // Notify all listeners
        for (const listener of this.listeners) {
            try {
                listener(route);
            } catch (error) {
                logger.error('Router: Error in route change listener', error);
            }
        }
    }

    /**
     * Update just the category in the current route
     * @param {string} categoryId - The category ID to set
     */
    updateCategory(categoryId) {
        const route = this.getCurrentRoute();
        route.categoryId = categoryId;
        // Clear content when changing category
        route.contentId = null;
        route.episodeId = null;
        route.playing = false;
        this.navigate(route);
    }

    /**
     * Update the content (stream/series/movie) in the current route
     * @param {string} contentId - The content ID
     * @param {object} options - Additional options (episodeId, playing, categoryId)
     */
    updateContent(contentId, options = {}) {
        const route = this.getCurrentRoute();
        route.contentId = contentId;
        
        if (options.categoryId !== undefined) {
            route.categoryId = options.categoryId;
        }
        if (options.episodeId !== undefined) {
            route.episodeId = options.episodeId;
        }
        if (options.playing !== undefined) {
            route.playing = options.playing;
        }
        
        this.navigate(route);
    }

    /**
     * Clear the content from the current route (e.g., when closing video)
     */
    clearContent() {
        const route = this.getCurrentRoute();
        route.contentId = null;
        route.episodeId = null;
        route.playing = false;
        this.navigate(route);
    }

    /**
     * Set the view and optionally clear other state
     * @param {string} view - The view to set ('live', 'series', 'movies')
     * @param {boolean} clearState - If true, clear category and content state
     */
    setView(view, clearState = true) {
        const route = this.getCurrentRoute();
        route.view = view;
        
        if (clearState) {
            route.categoryId = null;
            route.contentId = null;
            route.episodeId = null;
            route.playing = false;
        }
        
        this.navigate(route);
    }
}

// Export singleton instance
export const router = new RouterService();
