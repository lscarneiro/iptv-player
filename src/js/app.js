// Main Application

import { StorageService } from './services/storageService.js';
import { ApiService } from './services/apiService.js';
import { FavoritesService } from './services/favoritesService.js';
import { EPGService } from './services/epgService.js';
import { CategoryList } from './components/categoryList.js';
import { StreamList } from './components/streamList.js';
import { VideoPlayer } from './components/videoPlayer.js';
import { UserInfo } from './components/userInfo.js';
import { SettingsPanel } from './components/settingsPanel.js';
import { EPGPanel } from './components/epgPanel.js';
import { MobileNavigation } from './utils/mobileNavigation.js';
import { TimezoneUtils } from './utils/timezoneUtils.js';
import { debounce } from './utils/debounce.js';
import { toggleClearButton } from './utils/domHelpers.js';
import { logger } from './utils/logger.js';
import { SeriesApp } from './seriesApp.js';

export class IPTVApp {
    constructor() {
        this.storageService = new StorageService();
        this.apiService = new ApiService(null);
        this.favoritesService = new FavoritesService(this.storageService);
        this.epgService = new EPGService(this.apiService, this.storageService);
        this.videoPlayer = new VideoPlayer();
        this.mobileNav = new MobileNavigation();
        
        this.categories = [];
        this.currentCategory = null;
        this.currentCategoryName = 'All Channels';
        
        // Request tracking for preventing race conditions
        this.currentCategoryLoadId = 0;
        this.currentStreamLoadId = 0;
        this.currentFilterId = 0;
        
        // Series app (lazy loaded)
        this.seriesApp = null;
        this.currentView = 'live'; // 'live' or 'series'
        
        this.init();
    }

    async init() {
        try {
            await this.storageService.init();
        } catch (error) {
            logger.warn('IndexedDB initialization failed:', error);
        }
        
        try {
            await this.favoritesService.init();
        } catch (error) {
            logger.warn('Favorites service initialization failed:', error);
        }
        
        this.setupComponents();
        this.setupEventListeners();
        this.checkSavedCredentials();
        
        // Set initial button visibility
        this.settingsPanel.updateButtonVisibility();
    }

    setupComponents() {
        // Initialize components
        this.categoryList = new CategoryList('categoriesContainer');
        this.streamList = new StreamList('streamsContainer');
        this.userInfo = new UserInfo('streamsContainer');
        this.settingsPanel = new SettingsPanel();
        this.epgPanel = new EPGPanel('epgPanel');
        
        // Setup component callbacks
        this.categoryList.setOnCategorySelect((categoryId) => {
            this.handleCategorySelect(categoryId);
        });
        
        this.streamList.setOnWatchStream((streamId, streamName, tvArchive, tvArchiveDuration) => {
            this.handleWatchStream(streamId, streamName, tvArchive, tvArchiveDuration);
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
        this.videoPlayer.setApiService(this.apiService);
        this.videoPlayer.setEpgService(this.epgService);

        // Set up category list favorites service
        this.categoryList.setFavoritesService(this.favoritesService);
        this.categoryList.setOnCategoryFavoriteToggle((categoryId, isFavorite) => {
            this.handleCategoryFavoriteToggle(categoryId, isFavorite);
        });

        // Set up favorites change listener
        this.favoritesService.setOnFavoriteChange((streamId, isFavorite) => {
            this.handleFavoriteChange(streamId, isFavorite);
        });

        // Set up category favorites change listener
        this.favoritesService.setOnCategoryFavoriteChange((categoryId, isFavorite) => {
            this.handleCategoryFavoriteChange(categoryId, isFavorite);
        });
        
        this.settingsPanel.setOnSubmit((serverUrl, username, password) => {
            this.handleLogin(serverUrl, username, password);
        });

        this.settingsPanel.setOnM3u8LoggingChange((enabled) => {
            this.handleM3u8LoggingChange(enabled);
        });

        this.settingsPanel.setOnConsoleLogLevelChange((level, enabled) => {
            this.handleConsoleLogLevelChange(level, enabled);
        });

        this.settingsPanel.setOnQuickLogin((jsonString) => {
            this.handleQuickLogin(jsonString);
        });

        this.settingsPanel.setOnLogout(() => {
            this.handleLogout();
        });

        // Set up EPG panel callbacks
        this.epgPanel.setOnChannelClick((channelId) => {
            this.handleEPGChannelClick(channelId);
        });

        // Set up EPG panel favorites service
        this.epgPanel.setFavoritesService(this.favoritesService);
    }

    setupEventListeners() {
        // Settings panel
        this.settingsPanel.setupEventListeners();
        
        // Series toggle
        document.getElementById('seriesToggle').addEventListener('click', () => {
            this.toggleView();
        });
        
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

        // Console log levels
        const savedLogLevels = this.storageService.loadConsoleLogLevels();
        logger.setEnabledLevels(savedLogLevels);
        this.settingsPanel.setConsoleLogLevels(savedLogLevels);

        // EPG panel
        document.getElementById('epgToggle').addEventListener('click', () => {
            this.openEPGPanel();
        });

        document.getElementById('epgClose').addEventListener('click', () => {
            this.closeEPGPanel();
        });

        document.getElementById('epgRefresh').addEventListener('click', () => {
            this.refreshEPG();
        });

        // Timezone selector
        this.setupTimezoneSelector();

        // EPG channel search with debounce
        const debouncedEPGSearch = debounce((term) => {
            this.epgPanel.filter(term);
        }, 300);

        document.getElementById('epgChannelSearch').addEventListener('input', (e) => {
            const term = e.target.value;
            toggleClearButton('clearEpgChannelSearch', term);
            debouncedEPGSearch(term);
        });

        // EPG channel search clear button
        document.getElementById('clearEpgChannelSearch').addEventListener('click', (e) => {
            e.stopPropagation();
            const searchBox = document.getElementById('epgChannelSearch');
            searchBox.value = '';
            this.epgPanel.filter('');
            toggleClearButton('clearEpgChannelSearch', '');
            searchBox.focus();
        });

        // EPG favorites filter button
        document.getElementById('epgFavoritesFilter').addEventListener('click', () => {
            this.epgPanel.filterFavorites();
        });
    }

    // Authentication
    async handleLogin(serverUrl, username, password) {
        if (!serverUrl || !username || !password) {
            alert('Please fill in all fields');
            return;
        }

        try {
            logger.log('Validating credentials...');
            
            // Check if credentials have changed
            const credentials = this.storageService.loadCredentials();
            const credentialsChanged = !credentials || 
                credentials.serverUrl !== serverUrl ||
                credentials.username !== username ||
                credentials.password !== password;
            
            // Only clear cache if credentials changed (do this BEFORE saving new data)
            if (credentialsChanged) {
                logger.log('Credentials changed, clearing old cache...');
                await this.storageService.clearIndexedDB();
            }
            
            // Save credentials
            this.storageService.saveCredentials(serverUrl, username, password);
            
            // Set credentials for API service
            const creds = { serverUrl, username, password };
            this.apiService.setCredentials(creds);
            
            // Validate credentials and get user info
            const userInfo = await this.apiService.getUserInfo();
            
            // Cache user info (after clearing old cache)
            await this.storageService.saveToIndexedDB('userInfo', 'user_info', userInfo);
            
            // Show main interface
            this.showMainInterface();
            
            // Display user information
            this.userInfo.render(userInfo);
            
            // Load categories
            await this.loadCategories();
            
            // Close settings panel
            this.settingsPanel.close();
            
            // Update button visibility after successful login
            this.settingsPanel.updateButtonVisibility();
            
        } catch (error) {
            alert(`Login failed: ${error.message}`);
            this.storageService.clearCredentials();
            // Update button visibility after failed login
            this.settingsPanel.updateButtonVisibility();
        }
    }

    handleM3u8LoggingChange(enabled) {
        this.videoPlayer.setM3u8LoggingEnabled(enabled);
        this.storageService.saveM3u8Logging(enabled);
        logger.log(`M3U8 logging ${enabled ? 'enabled' : 'disabled'} - changes will apply to new streams`);
    }

    handleConsoleLogLevelChange(level, enabled) {
        const currentLevels = logger.getEnabledLevels();
        currentLevels[level] = enabled;
        logger.setEnabledLevels(currentLevels);
        this.storageService.saveConsoleLogLevels(currentLevels);
        logger.log(`Console ${level} logging ${enabled ? 'enabled' : 'disabled'}`);
    }

    // Quick login from JSON string
    async handleQuickLogin(jsonString) {
        if (!jsonString || !jsonString.trim()) {
            alert('Please enter a JSON string');
            return;
        }

        try {
            // Parse JSON string
            const credentials = JSON.parse(jsonString);
            
            // Validate required fields
            if (!credentials.serverUrl || !credentials.username || !credentials.password) {
                alert('JSON string must contain serverUrl, username, and password');
                return;
            }

            // Clear JSON input
            document.getElementById('jsonLoginString').value = '';

            // Use existing login handler (it will update button visibility)
            await this.handleLogin(credentials.serverUrl, credentials.username, credentials.password);
        } catch (error) {
            if (error instanceof SyntaxError) {
                alert('Invalid JSON string. Please check the format.');
            } else {
                alert(`Login failed: ${error.message}`);
            }
        }
    }

    // Logout - clear all data and reset UI
    async handleLogout() {
        if (!confirm('Are you sure you want to log out? This will clear all stored data.')) {
            return;
        }

        try {
            // Close any open panels
            this.settingsPanel.close();
            this.userInfo.closeAccountPanel();
            this.closeEPGPanel();
            this.videoPlayer.closePlayer();
            this.videoPlayer.closeVideoPanel();

            // Clear all stored data
            await this.storageService.clearAllData();
            
            // Clear favorites service
            await this.favoritesService.clear();

            // Reset API service credentials
            this.apiService.setCredentials(null);

            // Clear form fields
            this.settingsPanel.populateForm('', '', '');
            document.getElementById('jsonLoginString').value = '';

            // Hide main interface
            document.getElementById('mainContainer').style.display = 'none';
            document.getElementById('mobileNav').style.display = 'none';

            // Reset app state
            this.categories = [];
            this.currentCategory = null;
            this.currentCategoryName = 'All Channels';
            this.currentCategoryLoadId = 0;
            this.currentStreamLoadId = 0;
            this.currentFilterId = 0;

            // Clear UI components
            this.categoryList.clear();
            this.streamList.clear();
            this.userInfo.clear();

            logger.log('Logged out successfully');
            
            // Update button visibility after logout
            this.settingsPanel.updateButtonVisibility();
        } catch (error) {
            logger.error('Logout error:', error);
            alert(`Logout failed: ${error.message}`);
        }
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
                logger.log('Category load request outdated, skipping UI update');
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
                    logger.warn('Could not get all channels count:', error);
                }
            }
            
            // Final check before updating UI
            if (requestId === this.currentCategoryLoadId) {
                const favoritesCount = this.favoritesService.getFavoriteCount();
                logger.log('App: Rendering categories with favorites count:', favoritesCount);
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
            
            // Update category metadata
            const category = this.categories.find(c => c.category_id === categoryId);
            if (category) {
                category.stream_count = count;
            }
            
            await this.storageService.saveToIndexedDB('categories', 'live_categories', this.categories);
            
            // Re-render category list to show updated count
            if (this.categories && this.categories.length > 0) {
                let allChannelsCount = 0;
                try {
                    const allChannelsItem = document.querySelector('[data-category-id="all"] .category-count');
                    if (allChannelsItem) {
                        const match = allChannelsItem.textContent.match(/\((\d+)\)/);
                        if (match) {
                            allChannelsCount = parseInt(match[1], 10);
                        }
                    }
                } catch (e) {
                    // Ignore errors
                }
                
                const favoritesCount = this.favoritesService.getFavoriteCount();
                this.categoryList.render(this.categories, allChannelsCount, favoritesCount);
                
                // Restore selection if a category was selected
                if (this.currentCategory) {
                    this.categoryList.selectCategory(this.currentCategory);
                }
            }
            
        } catch (error) {
            logger.error('Failed to get category count:', error);
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
                    
                    // Update category count if not "all"
                    if (categoryId !== 'all') {
                        const count = streams.length;
                        const category = this.categories.find(c => c.category_id === categoryId);
                        if (category) {
                            category.stream_count = count;
                            await this.storageService.saveToIndexedDB('categories', 'live_categories', this.categories);
                            
                            // Re-render category list to show updated count
                            let allChannelsCount = 0;
                            try {
                                const allChannelsItem = document.querySelector('[data-category-id="all"] .category-count');
                                if (allChannelsItem) {
                                    const match = allChannelsItem.textContent.match(/\((\d+)\)/);
                                    if (match) {
                                        allChannelsCount = parseInt(match[1], 10);
                                    }
                                }
                            } catch (e) {
                                // Ignore errors
                            }
                            
                            const favoritesCount = this.favoritesService.getFavoriteCount();
                            this.categoryList.render(this.categories, allChannelsCount, favoritesCount);
                            
                            // Restore selection
                            if (this.currentCategory) {
                                this.categoryList.selectCategory(this.currentCategory);
                            }
                        }
                    }
                }
            }
            
            // Only update UI if this is still the latest request AND we're still on the same category
            if (requestId !== this.currentStreamLoadId || this.currentCategory !== categoryId) {
                logger.log(`Stream load request outdated (${requestId} vs ${this.currentStreamLoadId}) or category changed, skipping UI update`);
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
    async handleWatchStream(streamId, streamName, tvArchive, tvArchiveDuration) {
        try {
            // Update stream highlighting
            this.streamList.highlightPlayingStream(streamId);
            
            // Show loading
            this.videoPlayer.showLoading('Loading stream...');
            
            const streamUrl = await this.apiService.getStreamPlaylist(streamId);
            logger.log('Playlist data received:', streamUrl);
            
            if (!streamUrl || typeof streamUrl !== 'string') {
                logger.error('Invalid stream URL:', streamUrl);
                throw new Error('No valid stream URL found in response');
            }
            
            this.videoPlayer.playStream(streamUrl, streamName, streamId, tvArchive, tvArchiveDuration);
            
            // Notify mobile navigation
            this.mobileNav.onStreamStarted();
            
        } catch (error) {
            logger.error('Stream loading error:', error);
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
                logger.log('Favorites load request outdated, skipping UI update');
                return;
            }
            
            // Filter to only favorite streams
            const favoriteStreams = this.favoritesService.filterFavoriteStreams(allStreams || []);
            logger.log(`?? FAVORITES FILTER: ${allStreams?.length || 0} total streams ? ${favoriteStreams.length} favorites`);
            logger.log(`?? Current favorites IDs:`, this.favoritesService.getFavorites());
            if (favoriteStreams.length > 0) {
                logger.log(`?? Favorite streams:`, favoriteStreams.map(s => ({ id: s.stream_id, name: s.name })));
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
        logger.log(`Stream ${streamId} favorite status changed to: ${isFavorite}`);
    }

    handleFavoriteChange(streamId, isFavorite) {
        // This is called by the favorites service when any favorite changes
        // Update UI elements that need to reflect the change
        logger.log(`handleFavoriteChange: Stream ${streamId} favorite status changed to ${isFavorite}`);
        
        // Update stream list stars
        this.streamList.updateStreamFavoriteStatus(streamId, isFavorite);
        
        // Update video player star
        this.videoPlayer.updateCurrentStreamFavoriteStatus(streamId, isFavorite);
        
        // Update favorites count in category list
        const favoritesCount = this.favoritesService.getFavoriteCount();
        logger.log('Updated favorites count:', favoritesCount);
        const favoritesItem = document.querySelector('[data-category-id="favorites"] .category-count');
        if (favoritesItem) {
            favoritesItem.textContent = `(${favoritesCount})`;
            logger.log('Updated favorites count in UI');
        } else {
            logger.log('Favorites count element not found');
        }
        
        // If we're currently viewing favorites and a stream was unfavorited, refresh the list
        if (this.currentCategory === 'favorites' && !isFavorite) {
            logger.log('Refreshing favorites list after unfavoriting');
            // Small delay to allow the UI to update before refreshing
            setTimeout(() => {
                this.loadFavoriteStreams();
            }, 100);
        }
    }

    handleCategoryFavoriteToggle(categoryId, isFavorite) {
        // This is called when a category favorite is toggled from category list
        // The favorites service will handle the actual toggle and notify all listeners
        logger.log(`Category ${categoryId} favorite status changed to: ${isFavorite}`);
    }

    handleCategoryFavoriteChange(categoryId, isFavorite) {
        // This is called by the favorites service when any category favorite changes
        // Update UI elements that need to reflect the change
        logger.log(`handleCategoryFavoriteChange: Category ${categoryId} favorite status changed to ${isFavorite}`);
        
        // Re-render category list to update Favorite Categories section
        if (this.categories && this.categories.length > 0) {
            let allChannelsCount = 0;
            try {
                const favoritesItem = document.querySelector('[data-category-id="all"] .category-count');
                if (favoritesItem) {
                    const match = favoritesItem.textContent.match(/\((\d+)\)/);
                    if (match) {
                        allChannelsCount = parseInt(match[1], 10);
                    }
                }
            } catch (e) {
                // Ignore errors
            }
            
            const favoritesCount = this.favoritesService.getFavoriteCount();
            this.categoryList.render(this.categories, allChannelsCount, favoritesCount);
            
            // Restore selection if a category was selected
            if (this.currentCategory) {
                this.categoryList.selectCategory(this.currentCategory);
            }
        }
    }

    // EPG Methods
    setupTimezoneSelector() {
        const selector = document.getElementById('timezoneSelector');
        if (!selector) return;

        const timezones = TimezoneUtils.getTimezoneList();
        const currentTimezone = TimezoneUtils.getTimezone();

        timezones.forEach(tz => {
            const option = document.createElement('option');
            option.value = tz.value;
            option.textContent = tz.label;
            if (tz.value === currentTimezone) {
                option.selected = true;
            }
            selector.appendChild(option);
        });

        selector.addEventListener('change', (e) => {
            const timezone = e.target.value;
            TimezoneUtils.setTimezone(timezone);
            this.epgPanel.setTimezone(timezone);
            // Re-render EPG with new timezone
            this.loadEPGData(false);
        });
    }

    async openEPGPanel() {
        const panel = document.getElementById('epgPanel');
        if (!panel) return;

        panel.classList.add('open');
        
        // Load EPG data if not already loaded
        await this.loadEPGData(false);
    }

    closeEPGPanel() {
        const panel = document.getElementById('epgPanel');
        if (panel) {
            panel.classList.remove('open');
        }
    }

    async loadEPGData(forceRefresh = false) {
        try {
            // Get all streams for matching
            let allStreams = await this.storageService.getFromIndexedDB('streams', 'all_streams');
            if (!allStreams) {
                // If no cached streams, we can't match channels
                this.epgPanel.showError('Please load channels first to enable EPG');
                return;
            }

            // Check cache first
            let epgData = null;
            if (!forceRefresh) {
                epgData = await this.epgService.getEPGData();
                if (epgData && epgData.channels && epgData.channels.length > 0) {
                    // Render cached data
                    this.epgPanel.render(epgData.channels, epgData.programmes || {});
                    this.epgPanel.scrollToCurrentTime();
                    // Update latest end time display
                    this.epgPanel.updateLatestEndTime(epgData.latestProgrammeEndTime);
                    return;
                }
            }

            // Show loading
            this.epgPanel.showLoading('Loading EPG data...');

            // Set up progress callback
            this.epgService.setProgressCallback((progress) => {
                const message = progress.message || 'Loading...';
                this.epgPanel.showLoading(message);
            });

            // Fetch and parse EPG
            epgData = await this.epgService.fetchAndParseEPG(allStreams);

            // Render EPG data
            if (epgData && epgData.channels) {
                this.epgPanel.render(epgData.channels, epgData.programmes || {});
                this.epgPanel.scrollToCurrentTime();
                // Update latest end time display
                this.epgPanel.updateLatestEndTime(epgData.latestProgrammeEndTime);
            } else {
                this.epgPanel.showError('No EPG data available for your channels');
            }

        } catch (error) {
            logger.error('EPG load error:', error);
            this.epgPanel.showError(`Failed to load EPG: ${error.message}`);
        }
    }

    async refreshEPG() {
        await this.loadEPGData(true);
    }

    async handleEPGChannelClick(channelId) {
        try {
            // Find the channel in EPG data
            const epgData = await this.epgService.getEPGData();
            if (!epgData || !epgData.channels) {
                logger.error('No EPG data available');
                return;
            }

            const channel = epgData.channels.find(c => c.id === channelId);
            if (!channel) {
                logger.error('Channel not found:', channelId);
                return;
            }

            // Get stream info from channel
            const streamId = channel.streamId;
            const categoryId = channel.categoryId;
            const streamName = channel.streamName || channel.displayName;

            if (!streamId) {
                logger.error('No stream ID for channel:', channelId);
                return;
            }

            // Close EPG panel
            this.closeEPGPanel();

            // Select category if we have one
            if (categoryId && this.categories.find(c => c.category_id === categoryId)) {
                await this.handleCategorySelect(categoryId);
                // Small delay to ensure streams are loaded
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Find the stream object to get catchup info
            const stream = this.streamList.allStreams.find(s => s.stream_id == streamId);
            const tvArchive = stream ? stream.tv_archive : null;
            const tvArchiveDuration = stream ? stream.tv_archive_duration : null;

            // Load and play the stream
            await this.handleWatchStream(streamId, streamName, tvArchive, tvArchiveDuration);

        } catch (error) {
            logger.error('EPG channel click error:', error);
            alert(`Failed to load channel: ${error.message}`);
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

    // View Switching Methods
    async toggleView() {
        if (this.currentView === 'live') {
            await this.showSeriesView();
        } else {
            this.showLiveView();
        }
    }

    async showSeriesView() {
        logger.log('Switching to Series view');
        
        // Hide live view
        document.getElementById('mainContainer').style.display = 'none';
        
        // Initialize series app if not already done
        if (!this.seriesApp) {
            this.seriesApp = new SeriesApp(
                this.apiService,
                this.storageService,
                this.favoritesService
            );
            await this.seriesApp.init();
        }
        
        // Show series view
        this.seriesApp.show();
        
        this.currentView = 'series';
        
        // Update button state
        const seriesToggle = document.getElementById('seriesToggle');
        if (seriesToggle) {
            seriesToggle.textContent = 'Live TV';
            seriesToggle.classList.add('active');
        }
    }

    showLiveView() {
        logger.log('Switching to Live view');
        
        // Hide series view
        if (this.seriesApp) {
            this.seriesApp.hide();
        }
        
        // Show live view
        document.getElementById('mainContainer').style.display = 'flex';
        
        this.currentView = 'live';
        
        // Update button state
        const seriesToggle = document.getElementById('seriesToggle');
        if (seriesToggle) {
            seriesToggle.textContent = 'Series';
            seriesToggle.classList.remove('active');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    logger.log('IPTV Player initializing...');
    try {
        window.app = new IPTVApp();
        logger.log('IPTV Player initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize IPTV Player:', error);
    }
});

