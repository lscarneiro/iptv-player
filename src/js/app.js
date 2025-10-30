// Main Application

import { StorageService } from './services/storageService.js';
import { ApiService } from './services/apiService.js';
import { FavoritesService } from './services/favoritesService.js';
import { CategoryList } from './components/categoryList.js';
import { StreamList } from './components/streamList.js';
import { VideoPlayer } from './components/videoPlayer.js';
import { UserInfo } from './components/userInfo.js';
import { SettingsPanel } from './components/settingsPanel.js';
import { MobileNavigation } from './utils/mobileNavigation.js';
import { debounce } from './utils/debounce.js';
import { toggleClearButton } from './utils/domHelpers.js';

export class IPTVApp {
    constructor() {
        this.storageService = new StorageService();
        this.apiService = new ApiService(null);
        this.favoritesService = new FavoritesService(this.storageService);
        this.videoPlayer = new VideoPlayer();
        this.mobileNav = new MobileNavigation();
        
        this.categories = [];
        this.currentCategory = null;
        this.currentCategoryName = 'All Channels';
        
        // Request tracking for preventing race conditions
        this.currentCategoryLoadId = 0;
        this.currentStreamLoadId = 0;
        this.currentFilterId = 0;
        
        this.init();
    }

    async init() {
        try {
            await this.storageService.init();
        } catch (error) {
            console.warn('IndexedDB initialization failed:', error);
        }
        
        try {
            await this.favoritesService.init();
        } catch (error) {
            console.warn('Favorites service initialization failed:', error);
        }
        
        this.setupComponents();
        this.setupEventListeners();
        this.checkSavedCredentials();
    }

    setupComponents() {
        // Initialize components
        this.categoryList = new CategoryList('categoriesContainer');
        this.streamList = new StreamList('streamsContainer');
        this.userInfo = new UserInfo('streamsContainer');
        this.settingsPanel = new SettingsPanel();
        
        // Setup component callbacks
        this.categoryList.setOnCategorySelect((categoryId) => {
            this.handleCategorySelect(categoryId);
        });
        
        this.streamList.setOnWatchStream((streamId, streamName) => {
            this.handleWatchStream(streamId, streamName);
        });

        // Set up favorites service connections
        this.streamList.setFavoritesService(this.favoritesService);
        this.streamList.setOnFavoriteToggle((streamId, isFavorite) => {
            this.handleFavoriteToggle(streamId, isFavorite);
        });

        this.videoPlayer.setFavoritesService(this.favoritesService);
        this.videoPlayer.setOnFavoriteToggle((streamId, isFavorite) => {
            this.handleFavoriteToggle(streamId, isFavorite);
        });

        // Set up favorites change listener
        this.favoritesService.setOnFavoriteChange((streamId, isFavorite) => {
            this.handleFavoriteChange(streamId, isFavorite);
        });
        
        this.settingsPanel.setOnSubmit((serverUrl, username, password) => {
            this.handleLogin(serverUrl, username, password);
        });

        this.settingsPanel.setOnM3u8LoggingChange((enabled) => {
            this.handleM3u8LoggingChange(enabled);
        });
    }

    setupEventListeners() {
        // Settings panel
        this.settingsPanel.setupEventListeners();
        
        // Account panel
        document.getElementById('accountToggle').addEventListener('click', () => {
            this.userInfo.openAccountPanel();
        });

        document.getElementById('accountClose').addEventListener('click', () => {
            this.userInfo.closeAccountPanel();
        });
        
        // Refresh buttons
        document.getElementById('refreshCategories').addEventListener('click', () => {
            this.loadCategories(true);
        });

        document.getElementById('refreshStreams').addEventListener('click', () => {
            this.loadStreams(true);
        });

        // Search boxes with debounce
        const debouncedStreamSearch = debounce((term) => {
            this.filterStreams(term);
        }, 300);
        
        const debouncedCategorySearch = debounce((term) => {
            this.categoryList.filter(term);
        }, 200);
        
        document.getElementById('categorySearch').addEventListener('input', (e) => {
            const term = e.target.value;
            toggleClearButton('clearCategorySearch', term);
            debouncedCategorySearch(term);
        });

        document.getElementById('streamSearch').addEventListener('input', (e) => {
            const term = e.target.value;
            toggleClearButton('clearStreamSearch', term);
            debouncedStreamSearch(term);
        });

        // Clear buttons
        document.getElementById('clearCategorySearch').addEventListener('click', (e) => {
            e.stopPropagation();
            const searchBox = document.getElementById('categorySearch');
            searchBox.value = '';
            this.categoryList.filter('');
            toggleClearButton('clearCategorySearch', '');
            searchBox.focus();
        });

        document.getElementById('clearStreamSearch').addEventListener('click', (e) => {
            e.stopPropagation();
            const searchBox = document.getElementById('streamSearch');
            searchBox.value = '';
            toggleClearButton('clearStreamSearch', '');
            
            // Use streamList's filter method to clear search
            this.streamList.filter('');
            
            searchBox.focus();
        });

        // Player controls
        document.getElementById('playerClose').addEventListener('click', () => {
            this.videoPlayer.closePlayer();
        });

        document.getElementById('closeVideoPanel').addEventListener('click', () => {
            this.videoPlayer.closeVideoPanel();
            this.streamList.clearPlayingHighlight();
            
            // Notify mobile navigation
            this.mobileNav.onVideoClosed();
        });

        // Filter markers checkbox
        const savedFilterMarkers = this.storageService.loadFilterMarkers();
        this.streamList.setFilterMarkers(savedFilterMarkers);
        
        const filterCheckbox = document.getElementById('filterMarkersCheckbox');
        filterCheckbox.checked = savedFilterMarkers;

        filterCheckbox.addEventListener('change', (e) => {
            const filterValue = e.target.checked;
            this.streamList.setFilterMarkers(filterValue);
            this.storageService.saveFilterMarkers(filterValue);
            
            // The streamList.setFilterMarkers method now handles re-filtering automatically
        });

        // M3U8 logging checkbox
        const savedM3u8Logging = this.storageService.loadM3u8Logging();
        this.videoPlayer.setM3u8LoggingEnabled(savedM3u8Logging);
        this.settingsPanel.setM3u8LoggingState(savedM3u8Logging);
    }

    // Authentication
    async handleLogin(serverUrl, username, password) {
        if (!serverUrl || !username || !password) {
            alert('Please fill in all fields');
            return;
        }

        try {
            console.log('Validating credentials...');
            
            // Check if credentials have changed
            const credentials = this.storageService.loadCredentials();
            const credentialsChanged = !credentials || 
                credentials.serverUrl !== serverUrl ||
                credentials.username !== username ||
                credentials.password !== password;
            
            // Save credentials
            this.storageService.saveCredentials(serverUrl, username, password);
            
            // Set credentials for API service
            const creds = { serverUrl, username, password };
            this.apiService.setCredentials(creds);
            
            // Validate credentials and get user info
            const userInfo = await this.apiService.getUserInfo();
            
            // Cache user info
            await this.storageService.saveToIndexedDB('userInfo', 'user_info', userInfo);
            
            // Only clear cache if credentials changed
            if (credentialsChanged) {
                await this.storageService.clearIndexedDB();
            }
            
            // Show main interface
            this.showMainInterface();
            
            // Display user information
            this.userInfo.render(userInfo);
            
            // Load categories
            await this.loadCategories();
            
            // Close settings panel
            this.settingsPanel.close();
            
        } catch (error) {
            alert(`Login failed: ${error.message}`);
            this.storageService.clearCredentials();
        }
    }

    handleM3u8LoggingChange(enabled) {
        this.videoPlayer.setM3u8LoggingEnabled(enabled);
        this.storageService.saveM3u8Logging(enabled);
        console.log(`M3U8 logging ${enabled ? 'enabled' : 'disabled'} - changes will apply to new streams`);
    }

    checkSavedCredentials() {
        const credentials = this.storageService.loadCredentials();
        if (credentials) {
            // Pre-fill form
            this.settingsPanel.populateForm(
                credentials.serverUrl,
                credentials.username,
                credentials.password
            );
            
            // Auto-connect
            const creds = {
                serverUrl: credentials.serverUrl,
                username: credentials.username,
                password: credentials.password
            };
            this.apiService.setCredentials(creds);
            this.handleLogin(credentials.serverUrl, credentials.username, credentials.password);
        }
    }

    // Category Management
    async loadCategories(forceRefresh = false) {
        try {
            // Generate unique request ID
            const requestId = ++this.currentCategoryLoadId;
            
            this.categoryList.showLoading('Loading categories...');
            
            let categories = null;
            
            if (!forceRefresh) {
                categories = await this.storageService.getFromIndexedDB('categories', 'live_categories');
            }
            
            if (!categories) {
                categories = await this.apiService.getLiveCategories();
                // Sort categories by name before caching
                categories = categories.sort((a, b) => {
                    const nameA = a.category_name ? a.category_name.toLowerCase() : '';
                    const nameB = b.category_name ? b.category_name.toLowerCase() : '';
                    return nameA.localeCompare(nameB);
                });
                await this.storageService.saveToIndexedDB('categories', 'live_categories', categories);
            }
            
            // Only update UI if this is still the latest request
            if (requestId !== this.currentCategoryLoadId) {
                console.log('Category load request outdated, skipping UI update');
                return;
            }
            
            this.categories = categories;
            
            // Get total count for "All Channels"
            let allChannelsCount = 0;
            let allStreams = null;
            
            if (!forceRefresh) {
                allStreams = await this.storageService.getFromIndexedDB('streams', 'all_streams');
                if (allStreams) {
                    allChannelsCount = allStreams.length;
                }
            }
            
            if (!allStreams) {
                try {
                    allStreams = await this.apiService.getLiveStreams(null);
                    allChannelsCount = allStreams ? allStreams.length : 0;
                    
                    if (allStreams) {
                        const sortedStreams = allStreams.sort((a, b) => {
                            const nameA = a.name ? a.name.toLowerCase() : '';
                            const nameB = b.name ? b.name.toLowerCase() : '';
                            return nameA.localeCompare(nameB);
                        });
                        await this.storageService.saveToIndexedDB('streams', 'all_streams', sortedStreams);
                    }
                } catch (error) {
                    console.warn('Could not get all channels count:', error);
                }
            }
            
            // Final check before updating UI
            if (requestId === this.currentCategoryLoadId) {
                const favoritesCount = this.favoritesService.getFavoriteCount();
                console.log('App: Rendering categories with favorites count:', favoritesCount);
                this.categoryList.render(categories, allChannelsCount, favoritesCount);
            }
            
        } catch (error) {
            this.categoryList.showError(`Failed to load categories: ${error.message}`);
        }
    }

    async handleCategorySelect(categoryId) {
        this.currentCategory = categoryId;
        
        // Clear any existing search when switching categories
        const searchBox = document.getElementById('streamSearch');
        if (searchBox) {
            searchBox.value = '';
            toggleClearButton('clearStreamSearch', '');
        }
        
        // Reset search state in StreamList component
        this.streamList.resetSearch();
        
        // Scroll to top of streams container on category change (especially important for mobile)
        setTimeout(() => {
            const streamsContainer = document.getElementById('streamsContainer');
            if (streamsContainer) {
                streamsContainer.scrollTop = 0;
            }
        }, 50);
        
        // Handle favorites category
        if (categoryId === 'favorites') {
            await this.loadFavoriteStreams();
        } else {
            // Update category count if not already loaded (exclude "All Channels")
            // This runs in background and doesn't affect UI race conditions
            if (categoryId !== 'all') {
                const categoryItem = document.querySelector(`[data-category-id="${categoryId}"]`);
                const countSpan = categoryItem.querySelector('.category-count');
                
                if (!countSpan) {
                    // Run this in background without blocking UI updates
                    this.updateCategoryCount(categoryId, categoryItem);
                }
            }
            
            // Load streams for the new category
            await this.loadStreams();
        }
        
        // Notify mobile navigation
        this.mobileNav.onCategorySelected();
    }
    
    // Background method to update category count and cache data
    async updateCategoryCount(categoryId, categoryItem) {
        try {
            const streams = await this.apiService.getLiveStreams(categoryId);
            const count = streams ? streams.length : 0;
            
            // Cache the streams data
            const cacheKey = `category_${categoryId}`;
            const sortedStreams = streams.sort((a, b) => {
                const nameA = a.name ? a.name.toLowerCase() : '';
                const nameB = b.name ? b.name.toLowerCase() : '';
                return nameA.localeCompare(nameB);
            });
            await this.storageService.saveToIndexedDB('streams', cacheKey, sortedStreams);
            
            // Update UI count if element still exists
            const nameSpan = categoryItem.querySelector('span:first-child');
            if (nameSpan) {
                const countHtml = `<span class="category-count">(${count})</span>`;
                nameSpan.insertAdjacentHTML('afterend', countHtml);
            }
            
            // Update category metadata
            const category = this.categories.find(c => c.category_id === categoryId);
            if (category) {
                category.stream_count = count;
            }
            
            await this.storageService.saveToIndexedDB('categories', 'live_categories', this.categories);
            
        } catch (error) {
            console.error('Failed to get category count:', error);
        }
    }

    // Stream Management
    async loadStreams(forceRefresh = false) {
        if (!this.currentCategory) return;
        
        try {
            // Generate unique request ID for this load operation
            const requestId = ++this.currentStreamLoadId;
            const categoryId = this.currentCategory;
            
            // Show the right panel header
            const rightPanelHeader = document.querySelector('.right-panel .panel-header');
            if (rightPanelHeader) {
                rightPanelHeader.classList.remove('hidden');
            }
            
            this.streamList.showLoading('Loading streams...');
            
            let streams = null;
            const cacheKey = categoryId === 'all' ? 'all_streams' : `category_${categoryId}`;
            
            if (!forceRefresh) {
                streams = await this.storageService.getFromIndexedDB('streams', cacheKey);
            }
            
            if (!streams) {
                // Always fetch and cache data, regardless of UI state
                streams = await this.apiService.getLiveStreams(
                    categoryId === 'all' ? null : categoryId
                );
                
                if (streams) {
                    const sortedStreams = streams.sort((a, b) => {
                        const nameA = a.name ? a.name.toLowerCase() : '';
                        const nameB = b.name ? b.name.toLowerCase() : '';
                        return nameA.localeCompare(nameB);
                    });
                    
                    // Always cache the data
                    await this.storageService.saveToIndexedDB('streams', cacheKey, sortedStreams);
                    streams = sortedStreams;
                }
            }
            
            // Only update UI if this is still the latest request AND we're still on the same category
            if (requestId !== this.currentStreamLoadId || this.currentCategory !== categoryId) {
                console.log(`Stream load request outdated (${requestId} vs ${this.currentStreamLoadId}) or category changed, skipping UI update`);
                return;
            }
            
            // Update current category name
            this.updateCategoryName();
            
            this.streamList.render(streams, this.currentCategoryName);
            
            // Refresh mobile navigation
            this.mobileNav.refresh();
            
        } catch (error) {
            this.streamList.showError(`Failed to load streams: ${error.message}`);
        }
    }

    updateCategoryName() {
        let categoryName = 'All Channels';
        if (this.currentCategory === 'favorites') {
            categoryName = 'Favorites';
        } else if (this.currentCategory !== 'all') {
            const category = this.categories.find(c => c.category_id === this.currentCategory);
            if (category) {
                const parts = category.category_name.split('|');
                categoryName = parts[1] ? parts[1].trim() : category.category_name;
            }
        }
        this.currentCategoryName = categoryName;
    }

    async filterStreams(searchTerm) {
        // Generate unique filter request ID to prevent race conditions
        const filterId = ++this.currentFilterId;
        
        // Use the streamList's built-in filter method which handles everything properly
        this.streamList.filter(searchTerm);
        
        // No need to do anything else - the streamList handles all the filtering logic
        // including marker filtering, search term filtering, and proper state management
    }

    // Video Player
    async handleWatchStream(streamId, streamName) {
        try {
            // Update stream highlighting
            this.streamList.highlightPlayingStream(streamId);
            
            // Show loading
            this.videoPlayer.showLoading('Loading stream...');
            
            const streamUrl = await this.apiService.getStreamPlaylist(streamId);
            console.log('Playlist data received:', streamUrl);
            
            if (!streamUrl || typeof streamUrl !== 'string') {
                console.error('Invalid stream URL:', streamUrl);
                throw new Error('No valid stream URL found in response');
            }
            
            this.videoPlayer.playStream(streamUrl, streamName, streamId);
            
            // Notify mobile navigation
            this.mobileNav.onStreamStarted();
            
        } catch (error) {
            console.error('Stream loading error:', error);
            this.videoPlayer.showError(`Error: ${error.message}`);
            document.getElementById('playerSection').classList.add('open');
        }
    }

    // Favorites Management
    async loadFavoriteStreams() {
        try {
            // Generate unique request ID for this load operation
            const requestId = ++this.currentStreamLoadId;
            
            // Show the right panel header
            const rightPanelHeader = document.querySelector('.right-panel .panel-header');
            if (rightPanelHeader) {
                rightPanelHeader.classList.remove('hidden');
            }
            
            this.streamList.showLoading('Loading favorite streams...');
            
            // Get all streams from cache first
            let allStreams = await this.storageService.getFromIndexedDB('streams', 'all_streams');
            
            if (!allStreams) {
                // If no cached streams, load them
                allStreams = await this.apiService.getLiveStreams(null);
                if (allStreams) {
                    const sortedStreams = allStreams.sort((a, b) => {
                        const nameA = a.name ? a.name.toLowerCase() : '';
                        const nameB = b.name ? b.name.toLowerCase() : '';
                        return nameA.localeCompare(nameB);
                    });
                    await this.storageService.saveToIndexedDB('streams', 'all_streams', sortedStreams);
                    allStreams = sortedStreams;
                }
            }
            
            // Only update UI if this is still the latest request
            if (requestId !== this.currentStreamLoadId || this.currentCategory !== 'favorites') {
                console.log('Favorites load request outdated, skipping UI update');
                return;
            }
            
            // Filter to only favorite streams
            const favoriteStreams = this.favoritesService.filterFavoriteStreams(allStreams || []);
            console.log(`🌟 FAVORITES FILTER: ${allStreams?.length || 0} total streams → ${favoriteStreams.length} favorites`);
            console.log(`🌟 Current favorites IDs:`, this.favoritesService.getFavorites());
            if (favoriteStreams.length > 0) {
                console.log(`🌟 Favorite streams:`, favoriteStreams.map(s => ({ id: s.stream_id, name: s.name })));
            }
            
            // Update current category name
            this.updateCategoryName();
            
            this.streamList.render(favoriteStreams, this.currentCategoryName);
            
            // Refresh mobile navigation
            this.mobileNav.refresh();
            
        } catch (error) {
            this.streamList.showError(`Failed to load favorite streams: ${error.message}`);
        }
    }

    handleFavoriteToggle(streamId, isFavorite) {
        // This is called when a favorite is toggled from either stream list or video player
        // The favorites service will handle the actual toggle and notify all listeners
        console.log(`Stream ${streamId} favorite status changed to: ${isFavorite}`);
    }

    handleFavoriteChange(streamId, isFavorite) {
        // This is called by the favorites service when any favorite changes
        // Update UI elements that need to reflect the change
        console.log(`handleFavoriteChange: Stream ${streamId} favorite status changed to ${isFavorite}`);
        
        // Update stream list stars
        this.streamList.updateStreamFavoriteStatus(streamId, isFavorite);
        
        // Update video player star
        this.videoPlayer.updateCurrentStreamFavoriteStatus(streamId, isFavorite);
        
        // Update favorites count in category list
        const favoritesCount = this.favoritesService.getFavoriteCount();
        console.log('Updated favorites count:', favoritesCount);
        const favoritesItem = document.querySelector('[data-category-id="favorites"] .category-count');
        if (favoritesItem) {
            favoritesItem.textContent = `(${favoritesCount})`;
            console.log('Updated favorites count in UI');
        } else {
            console.log('Favorites count element not found');
        }
        
        // If we're currently viewing favorites and a stream was unfavorited, refresh the list
        if (this.currentCategory === 'favorites' && !isFavorite) {
            console.log('Refreshing favorites list after unfavoriting');
            // Small delay to allow the UI to update before refreshing
            setTimeout(() => {
                this.loadFavoriteStreams();
            }, 100);
        }
    }

    // UI Helper Methods
    showMainInterface() {
        document.getElementById('mainContainer').style.display = 'flex';
        
        // Initialize mobile navigation
        this.mobileNav.checkMobile();
        if (this.mobileNav.isMobile) {
            document.getElementById('mobileNav').style.display = 'block';
            this.mobileNav.setActiveView('categories');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('IPTV Player initializing...');
    try {
        window.app = new IPTVApp();
        console.log('IPTV Player initialized successfully');
    } catch (error) {
        console.error('Failed to initialize IPTV Player:', error);
    }
});

