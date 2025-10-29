// App Controller - Main application orchestration
import { ApiService } from '../services/apiService.js';
import { StorageService } from '../services/storageService.js';
import { VideoPlayer } from '../components/videoPlayer.js';
import { CategoryList } from '../components/categoryList.js';
import { StreamList } from '../components/streamList.js';
import { UserInfo } from '../components/userInfo.js';
import { SettingsPanel } from '../components/settingsPanel.js';
import { MobileNavigation } from '../utils/mobileNavigation.js';

export class AppController {
    constructor() {
        this.initializeServices();
        this.initializeComponents();
        this.initializeEventListeners();
    }

    initializeServices() {
        this.apiService = new ApiService();
        this.storageService = new StorageService();
    }

    initializeComponents() {
        this.videoPlayer = new VideoPlayer();
        this.categoryList = new CategoryList();
        this.streamList = new StreamList();
        this.userInfo = new UserInfo();
        this.settingsPanel = new SettingsPanel();
        this.mobileNav = new MobileNavigation();
    }

    initializeEventListeners() {
        // Settings panel events
        document.getElementById('settingsToggle').addEventListener('click', () => {
            this.settingsPanel.toggle();
        });

        document.getElementById('settingsClose').addEventListener('click', () => {
            this.settingsPanel.close();
        });

        // Account panel events
        document.getElementById('accountToggle').addEventListener('click', () => {
            this.userInfo.toggle();
        });

        document.getElementById('accountClose').addEventListener('click', () => {
            this.userInfo.close();
        });

        // Video panel events
        document.getElementById('closeVideoPanel').addEventListener('click', () => {
            this.videoPlayer.closeVideoPanel();
        });

        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            this.handleLogin(e);
        });

        // Category and stream events
        this.setupCategoryEvents();
        this.setupStreamEvents();
    }

    setupCategoryEvents() {
        document.getElementById('refreshCategories').addEventListener('click', () => {
            this.loadCategories();
        });

        document.getElementById('categorySearch').addEventListener('input', (e) => {
            this.categoryList.filterCategories(e.target.value);
        });

        document.getElementById('clearCategorySearch').addEventListener('click', () => {
            this.categoryList.clearSearch();
        });
    }

    setupStreamEvents() {
        document.getElementById('refreshStreams').addEventListener('click', () => {
            this.refreshCurrentStreams();
        });

        document.getElementById('streamSearch').addEventListener('input', (e) => {
            this.streamList.filterStreams(e.target.value);
        });

        document.getElementById('clearStreamSearch').addEventListener('click', () => {
            this.streamList.clearSearch();
        });

        document.getElementById('filterMarkersCheckbox').addEventListener('change', (e) => {
            this.streamList.toggleMarkerFilter(e.target.checked);
        });
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const credentials = {
            serverUrl: document.getElementById('serverUrl').value.trim(),
            username: document.getElementById('username').value.trim(),
            password: document.getElementById('password').value.trim()
        };

        if (!this.validateCredentials(credentials)) {
            return;
        }

        try {
            await this.attemptLogin(credentials);
        } catch (error) {
            alert(`Login failed: ${error.message}`);
        }
    }

    validateCredentials(credentials) {
        const { serverUrl, username, password } = credentials;
        
        if (!serverUrl || !username || !password) {
            alert('Please fill in all fields');
            return false;
        }

        try {
            new URL(serverUrl);
        } catch {
            alert('Please enter a valid server URL');
            return false;
        }

        return true;
    }

    async attemptLogin(credentials) {
        this.apiService.setCredentials(credentials);
        
        // Test connection
        const userInfo = await this.apiService.getUserInfo();
        
        // Save credentials and show main interface
        await this.storageService.saveCredentials(credentials);
        await this.storageService.saveUserInfo(userInfo);
        
        this.settingsPanel.close();
        this.showMainInterface(userInfo);
        
        // Load initial data
        await this.loadCategories();
    }

    async showMainInterface(userInfo) {
        document.getElementById('mainContainer').style.display = 'block';
        this.userInfo.updateUserInfo(userInfo);
    }

    async loadCategories() {
        try {
            this.categoryList.showLoading();
            const categories = await this.apiService.getLiveCategories();
            
            // Get stream counts for categories
            const categoriesWithCounts = await this.enrichCategoriesWithCounts(categories);
            
            this.categoryList.displayCategories(categoriesWithCounts, (categoryId) => {
                this.handleCategorySelect(categoryId);
            });
            
        } catch (error) {
            this.categoryList.showError(`Failed to load categories: ${error.message}`);
        }
    }

    async enrichCategoriesWithCounts(categories) {
        const enrichmentPromises = categories.map(async (category) => {
            try {
                const streams = await this.apiService.getLiveStreams(category.category_id);
                return { ...category, stream_count: streams.length };
            } catch (error) {
                console.warn('Could not get category stream count:', error);
                return category;
            }
        });

        return await Promise.all(enrichmentPromises);
    }

    async handleCategorySelect(categoryId) {
        try {
            this.streamList.showLoading();
            const streams = await this.apiService.getLiveStreams(categoryId);
            
            this.streamList.displayStreams(streams, (streamId, streamName) => {
                this.handleStreamSelect(streamId, streamName);
            });
            
            this.mobileNav.onCategorySelected();
            
        } catch (error) {
            this.streamList.showError(`Failed to load streams: ${error.message}`);
        }
    }

    async handleStreamSelect(streamId, streamName) {
        try {
            this.videoPlayer.showLoading('Loading stream...');
            
            const streamUrl = await this.apiService.getStreamPlaylist(streamId);
            
            if (!streamUrl || (!streamUrl.includes('http') && !streamUrl.includes('m3u8'))) {
                throw new Error('No valid stream URL found in response');
            }
            
            this.mobileNav.onStreamStarted();
            this.videoPlayer.playStream(streamUrl, streamName);
            
        } catch (error) {
            console.error('Stream loading error:', error);
            this.videoPlayer.showError('STREAM_LOAD_ERROR', `Error: ${error.message}`);
        }
    }

    refreshCurrentStreams() {
        const activeCategory = this.categoryList.getActiveCategory();
        if (activeCategory) {
            this.handleCategorySelect(activeCategory);
        }
    }

    // Initialization
    async initialize() {
        try {
            await this.storageService.init();
            const savedCredentials = await this.storageService.getCredentials();
            
            if (savedCredentials) {
                this.apiService.setCredentials(savedCredentials);
                const userInfo = await this.storageService.getUserInfo();
                
                if (userInfo) {
                    await this.showMainInterface(userInfo);
                    await this.loadCategories();
                } else {
                    this.settingsPanel.open();
                }
            } else {
                this.settingsPanel.open();
            }
        } catch (error) {
            console.error('Failed to initialize IPTV Player:', error);
            this.settingsPanel.open();
        }
    }
}