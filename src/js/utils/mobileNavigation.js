// Mobile Navigation Manager

export class MobileNavigation {
    constructor() {
        this.currentView = 'categories'; // 'categories', 'streams', 'video'
        this.views = ['categories', 'streams', 'video'];
        this.viewTitles = {
            'categories': 'Categories',
            'streams': 'Streams',
            'video': 'Now Playing'
        };
        this.isMobile = false;
        this.pendingVideoView = false;
        
        this.init();
    }

    init() {
        this.checkMobile();
        this.setupEventListeners();
        
        // Listen for window resize
        window.addEventListener('resize', () => {
            this.checkMobile();
        });
    }

    checkMobile() {
        const wasMobile = this.isMobile;
        // Check if device is touch-enabled (pointer: coarse)
        const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
        // On touch devices, always use mobile layout regardless of screen size
        this.isMobile = isTouchDevice;
        
        if (this.isMobile !== wasMobile) {
            this.toggleMobileMode();
        }
    }

    toggleMobileMode() {
        const mobileNav = document.getElementById('mobileNav');
        const mainContainer = document.getElementById('mainContainer');
        
        if (this.isMobile) {
            // Show mobile navigation only if main container is visible
            if (mainContainer.style.display !== 'none') {
                mobileNav.style.display = 'block';
            }
            
            // Initialize mobile view
            this.setActiveView('categories');
        } else {
            // Hide mobile navigation
            mobileNav.style.display = 'none';
            
            // Reset to desktop layout
            this.resetDesktopLayout();
        }
    }

    resetDesktopLayout() {
        const leftPanel = document.getElementById('leftPanel');
        const rightPanel = document.getElementById('rightPanel');
        const videoPanel = document.getElementById('videoPanel');
        
        // Remove mobile classes
        leftPanel.classList.remove('active');
        rightPanel.classList.remove('active');
        videoPanel.classList.remove('active');
        
        // Reset transforms
        leftPanel.style.transform = '';
        rightPanel.style.transform = '';
        videoPanel.style.transform = '';
    }

    setupEventListeners() {
        const leftBtn = document.getElementById('mobileNavLeft');
        const rightBtn = document.getElementById('mobileNavRight');
        
        leftBtn.addEventListener('click', () => {
            this.navigateLeft();
        });
        
        rightBtn.addEventListener('click', () => {
            this.navigateRight();
        });
    }

    navigateLeft() {
        const currentIndex = this.views.indexOf(this.currentView);
        if (currentIndex > 0) {
            const targetView = this.views[currentIndex - 1];
            this.setActiveView(targetView);
        }
    }

    navigateRight() {
        const currentIndex = this.views.indexOf(this.currentView);
        if (currentIndex < this.views.length - 1) {
            const targetView = this.views[currentIndex + 1];
            this.setActiveView(targetView);
        }
    }

    setActiveView(view) {
        if (!this.isMobile) return;
        
        this.currentView = view;
        
        // Update navigation buttons
        this.updateNavigationButtons();
        
        // Update title
        this.updateTitle();
        
        // Show/hide panels
        this.updatePanelVisibility();
    }

    updateNavigationButtons() {
        const leftBtn = document.getElementById('mobileNavLeft');
        const rightBtn = document.getElementById('mobileNavRight');
        const mobileNav = document.getElementById('mobileNav');
        
        // Check if streams are available
        const streamsAvailable = this.hasStreamsLoaded();
        
        // Update button visibility and state based on current view
        switch (this.currentView) {
            case 'categories':
                mobileNav.style.display = 'block'; // Show navigation bar
                leftBtn.style.visibility = 'hidden'; // Hide left arrow on first view
                rightBtn.style.visibility = streamsAvailable ? 'visible' : 'hidden';
                rightBtn.disabled = !streamsAvailable;
                // Reset main container
                const mainContainer1 = document.getElementById('mainContainer');
                if (mainContainer1) {
                    mainContainer1.classList.remove('nav-hidden');
                }
                break;
                
            case 'streams':
                mobileNav.style.display = 'block'; // Show navigation bar
                leftBtn.style.visibility = 'visible';
                leftBtn.disabled = false;
                rightBtn.style.visibility = 'hidden'; // No right arrow for streams
                rightBtn.disabled = true;
                // Reset main container
                const mainContainer2 = document.getElementById('mainContainer');
                if (mainContainer2) {
                    mainContainer2.classList.remove('nav-hidden');
                }
                break;
                
            case 'video':
                mobileNav.style.display = 'none'; // Hide entire navigation bar for video
                // Adjust main container when nav is hidden
                const mainContainer = document.getElementById('mainContainer');
                if (mainContainer) {
                    mainContainer.classList.add('nav-hidden');
                }
                break;
        }
    }

    updateTitle() {
        const titleElement = document.getElementById('mobileNavTitle');
        let title = this.viewTitles[this.currentView];
        
        // Add context for streams and video
        if (this.currentView === 'streams') {
            const streamTitle = document.querySelector('.right-panel .panel-title');
            if (streamTitle && streamTitle.textContent !== 'Streams' && !streamTitle.textContent.startsWith('Streams -')) {
                title = streamTitle.textContent;
            } else if (streamTitle && streamTitle.textContent.startsWith('Streams -')) {
                // Extract just the category name from "Streams - CategoryName (count)"
                const match = streamTitle.textContent.match(/Streams - (.+?) \(/);
                title = match ? match[1] : 'Streams';
            }
        } else if (this.currentView === 'video') {
            const videoTitle = document.getElementById('videoPanelTitle');
            if (videoTitle && videoTitle.textContent !== 'Now Playing') {
                title = videoTitle.textContent;
            }
        }
        
        titleElement.textContent = title;
    }

    updatePanelVisibility() {
        if (!this.isMobile) return;
        
        const leftPanel = document.getElementById('leftPanel');
        const rightPanel = document.getElementById('rightPanel');
        const videoPanel = document.getElementById('videoPanel');
        
        // Remove active class from all panels
        leftPanel.classList.remove('active');
        rightPanel.classList.remove('active');
        videoPanel.classList.remove('active');
        
        // Add active class to current panel
        switch (this.currentView) {
            case 'categories':
                leftPanel.classList.add('active');
                break;
            case 'streams':
                rightPanel.classList.add('active');
                // Reinitialize infinite scroll when switching to streams view
                this.reinitializeStreamListScroll();
                break;
            case 'video':
                // Always show video panel when view is set to video
                videoPanel.classList.add('active');
                break;
        }
    }

    reinitializeStreamListScroll() {
        // Find the stream list component and reinitialize its infinite scroll
        if (window.app && window.app.streamList) {
            window.app.streamList.reinitializeInfiniteScroll();
        }
    }

    hasStreamsLoaded() {
        const streamsContainer = document.getElementById('streamsContainer');
        return streamsContainer && 
               !streamsContainer.querySelector('.loading') && 
               !streamsContainer.innerHTML.includes('Select a category');
    }

    hasVideoPlaying() {
        const videoPanel = document.getElementById('videoPanel');
        return videoPanel && videoPanel.style.display !== 'none' && videoPanel.style.display !== '';
    }

    // Called when category is selected
    onCategorySelected() {
        if (this.isMobile && this.currentView === 'categories') {
            // Auto-navigate to streams view
            setTimeout(() => {
                this.setActiveView('streams');
            }, 300); // Small delay for better UX
        }
    }

    // Called when stream starts playing
    onStreamStarted() {
        if (this.isMobile) {
            // Just set a flag that we want to show video, actual navigation happens in onVideoReady
            this.pendingVideoView = true;
        }
    }

    // Called when video panel is actually ready
    onVideoReady() {
        if (this.isMobile && this.pendingVideoView) {
            this.setActiveView('video');
            this.pendingVideoView = false;
        }
    }

    // Called when video is closed
    onVideoClosed() {
        if (this.isMobile) {
            // Reset pending video view flag
            this.pendingVideoView = false;
            
            // Remove active class from video panel
            const videoPanel = document.getElementById('videoPanel');
            if (videoPanel) {
                videoPanel.classList.remove('active');
            }
            
            // Navigate back to streams if currently on video
            if (this.currentView === 'video') {
                this.setActiveView('streams');
            }
        }
    }

    // Update navigation when content changes
    refresh() {
        if (this.isMobile) {
            this.updateNavigationButtons();
            this.updateTitle();
        }
    }
}