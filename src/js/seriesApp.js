// Series App Controller

import { SeriesCategoryList } from './components/seriesCategoryList.js';
import { SeriesList } from './components/seriesList.js';
import { SeriesInfoPanel } from './components/seriesInfoPanel.js';
import { debounce } from './utils/debounce.js';
import { toggleClearButton } from './utils/domHelpers.js';
import { logger } from './utils/logger.js';

export class SeriesApp {
    constructor(apiService, storageService, favoritesService, videoPlayer) {
        this.apiService = apiService;
        this.storageService = storageService;
        this.favoritesService = favoritesService;
        this.videoPlayer = videoPlayer;
        
        this.categories = [];
        this.currentCategory = null;
        this.currentCategoryName = 'All Series';
        this.allSeries = [];
        
        // Request tracking for preventing race conditions
        this.currentCategoryLoadId = 0;
        this.currentSeriesLoadId = 0;
        
        this.initialized = false;
    }

    async init() {
        if (this.initialized) {
            logger.log('SeriesApp already initialized');
            return;
        }

        this.setupComponents();
        this.setupEventListeners();
        
        // Load categories
        await this.loadCategories();
        
        this.initialized = true;
        logger.log('SeriesApp initialized');
    }

    setupComponents() {
        // Initialize components
        this.categoryList = new SeriesCategoryList('seriesCategoriesContainer');
        this.seriesList = new SeriesList('seriesListContainer');
        this.seriesInfoPanel = new SeriesInfoPanel('seriesDetailPanel');
        
        // Setup component callbacks
        this.categoryList.setOnCategorySelect((categoryId) => {
            this.handleCategorySelect(categoryId);
        });
        
        this.seriesList.setOnSeriesClick((seriesId) => {
            this.handleSeriesClick(seriesId);
        });

        // Set up favorites service connections
        this.seriesList.setFavoritesService(this.favoritesService);
        this.seriesList.setOnFavoriteToggle((seriesId, isFavorite) => {
            this.handleSeriesFavoriteToggle(seriesId, isFavorite);
        });

        this.seriesInfoPanel.setFavoritesService(this.favoritesService);
        this.seriesInfoPanel.setOnFavoriteToggle((seriesId, isFavorite) => {
            this.handleSeriesFavoriteToggle(seriesId, isFavorite);
        });

        this.seriesInfoPanel.setOnPlayEpisode((episodeId, episodeTitle, extension) => {
            this.handlePlayEpisode(episodeId, episodeTitle, extension);
        });

        this.seriesInfoPanel.setOnClose(() => {
            this.seriesInfoPanel.hide();
        });

        // Set up favorites change listener
        this.favoritesService.setOnSeriesFavoriteChange((seriesId, isFavorite) => {
            this.handleSeriesFavoriteChange(seriesId, isFavorite);
        });
    }

    setupEventListeners() {
        // Refresh buttons
        const refreshCategoriesBtn = document.getElementById('refreshSeriesCategories');
        if (refreshCategoriesBtn) {
            refreshCategoriesBtn.addEventListener('click', () => {
                this.loadCategories(true);
            });
        }

        const refreshSeriesBtn = document.getElementById('refreshSeriesList');
        if (refreshSeriesBtn) {
            refreshSeriesBtn.addEventListener('click', () => {
                this.loadSeries(true);
            });
        }

        // Search boxes with debounce
        const debouncedSeriesSearch = debounce((term) => {
            this.filterSeries(term);
        }, 300);

        const seriesSearchBox = document.getElementById('seriesSearch');
        if (seriesSearchBox) {
            seriesSearchBox.addEventListener('input', (e) => {
                const term = e.target.value;
                toggleClearButton('clearSeriesSearch', term);
                debouncedSeriesSearch(term);
            });
        }

        const clearSeriesSearchBtn = document.getElementById('clearSeriesSearch');
        if (clearSeriesSearchBtn) {
            clearSeriesSearchBtn.addEventListener('click', () => {
                if (seriesSearchBox) {
                    seriesSearchBox.value = '';
                    toggleClearButton(seriesSearchBox, 'clearSeriesSearch');
                    this.filterSeries('');
                }
            });
        }

        const debouncedCategorySearch = debounce((term) => {
            this.filterCategories(term);
        }, 300);

        const categorySearchBox = document.getElementById('seriesCategorySearch');
        if (categorySearchBox) {
            categorySearchBox.addEventListener('input', (e) => {
                const term = e.target.value;
                toggleClearButton('clearSeriesCategorySearch', term);
                debouncedCategorySearch(term);
            });
        }

        const clearCategorySearchBtn = document.getElementById('clearSeriesCategorySearch');
        if (clearCategorySearchBtn) {
            clearCategorySearchBtn.addEventListener('click', () => {
                if (categorySearchBox) {
                    categorySearchBox.value = '';
                    toggleClearButton(categorySearchBox, 'clearSeriesCategorySearch');
                    this.filterCategories('');
                }
            });
        }
    }

    async loadCategories(forceRefresh = false) {
        const loadId = ++this.currentCategoryLoadId;
        
        try {
            this.categoryList.showLoading('Loading categories...');
            
            let categories = null;
            
            // Try cache first if not forcing refresh
            if (!forceRefresh) {
                categories = await this.storageService.getSeriesCategories();
                if (categories) {
                    logger.log('Loaded series categories from cache');
                }
            }
            
            // Fetch from API if no cache or forcing refresh
            if (!categories) {
                logger.log('Fetching series categories from API...');
                categories = await this.apiService.getSeriesCategories();
                
                // Save to cache
                await this.storageService.saveSeriesCategories(categories);
            }
            
            // Check if this request is still valid
            if (loadId !== this.currentCategoryLoadId) {
                logger.log('Category load outdated, skipping');
                return;
            }
            
            this.categories = categories || [];
            
            // Load all series to get count
            await this.loadAllSeries(forceRefresh);
            
            const favoritesCount = this.favoritesService.getSeriesFavoriteCount();
            
            this.categoryList.render(this.categories, this.allSeries.length, favoritesCount);
            
            // Auto-select "All Series" on first load
            if (this.currentCategory === null) {
                this.categoryList.selectCategory('all');
                await this.loadSeries(forceRefresh);
            }
            
        } catch (error) {
            logger.error('Failed to load series categories:', error);
            this.categoryList.showError('Failed to load categories. Please check your connection.');
        }
    }

    async loadAllSeries(forceRefresh = false) {
        try {
            let series = null;
            
            // Try cache first if not forcing refresh
            if (!forceRefresh) {
                series = await this.storageService.getSeries(null);
                if (series) {
                    logger.log('Loaded all series from cache');
                }
            }
            
            // Fetch from API if no cache or forcing refresh
            if (!series) {
                logger.log('Fetching all series from API...');
                series = await this.apiService.getSeries(null);
                
                // Save to cache
                await this.storageService.saveSeries(null, series);
            }
            
            this.allSeries = series || [];
            
        } catch (error) {
            logger.error('Failed to load all series:', error);
            this.allSeries = [];
        }
    }

    async handleCategorySelect(categoryId) {
        this.currentCategory = categoryId;
        
        // Update category name
        if (categoryId === 'all') {
            this.currentCategoryName = 'All Series';
        } else if (categoryId === 'favorites') {
            this.currentCategoryName = 'Favorites';
        } else {
            const category = this.categories.find(c => c.category_id === categoryId);
            this.currentCategoryName = category ? category.category_name : 'Unknown Category';
        }
        
        // Clear search
        const searchBox = document.getElementById('seriesSearch');
        if (searchBox) {
            searchBox.value = '';
            toggleClearButton('clearSeriesSearch', '');
        }
        
        // Reset series list search state
        this.seriesList.resetSearch();
        
        // Load series for this category
        await this.loadSeries();
        
        // Show right panel header
        const rightPanelHeader = document.querySelector('.series-right-panel .panel-header');
        if (rightPanelHeader) {
            rightPanelHeader.classList.remove('hidden');
        }
    }

    async loadSeries(forceRefresh = false) {
        const loadId = ++this.currentSeriesLoadId;
        
        try {
            this.seriesList.showLoading('Loading series...');
            
            let series = [];
            
            if (this.currentCategory === 'favorites') {
                // Show favorites
                series = this.favoritesService.filterFavoriteSeries(this.allSeries);
            } else if (this.currentCategory === 'all') {
                // Show all series
                series = this.allSeries;
            } else {
                // Load series for specific category
                let categorySeries = null;
                
                // Try cache first if not forcing refresh
                if (!forceRefresh) {
                    categorySeries = await this.storageService.getSeries(this.currentCategory);
                    if (categorySeries) {
                        logger.log(`Loaded series for category ${this.currentCategory} from cache`);
                    }
                }
                
                // Fetch from API if no cache or forcing refresh
                if (!categorySeries) {
                    logger.log(`Fetching series for category ${this.currentCategory} from API...`);
                    categorySeries = await this.apiService.getSeries(this.currentCategory);
                    
                    // Save to cache
                    await this.storageService.saveSeries(this.currentCategory, categorySeries);
                }
                
                series = categorySeries || [];
            }
            
            // Check if this request is still valid
            if (loadId !== this.currentSeriesLoadId) {
                logger.log('Series load outdated, skipping');
                return;
            }
            
            this.seriesList.render(series, this.currentCategoryName);
            
        } catch (error) {
            logger.error('Failed to load series:', error);
            this.seriesList.showError('Failed to load series. Please try again.');
        }
    }

    async handleSeriesClick(seriesId) {
        try {
            this.seriesInfoPanel.showLoading();
            
            let seriesInfo = null;
            
            // Try cache first
            seriesInfo = await this.storageService.getSeriesInfo(seriesId);
            if (seriesInfo) {
                logger.log(`Loaded series info for ${seriesId} from cache`);
            } else {
                // Fetch from API
                logger.log(`Fetching series info for ${seriesId} from API...`);
                seriesInfo = await this.apiService.getSeriesInfo(seriesId);
                
                // Save to cache
                await this.storageService.saveSeriesInfo(seriesId, seriesInfo);
            }
            
            this.seriesInfoPanel.render(seriesInfo);
            
        } catch (error) {
            logger.error('Failed to load series info:', error);
            this.seriesInfoPanel.showError('Failed to load series information. Please try again.');
        }
    }

    async handlePlayEpisode(episodeId, episodeTitle, extension) {
        try {
            logger.log(`Playing episode ${episodeId}: ${episodeTitle} (${extension})`);
            
            // Show loading in video panel
            this.videoPlayer.showLoading('Loading episode...');
            
            // Get episode stream URL
            const streamUrl = await this.apiService.getEpisodeStreamUrl(episodeId, extension);
            logger.log('Episode stream URL:', streamUrl);
            
            if (!streamUrl || typeof streamUrl !== 'string') {
                logger.error('Invalid episode URL:', streamUrl);
                throw new Error('No valid episode URL found');
            }
            
            // Check if it's an MKV file - use direct video playback
            if (streamUrl.toLowerCase().includes('.mkv') || extension === 'mkv') {
                logger.log('MKV file detected, using direct video playback');
                this.playDirectVideo(streamUrl, episodeTitle, episodeId);
            } else {
                // Play using HLS video player
                this.videoPlayer.playStream(streamUrl, episodeTitle, episodeId);
            }
            
            // Hide series detail panel when playing
            this.seriesInfoPanel.hide();
            
        } catch (error) {
            logger.error('Failed to play episode:', error);
            this.videoPlayer.showError(`Error: ${error.message}`);
        }
    }

    playDirectVideo(videoUrl, title, episodeId) {
        // For MKV and other direct video files, use native HTML5 video player
        const videoPanel = document.getElementById('videoPanel');
        const videoLarge = document.getElementById('videoPlayerLarge');
        const videoPanelTitle = document.getElementById('videoPanelTitle');
        const fallbackLinkLarge = document.getElementById('fallbackLinkLarge');
        const fallbackUrlLarge = document.getElementById('fallbackUrlLarge');
        const videoInfoDetails = document.getElementById('videoInfoDetails');
        
        // Cleanup any existing HLS player
        if (this.videoPlayer.hlsPlayer) {
            this.videoPlayer.hlsPlayer.destroy();
            this.videoPlayer.hlsPlayer = null;
        }
        
        // Update UI
        videoPanelTitle.textContent = title;
        videoInfoDetails.innerHTML = '<span class="stat-item">Direct video playback (MKV)</span>';
        fallbackUrlLarge.href = videoUrl;
        fallbackUrlLarge.textContent = videoUrl;
        fallbackLinkLarge.style.display = 'block';
        
        // Show video panel
        videoPanel.style.display = 'flex';
        
        // Clear any errors
        const videoPanelError = document.getElementById('videoPanelError');
        if (videoPanelError) {
            videoPanelError.style.display = 'none';
        }
        
        // Set video source directly
        videoLarge.src = videoUrl;
        videoLarge.load();
        
        // Try to play
        const playPromise = videoLarge.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                logger.error('Video play error:', error);
                if (error.name === 'NotSupportedError') {
                    this.videoPlayer.showError('This video format (MKV) may not be supported by your browser. Please try using the direct link with VLC or another media player.');
                } else if (error.name === 'NotAllowedError') {
                    logger.log('Autoplay blocked - user interaction required');
                } else {
                    this.videoPlayer.showError(`Playback error: ${error.message}. Try using the direct link.`);
                }
            });
        }
        
        logger.log('Direct video playback started for:', videoUrl);
    }

    handleSeriesFavoriteToggle(seriesId, isFavorite) {
        logger.log(`Series favorite toggled: ${seriesId} = ${isFavorite}`);
        
        // Update category list counts
        const favoritesCount = this.favoritesService.getSeriesFavoriteCount();
        const allSeriesCount = this.allSeries.length;
        this.categoryList.render(this.categories, allSeriesCount, favoritesCount);
        
        // Re-select current category to update UI
        this.categoryList.selectCategory(this.currentCategory);
        
        // If viewing favorites, refresh the list
        if (this.currentCategory === 'favorites') {
            this.loadSeries();
        }
    }

    handleSeriesFavoriteChange(seriesId, isFavorite) {
        logger.log(`Series favorite changed: ${seriesId} = ${isFavorite}`);
        
        // Update series list favorite status
        if (seriesId) {
            this.seriesList.updateSeriesFavoriteStatus(seriesId, isFavorite);
        }
        
        // Update category counts
        const favoritesCount = this.favoritesService.getSeriesFavoriteCount();
        const allSeriesCount = this.allSeries.length;
        this.categoryList.render(this.categories, allSeriesCount, favoritesCount);
        
        // Re-select current category to maintain selection
        this.categoryList.selectCategory(this.currentCategory);
    }

    filterSeries(searchTerm) {
        this.seriesList.filter(searchTerm);
    }

    filterCategories(searchTerm) {
        this.categoryList.filter(searchTerm);
    }

    // Show the series view
    async show() {
        const seriesContainer = document.getElementById('seriesContainer');
        if (seriesContainer) {
            seriesContainer.style.display = 'flex';
        }
        
        // Initialize if not already done
        if (!this.initialized) {
            await this.init();
        } else {
            // If already initialized, ensure "All Series" is selected
            this.categoryList.selectCategory('all');
            this.currentCategory = 'all';
            this.currentCategoryName = 'All Series';
            await this.loadSeries(false);
            
            // Show right panel header
            const rightPanelHeader = document.querySelector('.series-right-panel .panel-header');
            if (rightPanelHeader) {
                rightPanelHeader.classList.remove('hidden');
            }
        }
    }

    // Hide the series view
    hide() {
        const seriesContainer = document.getElementById('seriesContainer');
        if (seriesContainer) {
            seriesContainer.style.display = 'none';
        }
        
        // Hide series detail panel
        this.seriesInfoPanel.hide();
    }
}
