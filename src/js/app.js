// Main Application

import { StorageService } from './services/storageService.js';
import { ApiService } from './services/apiService.js';
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
        this.videoPlayer = new VideoPlayer();
        this.mobileNav = new MobileNavigation();
        
        this.categories = [];
        this.currentCategory = null;
        this.currentCategoryName = 'All Channels';
        
        this.init();
    }

    async init() {
        try {
            await this.storageService.init();
        } catch (error) {
            console.warn('IndexedDB initialization failed:', error);
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
        
        this.settingsPanel.setOnSubmit((serverUrl, username, password) => {
            this.handleLogin(serverUrl, username, password);
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
            
            // Reload streams from cache
            if (this.currentCategory) {
                this.loadStreams(false);
            }
            
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
            
            // Re-render current streams with new filter
            if (this.currentCategory) {
                this.loadStreams(false);
            }
        });
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
            
            this.categoryList.render(categories, allChannelsCount);
            
        } catch (error) {
            this.categoryList.showError(`Failed to load categories: ${error.message}`);
        }
    }

    async handleCategorySelect(categoryId) {
        this.currentCategory = categoryId;
        
        // Scroll to top of streams container on category change (especially important for mobile)
        setTimeout(() => {
            const streamsContainer = document.getElementById('streamsContainer');
            if (streamsContainer) {
                streamsContainer.scrollTop = 0;
            }
        }, 50);
        
        // Update category count if not already loaded (exclude "All Channels")
        if (categoryId !== 'all') {
            const categoryItem = document.querySelector(`[data-category-id="${categoryId}"]`);
            const countSpan = categoryItem.querySelector('.category-count');
            
            if (!countSpan) {
                try {
                    const streams = await this.apiService.getLiveStreams(categoryId);
                    const count = streams ? streams.length : 0;
                    
                    const nameSpan = categoryItem.querySelector('span:first-child');
                    if (nameSpan) {
                        const countHtml = `<span class="category-count">(${count})</span>`;
                        nameSpan.insertAdjacentHTML('afterend', countHtml);
                    }
                    
                    const category = this.categories.find(c => c.category_id === categoryId);
                    if (category) {
                        category.stream_count = count;
                    }
                    
                    await this.storageService.saveToIndexedDB('categories', 'live_categories', this.categories);
                } catch (error) {
                    console.error('Failed to get category count:', error);
                }
            }
        }
        
        // Load streams for the new category
        await this.loadStreams();
        
        // Apply any existing search term to the new category
        const searchBox = document.getElementById('streamSearch');
        if (searchBox && searchBox.value.trim()) {
            await this.filterStreams(searchBox.value);
        }
        
        // Notify mobile navigation
        this.mobileNav.onCategorySelected();
    }

    // Stream Management
    async loadStreams(forceRefresh = false) {
        if (!this.currentCategory) return;
        
        try {
            // Show the right panel header
            const rightPanelHeader = document.querySelector('.right-panel .panel-header');
            if (rightPanelHeader) {
                rightPanelHeader.classList.remove('hidden');
            }
            
            this.streamList.showLoading('Loading streams...');
            
            let streams = null;
            const cacheKey = this.currentCategory === 'all' ? 'all_streams' : `category_${this.currentCategory}`;
            
            if (!forceRefresh) {
                streams = await this.storageService.getFromIndexedDB('streams', cacheKey);
            }
            
            if (!streams && forceRefresh) {
                streams = await this.apiService.getLiveStreams(
                    this.currentCategory === 'all' ? null : this.currentCategory
                );
                streams = streams.sort((a, b) => {
                    const nameA = a.name ? a.name.toLowerCase() : '';
                    const nameB = b.name ? b.name.toLowerCase() : '';
                    return nameA.localeCompare(nameB);
                });
                await this.storageService.saveToIndexedDB('streams', cacheKey, streams);
            }
            
            if (!streams && !forceRefresh) {
                streams = await this.apiService.getLiveStreams(
                    this.currentCategory === 'all' ? null : this.currentCategory
                );
                streams = streams.sort((a, b) => {
                    const nameA = a.name ? a.name.toLowerCase() : '';
                    const nameB = b.name ? b.name.toLowerCase() : '';
                    return nameA.localeCompare(nameB);
                });
                await this.storageService.saveToIndexedDB('streams', cacheKey, streams);
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
        if (this.currentCategory !== 'all') {
            const category = this.categories.find(c => c.category_id === this.currentCategory);
            if (category) {
                const parts = category.category_name.split('|');
                categoryName = parts[1] ? parts[1].trim() : category.category_name;
            }
        }
        this.currentCategoryName = categoryName;
    }

    async filterStreams(searchTerm) {
        const term = searchTerm.trim().toLowerCase();
        
        // If no search term, reload original streams from cache
        if (!term) {
            // Reload from cache to ensure we show the full category, not previously filtered results
            await this.loadStreams(false);
            return;
        }
        
        // Always fetch fresh streams from cache for search
        try {
            const cacheKey = this.currentCategory === 'all' ? 'all_streams' : `category_${this.currentCategory}`;
            let streams = await this.storageService.getFromIndexedDB('streams', cacheKey);
            
            // If not in cache, need to load them first
            if (!streams) {
                await this.loadStreams(false);
                streams = this.streamList.getFilteredStreams();
            }
            
            // Filter by search term only
            const filtered = streams.filter(stream => {
                const name = stream.name ? stream.name.toLowerCase() : '';
                return name.includes(term);
            });
            
            // Show all filtered results with lazy loading (start with 50)
            this.streamList.visibleStreams = 50;
            // Store filtered streams so render can apply marker filter
            // render will call: this.allStreams = filteredStreams where filteredStreams = filtered (after marker filter)
            this.streamList.render(filtered, this.currentCategoryName);
        } catch (error) {
            console.error('Error filtering streams:', error);
            // Fallback: reload streams
            await this.loadStreams(false);
        }
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
            
            this.videoPlayer.playStream(streamUrl, streamName);
            
            // Notify mobile navigation
            this.mobileNav.onStreamStarted();
            
        } catch (error) {
            console.error('Stream loading error:', error);
            this.videoPlayer.showError(`Error: ${error.message}`);
            document.getElementById('playerSection').classList.add('open');
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

