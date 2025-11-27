// Series App Controller

import { SeriesCategoryList } from './components/seriesCategoryList.js';
import { SeriesList } from './components/seriesList.js';
import { SeriesInfoPanel } from './components/seriesInfoPanel.js';
import { TrackControls } from './components/trackControls.js';
import { TrackDetectionService } from './services/trackDetectionService.js';
import { VideoPlayer } from './components/videoPlayer.js';
import { debounce } from './utils/debounce.js';
import { toggleClearButton } from './utils/domHelpers.js';
import { logger } from './utils/logger.js';

export class SeriesApp {
    constructor(apiService, storageService, favoritesService, router = null) {
        this.apiService = apiService;
        this.storageService = storageService;
        this.favoritesService = favoritesService;
        this.router = router;
        
        // Create separate VideoPlayer instance for series
        this.seriesVideoPlayer = new VideoPlayer();
        this.seriesVideoPlayer.setApiService(apiService);
        
        // Override video player IDs to use series-specific elements
        this.initializeSeriesVideoPlayer();
        
        this.categories = [];
        this.currentCategory = null;
        this.currentCategoryName = 'All Series';
        this.allSeries = [];
        
        // Request tracking for preventing race conditions
        this.currentCategoryLoadId = 0;
        this.currentSeriesLoadId = 0;
        
        // Track controls
        this.trackControls = null;
        this.currentEpisodeInfo = null;
        this.currentSeriesId = null;
        this.currentEpisodeId = null;
        
        // Flag to prevent URL updates during route restoration
        this.skipUrlUpdate = false;
        
        this.initialized = false;
    }

    initializeSeriesVideoPlayer() {
        // Configure the series video player to use series-specific DOM elements
        // This prevents conflicts with the live TV video player
        this.seriesVideoElementIds = {
            videoPanel: 'seriesVideoPanel',
            videoPlayer: 'seriesVideoPlayerLarge',
            videoPanelTitle: 'seriesVideoPanelTitle',
            videoInfoDetails: 'seriesVideoInfoDetails',
            fallbackLinkLarge: 'seriesFallbackLinkLarge',
            fallbackUrlLarge: 'seriesFallbackUrlLarge',
            videoPanelError: 'seriesVideoPanelError',
            videoFavoriteStar: 'seriesVideoFavoriteStar'
        };
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
            this.currentSeriesId = null;
            
            // Update URL to remove series
            if (this.router && !this.skipUrlUpdate) {
                this.router.navigate({
                    view: 'series',
                    categoryId: this.currentCategory,
                    contentId: null,
                    episodeId: null,
                    playing: false
                });
            }
        });

        // Set up favorites change listener
        this.favoritesService.setOnSeriesFavoriteChange((seriesId, isFavorite) => {
            this.handleSeriesFavoriteChange(seriesId, isFavorite);
        });

        // Set up series video panel close button
        const closeSeriesVideoBtn = document.getElementById('closeSeriesVideoPanel');
        if (closeSeriesVideoBtn) {
            closeSeriesVideoBtn.addEventListener('click', () => {
                this.closeSeriesVideo();
            });
        }
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

    async handleCategorySelect(categoryId, skipUrlUpdate = false) {
        this.currentCategory = categoryId;
        
        // Update URL (unless skipped during route restoration)
        if (!skipUrlUpdate && !this.skipUrlUpdate && this.router) {
            this.router.navigate({
                view: 'series',
                categoryId: categoryId,
                contentId: null,
                episodeId: null,
                playing: false
            });
        }
        
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

    async handleSeriesClick(seriesId, skipUrlUpdate = false) {
        try {
            this.currentSeriesId = seriesId;
            
            // Update URL (unless skipped during route restoration)
            if (!skipUrlUpdate && !this.skipUrlUpdate && this.router) {
                this.router.navigate({
                    view: 'series',
                    categoryId: this.currentCategory,
                    contentId: seriesId,
                    episodeId: null,
                    playing: false
                });
            }
            
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

    async handlePlayEpisode(episodeId, episodeTitle, extension, skipUrlUpdate = false) {
        try {
            logger.log(`Playing episode ${episodeId}: ${episodeTitle} (${extension})`);
            
            this.currentEpisodeId = episodeId;
            
            // Update URL (unless skipped during route restoration)
            if (!skipUrlUpdate && !this.skipUrlUpdate && this.router) {
                this.router.navigate({
                    view: 'series',
                    categoryId: this.currentCategory,
                    contentId: this.currentSeriesId,
                    episodeId: episodeId,
                    playing: false
                });
            }
            
            // Get episode stream URL
            const streamUrl = await this.apiService.getEpisodeStreamUrl(episodeId, extension);
            logger.log('Episode stream URL:', streamUrl);
            
            if (!streamUrl || typeof streamUrl !== 'string') {
                logger.error('Invalid episode URL:', streamUrl);
                throw new Error('No valid episode URL found');
            }
            
            // Find episode info from current series info
            let episodeInfo = null;
            if (this.seriesInfoPanel.currentSeriesInfo) {
                const seriesInfo = this.seriesInfoPanel.currentSeriesInfo;
                const episodes = seriesInfo.episodes || {};
                
                // Search through all seasons for this episode
                for (const seasonKey in episodes) {
                    const seasonEpisodes = episodes[seasonKey] || [];
                    const episode = seasonEpisodes.find(ep => ep.id == episodeId || ep.episode_id == episodeId);
                    if (episode) {
                        episodeInfo = episode.info || episode;
                        break;
                    }
                }
            }
            
            // Store current episode info
            this.currentEpisodeInfo = episodeInfo;
            
            // Show series video panel and hide detail panel
            this.showSeriesVideoPanel();
            this.seriesInfoPanel.hide();
            
            // Always use direct video playback for episodes (MKV, MP4, etc.)
            // Most series episodes are MKV files that need direct playback
            this.playEpisodeDirectly(streamUrl, episodeTitle, episodeId, extension, episodeInfo);
            
        } catch (error) {
            logger.error('Failed to play episode:', error);
            this.showSeriesVideoError(`Error: ${error.message}`);
        }
    }

    showSeriesVideoPanel() {
        const videoPanel = document.getElementById(this.seriesVideoElementIds.videoPanel);
        const seriesContainer = document.getElementById('seriesContainer');
        
        // Ensure series container is in video mode
        if (seriesContainer) {
            seriesContainer.classList.add('watching-video');
        }
        
        if (videoPanel) {
            videoPanel.style.display = 'flex';
        }
    }

    hideSeriesVideoPanel() {
        const videoPanel = document.getElementById(this.seriesVideoElementIds.videoPanel);
        const seriesContainer = document.getElementById('seriesContainer');
        
        if (seriesContainer) {
            seriesContainer.classList.remove('watching-video');
        }
        
        if (videoPanel) {
            videoPanel.style.display = 'none';
        }
    }

    playEpisodeDirectly(videoUrl, title, episodeId, extension, episodeInfo = null) {
        // Use native HTML5 video player for all episodes
        const videoPlayer = document.getElementById(this.seriesVideoElementIds.videoPlayer);
        const videoPanelTitle = document.getElementById(this.seriesVideoElementIds.videoPanelTitle);
        const fallbackLinkLarge = document.getElementById(this.seriesVideoElementIds.fallbackLinkLarge);
        const fallbackUrlLarge = document.getElementById(this.seriesVideoElementIds.fallbackUrlLarge);
        const videoInfoDetails = document.getElementById(this.seriesVideoElementIds.videoInfoDetails);
        
        if (!videoPlayer) {
            logger.error('Series video player element not found');
            return;
        }
        
        // Update UI
        if (videoPanelTitle) {
            videoPanelTitle.textContent = title;
        }
        if (videoInfoDetails) {
            const format = extension.toUpperCase();
            videoInfoDetails.innerHTML = `<span class="stat-item">Direct video playback (${format})</span>`;
        }
        if (fallbackUrlLarge) {
            fallbackUrlLarge.href = videoUrl;
            fallbackUrlLarge.textContent = videoUrl;
        }
        if (fallbackLinkLarge) {
            fallbackLinkLarge.style.display = 'block';
        }
        
        // Clear any errors
        const videoPanelError = document.getElementById(this.seriesVideoElementIds.videoPanelError);
        if (videoPanelError) {
            videoPanelError.style.display = 'none';
        }
        
        // Clear existing sources
        videoPlayer.pause();
        videoPlayer.innerHTML = '';
        
        // **MKV TRICK**: Set type="video/mp4" to trick Chrome into playing MKV files
        // Create source element with type="video/mp4" regardless of actual format
        const source = document.createElement('source');
        source.src = videoUrl;
        source.type = 'video/mp4'; // This tricks Chrome into attempting playback
        videoPlayer.appendChild(source);
        
        videoPlayer.load();
        
        // Detect and initialize track controls once metadata is loaded
        videoPlayer.addEventListener('loadedmetadata', async () => {
            // Detect tracks from API data (episodeInfo.audio) or HTML5/MKV
            const detectedTracks = await TrackDetectionService.detectTracks({
                apiData: episodeInfo,
                videoElement: videoPlayer,
                videoUrl: videoUrl
            });
            
            if (!this.trackControls) {
                this.trackControls = new TrackControls('seriesTrackControlsContainer');
            }
            this.trackControls.setTracks({
                audioTracks: detectedTracks.audioTracks,
                subtitleTracks: detectedTracks.subtitleTracks,
                source: detectedTracks.source,
                videoElement: videoPlayer
            });
        }, { once: true });
        
        // Try to play
        const playPromise = videoPlayer.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                logger.log('Episode playback started successfully:', videoUrl);
            }).catch(error => {
                logger.error('Episode play error:', error);
                if (error.name === 'NotSupportedError') {
                    this.showSeriesVideoError('This video format may not be fully supported by your browser. Try using the direct link with VLC or another media player.');
                } else if (error.name === 'NotAllowedError') {
                    logger.log('Autoplay blocked - user interaction required');
                    this.showSeriesVideoError('Click the play button to start playback.');
                } else {
                    this.showSeriesVideoError(`Playback error: ${error.message}. Try using the direct link.`);
                }
            });
        }
        
        logger.log('Direct video playback initiated for:', videoUrl);
    }

    showSeriesVideoError(message) {
        const videoPanelError = document.getElementById(this.seriesVideoElementIds.videoPanelError);
        const videoContainer = document.querySelector('#' + this.seriesVideoElementIds.videoPanel + ' .video-container-large');
        
        if (videoPanelError) {
            videoPanelError.innerHTML = `
                <div class="error-container">
                    <div class="error-icon">??</div>
                    <div class="error-content">
                        <h3 class="error-title">Playback Error</h3>
                        <p class="error-message">${message}</p>
                        <div class="error-actions">
                            <button class="error-btn fallback-btn" onclick="document.getElementById('${this.seriesVideoElementIds.fallbackLinkLarge}').scrollIntoView()">
                                ?? Direct Link
                            </button>
                            <button class="error-btn close-btn" onclick="document.getElementById('closeSeriesVideoPanel').click()">
                                ? Close
                            </button>
                        </div>
                    </div>
                </div>
            `;
            videoPanelError.style.display = 'block';
        }
        
        if (videoContainer) {
            videoContainer.style.display = 'none';
        }
    }

    closeSeriesVideo() {
        const videoPlayer = document.getElementById(this.seriesVideoElementIds.videoPlayer);
        
        // Stop video playback
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.innerHTML = ''; // Clear sources
            videoPlayer.load();
        }
        
        // Hide track controls
        if (this.trackControls) {
            this.trackControls.hide();
        }
        
        // Reset episode info
        this.currentEpisodeInfo = null;
        this.currentEpisodeId = null;
        
        // Update URL to remove episode (back to series detail)
        if (this.router && !this.skipUrlUpdate && this.currentSeriesId) {
            this.router.navigate({
                view: 'series',
                categoryId: this.currentCategory,
                contentId: this.currentSeriesId,
                episodeId: null,
                playing: false
            });
        }
        
        // Hide video panel
        this.hideSeriesVideoPanel();
        
        // Show the series detail panel again (return to episodes list)
        if (this.seriesInfoPanel && this.seriesInfoPanel.currentSeriesInfo) {
            this.seriesInfoPanel.show();
        }
        
        logger.log('Series video closed - returned to episodes list');
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
    async show(skipReset = false) {
        const seriesContainer = document.getElementById('seriesContainer');
        if (seriesContainer) {
            seriesContainer.style.display = 'flex';
        }
        
        // Initialize if not already done
        if (!this.initialized) {
            await this.init();
        } else if (!skipReset) {
            // If already initialized and not restoring route, ensure "All Series" is selected
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

    /**
     * Handle route changes from browser navigation
     * @param {object} route - The route object
     */
    async handleRouteChange(route) {
        logger.log('SeriesApp: Handling route change', route);
        
        // Prevent URL updates during route handling
        this.skipUrlUpdate = true;
        
        try {
            // Handle category change
            if (route.categoryId && route.categoryId !== this.currentCategory) {
                this.categoryList.selectCategory(route.categoryId);
                await this.handleCategorySelect(route.categoryId, true);
            } else if (!route.categoryId && !route.contentId && this.currentCategory !== 'all') {
                // Default to 'all' if no category specified
                this.categoryList.selectCategory('all');
                await this.handleCategorySelect('all', true);
            }
            
            // Handle series detail
            if (route.contentId) {
                await this.navigateToSeries(route.contentId);
                
                // Handle episode playback
                if (route.episodeId) {
                    await this.navigateToEpisode(route.contentId, route.episodeId);
                }
            } else {
                // Close any open panels if no series specified
                this.seriesInfoPanel.hide();
                this.closeSeriesVideoSilent();
                this.currentSeriesId = null;
                this.currentEpisodeId = null;
            }
        } finally {
            this.skipUrlUpdate = false;
        }
    }

    /**
     * Navigate to a specific series by ID
     * @param {string} seriesId - The series ID
     */
    async navigateToSeries(seriesId) {
        logger.log('SeriesApp: Navigating to series', seriesId);
        this.currentSeriesId = seriesId;
        
        // Load and show series info
        await this.handleSeriesClick(seriesId, true);
    }

    /**
     * Navigate to a specific episode
     * @param {string} seriesId - The series ID
     * @param {string} episodeId - The episode ID
     */
    async navigateToEpisode(seriesId, episodeId) {
        logger.log('SeriesApp: Navigating to episode', seriesId, episodeId);
        
        // Make sure series info is loaded
        if (!this.seriesInfoPanel.currentSeriesInfo || 
            String(this.seriesInfoPanel.currentSeriesInfo.info?.id) !== String(seriesId)) {
            await this.navigateToSeries(seriesId);
            // Wait a bit for the panel to render
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Find the episode in the series info
        const seriesInfo = this.seriesInfoPanel.currentSeriesInfo;
        if (!seriesInfo || !seriesInfo.episodes) {
            logger.warn('Series info not loaded, cannot navigate to episode');
            return;
        }
        
        // Search through all seasons for this episode
        let episodeData = null;
        for (const seasonKey in seriesInfo.episodes) {
            const seasonEpisodes = seriesInfo.episodes[seasonKey] || [];
            const episode = seasonEpisodes.find(ep => 
                String(ep.id) === String(episodeId) || 
                String(ep.episode_id) === String(episodeId)
            );
            if (episode) {
                episodeData = episode;
                break;
            }
        }
        
        if (episodeData) {
            const episodeTitle = episodeData.title || `Episode ${episodeData.episode_num || episodeId}`;
            const extension = episodeData.container_extension || 'mkv';
            await this.handlePlayEpisode(episodeId, episodeTitle, extension, true);
        } else {
            logger.warn(`Episode ${episodeId} not found in series ${seriesId}`);
        }
    }

    /**
     * Close video without updating URL (for route restoration)
     */
    closeSeriesVideoSilent() {
        const videoPlayer = document.getElementById(this.seriesVideoElementIds.videoPlayer);
        
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.innerHTML = '';
            videoPlayer.load();
        }
        
        if (this.trackControls) {
            this.trackControls.hide();
        }
        
        this.currentEpisodeInfo = null;
        this.currentEpisodeId = null;
        this.hideSeriesVideoPanel();
    }
}
