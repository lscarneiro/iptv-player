// VOD App Controller

import { VodCategoryList } from './components/vodCategoryList.js';
import { VodList } from './components/vodList.js';
import { VodInfoPanel } from './components/vodInfoPanel.js';
import { VideoPlayer } from './components/videoPlayer.js';
import { debounce } from './utils/debounce.js';
import { toggleClearButton } from './utils/domHelpers.js';
import { logger } from './utils/logger.js';

export class VodApp {
    constructor(apiService, storageService, favoritesService) {
        this.apiService = apiService;
        this.storageService = storageService;
        this.favoritesService = favoritesService;
        
        // Create separate VideoPlayer instance for VOD
        this.vodVideoPlayer = new VideoPlayer();
        this.vodVideoPlayer.setApiService(apiService);
        
        // Override video player IDs to use VOD-specific elements
        this.initializeVodVideoPlayer();
        
        this.categories = [];
        this.currentCategory = null;
        this.currentCategoryName = 'All Movies';
        this.allMovies = [];
        
        // Request tracking for preventing race conditions
        this.currentCategoryLoadId = 0;
        this.currentMoviesLoadId = 0;
        
        this.initialized = false;
    }

    initializeVodVideoPlayer() {
        // Configure the VOD video player to use VOD-specific DOM elements
        this.vodVideoElementIds = {
            videoPanel: 'vodVideoPanel',
            videoPlayer: 'vodVideoPlayerLarge',
            videoPanelTitle: 'vodVideoPanelTitle',
            videoInfoDetails: 'vodVideoInfoDetails',
            fallbackLinkLarge: 'vodFallbackLinkLarge',
            fallbackUrlLarge: 'vodFallbackUrlLarge',
            videoPanelError: 'vodVideoPanelError',
            videoFavoriteStar: 'vodVideoFavoriteStar'
        };
    }

    async init() {
        if (this.initialized) {
            logger.log('VodApp already initialized');
            return;
        }

        this.setupComponents();
        this.setupEventListeners();
        
        // Load categories
        await this.loadCategories();
        
        this.initialized = true;
        logger.log('VodApp initialized');
    }

    setupComponents() {
        // Initialize components
        this.categoryList = new VodCategoryList('vodCategoriesContainer');
        this.vodList = new VodList('vodListContainer');
        this.vodInfoPanel = new VodInfoPanel('vodDetailPanel');
        
        // Setup component callbacks
        this.categoryList.setOnCategorySelect((categoryId) => {
            this.handleCategorySelect(categoryId);
        });
        
        this.vodList.setOnMovieClick((movieId) => {
            this.handleMovieClick(movieId);
        });

        // Set up favorites service connections
        this.vodList.setFavoritesService(this.favoritesService);
        this.vodList.setOnFavoriteToggle((movieId, isFavorite) => {
            this.handleMovieFavoriteToggle(movieId, isFavorite);
        });

        this.vodInfoPanel.setFavoritesService(this.favoritesService);
        this.vodInfoPanel.setOnFavoriteToggle((movieId, isFavorite) => {
            this.handleMovieFavoriteToggle(movieId, isFavorite);
        });

        this.vodInfoPanel.setOnPlayMovie((streamId, extension) => {
            this.handlePlayMovie(streamId, extension);
        });

        this.vodInfoPanel.setOnClose(() => {
            this.vodInfoPanel.hide();
        });

        // Set up favorites change listener
        this.favoritesService.setOnVodFavoriteChange((movieId, isFavorite) => {
            this.handleMovieFavoriteChange(movieId, isFavorite);
        });

        // Set up VOD video panel close button
        const closeVodVideoBtn = document.getElementById('closeVodVideoPanel');
        if (closeVodVideoBtn) {
            closeVodVideoBtn.addEventListener('click', () => {
                this.closeVodVideo();
            });
        }
    }

    setupEventListeners() {
        // Refresh buttons
        const refreshCategoriesBtn = document.getElementById('refreshVodCategories');
        if (refreshCategoriesBtn) {
            refreshCategoriesBtn.addEventListener('click', () => {
                this.loadCategories(true);
            });
        }

        const refreshVodBtn = document.getElementById('refreshVodList');
        if (refreshVodBtn) {
            refreshVodBtn.addEventListener('click', () => {
                this.loadMovies(true);
            });
        }

        // Search boxes with debounce
        const debouncedVodSearch = debounce((term) => {
            this.filterMovies(term);
        }, 300);

        const vodSearchBox = document.getElementById('vodSearch');
        if (vodSearchBox) {
            vodSearchBox.addEventListener('input', (e) => {
                const term = e.target.value;
                toggleClearButton('clearVodSearch', term);
                debouncedVodSearch(term);
            });
        }

        const clearVodSearchBtn = document.getElementById('clearVodSearch');
        if (clearVodSearchBtn) {
            clearVodSearchBtn.addEventListener('click', () => {
                if (vodSearchBox) {
                    vodSearchBox.value = '';
                    toggleClearButton(vodSearchBox, 'clearVodSearch');
                    this.filterMovies('');
                }
            });
        }

        const debouncedCategorySearch = debounce((term) => {
            this.filterCategories(term);
        }, 300);

        const categorySearchBox = document.getElementById('vodCategorySearch');
        if (categorySearchBox) {
            categorySearchBox.addEventListener('input', (e) => {
                const term = e.target.value;
                toggleClearButton('clearVodCategorySearch', term);
                debouncedCategorySearch(term);
            });
        }

        const clearCategorySearchBtn = document.getElementById('clearVodCategorySearch');
        if (clearCategorySearchBtn) {
            clearCategorySearchBtn.addEventListener('click', () => {
                if (categorySearchBox) {
                    categorySearchBox.value = '';
                    toggleClearButton(categorySearchBox, 'clearVodCategorySearch');
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
                categories = await this.storageService.getVodCategories();
                if (categories) {
                    logger.log('Loaded VOD categories from cache');
                }
            }
            
            // Fetch from API if no cache or forcing refresh
            if (!categories) {
                logger.log('Fetching VOD categories from API...');
                categories = await this.apiService.getVodCategories();
                
                // Save to cache
                await this.storageService.saveVodCategories(categories);
            }
            
            // Check if this request is still valid
            if (loadId !== this.currentCategoryLoadId) {
                logger.log('Category load outdated, skipping');
                return;
            }
            
            this.categories = categories || [];
            
            // Load all movies to get count
            await this.loadAllMovies(forceRefresh);
            
            const favoritesCount = this.favoritesService.getVodFavoriteCount();
            
            this.categoryList.render(this.categories, this.allMovies.length, favoritesCount);
            
            // Auto-select "All Movies" on first load
            if (this.currentCategory === null) {
                this.categoryList.selectCategory('all');
                await this.loadMovies(forceRefresh);
            }
            
        } catch (error) {
            logger.error('Failed to load VOD categories:', error);
            this.categoryList.showError('Failed to load categories. Please check your connection.');
        }
    }

    async loadAllMovies(forceRefresh = false) {
        try {
            let movies = null;
            
            // Try cache first if not forcing refresh
            if (!forceRefresh) {
                movies = await this.storageService.getVod(null);
                if (movies) {
                    logger.log('Loaded all movies from cache');
                }
            }
            
            // Fetch from API if no cache or forcing refresh
            if (!movies) {
                logger.log('Fetching all movies from API...');
                movies = await this.apiService.getVodStreams(null);
                
                // Save to cache
                await this.storageService.saveVod(null, movies);
            }
            
            this.allMovies = movies || [];
            
        } catch (error) {
            logger.error('Failed to load all movies:', error);
            this.allMovies = [];
        }
    }

    async handleCategorySelect(categoryId) {
        this.currentCategory = categoryId;
        
        // Update category name
        if (categoryId === 'all') {
            this.currentCategoryName = 'All Movies';
        } else if (categoryId === 'favorites') {
            this.currentCategoryName = 'Favorites';
        } else {
            const category = this.categories.find(c => c.category_id === categoryId);
            this.currentCategoryName = category ? category.category_name : 'Unknown Category';
        }
        
        // Clear search
        const searchBox = document.getElementById('vodSearch');
        if (searchBox) {
            searchBox.value = '';
            toggleClearButton('clearVodSearch', '');
        }
        
        // Reset movie list search state
        this.vodList.resetSearch();
        
        // Load movies for this category
        await this.loadMovies();
        
        // Show right panel header
        const rightPanelHeader = document.querySelector('.vod-right-panel .panel-header');
        if (rightPanelHeader) {
            rightPanelHeader.classList.remove('hidden');
        }
    }

    async loadMovies(forceRefresh = false) {
        const loadId = ++this.currentMoviesLoadId;
        
        try {
            this.vodList.showLoading('Loading movies...');
            
            let movies = [];
            
            if (this.currentCategory === 'favorites') {
                // Show favorites
                movies = this.favoritesService.filterFavoriteVod(this.allMovies);
            } else if (this.currentCategory === 'all') {
                // Show all movies
                movies = this.allMovies;
            } else {
                // Load movies for specific category
                let categoryMovies = null;
                
                // Try cache first if not forcing refresh
                if (!forceRefresh) {
                    categoryMovies = await this.storageService.getVod(this.currentCategory);
                    if (categoryMovies) {
                        logger.log(`Loaded movies for category ${this.currentCategory} from cache`);
                    }
                }
                
                // Fetch from API if no cache or forcing refresh
                if (!categoryMovies) {
                    logger.log(`Fetching movies for category ${this.currentCategory} from API...`);
                    categoryMovies = await this.apiService.getVodStreams(this.currentCategory);
                    
                    // Save to cache
                    await this.storageService.saveVod(this.currentCategory, categoryMovies);
                }
                
                movies = categoryMovies || [];
            }
            
            // Check if this request is still valid
            if (loadId !== this.currentMoviesLoadId) {
                logger.log('Movies load outdated, skipping');
                return;
            }
            
            this.vodList.render(movies, this.currentCategoryName);
            
        } catch (error) {
            logger.error('Failed to load movies:', error);
            this.vodList.showError('Failed to load movies. Please try again.');
        }
    }

    async handleMovieClick(movieId) {
        try {
            this.vodInfoPanel.showLoading();
            
            let movieInfo = null;
            
            // Try cache first
            movieInfo = await this.storageService.getVodInfo(movieId);
            if (movieInfo) {
                logger.log(`Loaded movie info for ${movieId} from cache`);
            } else {
                // Fetch from API
                logger.log(`Fetching movie info for ${movieId} from API...`);
                movieInfo = await this.apiService.getVodInfo(movieId);
                
                // Save to cache
                await this.storageService.saveVodInfo(movieId, movieInfo);
            }
            
            this.vodInfoPanel.render(movieInfo);
            
        } catch (error) {
            logger.error('Failed to load movie info:', error);
            this.vodInfoPanel.showError('Failed to load movie information. Please try again.');
        }
    }

    async handlePlayMovie(streamId, extension) {
        try {
            logger.log(`Playing movie ${streamId} (${extension})`);
            
            // Get movie stream URL
            const streamUrl = this.apiService.getVodStreamUrl(streamId, extension);
            logger.log('Movie stream URL:', streamUrl);
            
            if (!streamUrl || typeof streamUrl !== 'string') {
                logger.error('Invalid movie URL:', streamUrl);
                throw new Error('No valid movie URL found');
            }
            
            // Show VOD video panel and hide detail panel
            this.showVodVideoPanel();
            this.vodInfoPanel.hide();
            
            // Play movie directly
            this.playMovieDirectly(streamUrl, streamId, extension);
            
        } catch (error) {
            logger.error('Failed to play movie:', error);
            this.showVodVideoError(`Error: ${error.message}`);
        }
    }

    showVodVideoPanel() {
        const videoPanel = document.getElementById(this.vodVideoElementIds.videoPanel);
        const vodContainer = document.getElementById('vodContainer');
        
        // Ensure VOD container is in video mode
        if (vodContainer) {
            vodContainer.classList.add('watching-video');
        }
        
        if (videoPanel) {
            videoPanel.style.display = 'flex';
        }
    }

    hideVodVideoPanel() {
        const videoPanel = document.getElementById(this.vodVideoElementIds.videoPanel);
        const vodContainer = document.getElementById('vodContainer');
        
        if (vodContainer) {
            vodContainer.classList.remove('watching-video');
        }
        
        if (videoPanel) {
            videoPanel.style.display = 'none';
        }
    }

    playMovieDirectly(videoUrl, movieId, extension) {
        // Use native HTML5 video player for movies
        const videoPlayer = document.getElementById(this.vodVideoElementIds.videoPlayer);
        const videoPanelTitle = document.getElementById(this.vodVideoElementIds.videoPanelTitle);
        const fallbackLinkLarge = document.getElementById(this.vodVideoElementIds.fallbackLinkLarge);
        const fallbackUrlLarge = document.getElementById(this.vodVideoElementIds.fallbackUrlLarge);
        const videoInfoDetails = document.getElementById(this.vodVideoElementIds.videoInfoDetails);
        
        if (!videoPlayer) {
            logger.error('VOD video player element not found');
            return;
        }
        
        // Update UI
        if (videoPanelTitle) {
            videoPanelTitle.textContent = 'Now Playing';
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
        const videoPanelError = document.getElementById(this.vodVideoElementIds.videoPanelError);
        if (videoPanelError) {
            videoPanelError.style.display = 'none';
        }
        
        // Clear existing sources
        videoPlayer.pause();
        videoPlayer.innerHTML = '';
        
        // Set type="video/mp4" to trick Chrome into playing MKV files
        const source = document.createElement('source');
        source.src = videoUrl;
        source.type = 'video/mp4';
        videoPlayer.appendChild(source);
        
        videoPlayer.load();
        
        // Try to play
        const playPromise = videoPlayer.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                logger.log('Movie playback started successfully:', videoUrl);
            }).catch(error => {
                logger.error('Movie play error:', error);
                if (error.name === 'NotSupportedError') {
                    this.showVodVideoError('This video format may not be fully supported by your browser. Try using the direct link with VLC or another media player.');
                } else if (error.name === 'NotAllowedError') {
                    logger.log('Autoplay blocked - user interaction required');
                    this.showVodVideoError('Click the play button to start playback.');
                } else {
                    this.showVodVideoError(`Playback error: ${error.message}. Try using the direct link.`);
                }
            });
        }
        
        logger.log('Direct video playback initiated for:', videoUrl);
    }

    showVodVideoError(message) {
        const videoPanelError = document.getElementById(this.vodVideoElementIds.videoPanelError);
        const videoContainer = document.querySelector('#' + this.vodVideoElementIds.videoPanel + ' .video-container-large');
        
        if (videoPanelError) {
            videoPanelError.innerHTML = `
                <div class="error-container">
                    <div class="error-icon">⚠</div>
                    <div class="error-content">
                        <h3 class="error-title">Playback Error</h3>
                        <p class="error-message">${message}</p>
                        <div class="error-actions">
                            <button class="error-btn fallback-btn" onclick="document.getElementById('${this.vodVideoElementIds.fallbackLinkLarge}').scrollIntoView()">
                                🔗 Direct Link
                            </button>
                            <button class="error-btn close-btn" onclick="document.getElementById('closeVodVideoPanel').click()">
                                ✕ Close
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

    closeVodVideo() {
        const videoPlayer = document.getElementById(this.vodVideoElementIds.videoPlayer);
        
        // Stop video playback
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.innerHTML = '';
            videoPlayer.load();
        }
        
        // Hide video panel
        this.hideVodVideoPanel();
        
        // Show the movie detail panel again
        if (this.vodInfoPanel && this.vodInfoPanel.currentMovieInfo) {
            this.vodInfoPanel.show();
        }
        
        logger.log('VOD video closed - returned to movie detail');
    }

    handleMovieFavoriteToggle(movieId, isFavorite) {
        logger.log(`Movie favorite toggled: ${movieId} = ${isFavorite}`);
        
        // Update category list counts
        const favoritesCount = this.favoritesService.getVodFavoriteCount();
        const allMoviesCount = this.allMovies.length;
        this.categoryList.render(this.categories, allMoviesCount, favoritesCount);
        
        // Re-select current category to update UI
        this.categoryList.selectCategory(this.currentCategory);
        
        // If viewing favorites, refresh the list
        if (this.currentCategory === 'favorites') {
            this.loadMovies();
        }
    }

    handleMovieFavoriteChange(movieId, isFavorite) {
        logger.log(`Movie favorite changed: ${movieId} = ${isFavorite}`);
        
        // Update movie list favorite status
        if (movieId) {
            this.vodList.updateMovieFavoriteStatus(movieId, isFavorite);
        }
        
        // Update category counts
        const favoritesCount = this.favoritesService.getVodFavoriteCount();
        const allMoviesCount = this.allMovies.length;
        this.categoryList.render(this.categories, allMoviesCount, favoritesCount);
        
        // Re-select current category to maintain selection
        this.categoryList.selectCategory(this.currentCategory);
    }

    filterMovies(searchTerm) {
        this.vodList.filter(searchTerm);
    }

    filterCategories(searchTerm) {
        this.categoryList.filter(searchTerm);
    }

    // Show the VOD view
    async show() {
        const vodContainer = document.getElementById('vodContainer');
        if (vodContainer) {
            vodContainer.style.display = 'flex';
        }
        
        // Initialize if not already done
        if (!this.initialized) {
            await this.init();
        } else {
            // If already initialized, ensure "All Movies" is selected
            this.categoryList.selectCategory('all');
            this.currentCategory = 'all';
            this.currentCategoryName = 'All Movies';
            await this.loadMovies(false);
            
            // Show right panel header
            const rightPanelHeader = document.querySelector('.vod-right-panel .panel-header');
            if (rightPanelHeader) {
                rightPanelHeader.classList.remove('hidden');
            }
        }
    }

    // Hide the VOD view
    hide() {
        const vodContainer = document.getElementById('vodContainer');
        if (vodContainer) {
            vodContainer.style.display = 'none';
        }
        
        // Hide movie detail panel
        this.vodInfoPanel.hide();
    }
}
