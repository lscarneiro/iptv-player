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
        this.isMobile = window.innerWidth <= 768;
        
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
            this.setActiveView(this.views[currentIndex - 1]);
        }
    }

    navigateRight() {
        const currentIndex = this.views.indexOf(this.currentView);
        if (currentIndex < this.views.length - 1) {
            this.setActiveView(this.views[currentIndex + 1]);
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
        const currentIndex = this.views.indexOf(this.currentView);
        
        // Disable left button if on first view
        leftBtn.disabled = currentIndex === 0;
        
        // Disable right button if on last view or if streams/video not available
        const isLastView = currentIndex === this.views.length - 1;
        const isStreamView = this.currentView === 'streams';
        const isVideoView = this.currentView === 'video';
        
        // Check if streams are available
        const streamsAvailable = this.hasStreamsLoaded();
        const videoPlaying = this.hasVideoPlaying();
        
        if (this.currentView === 'categories') {
            rightBtn.disabled = !streamsAvailable;
        } else if (this.currentView === 'streams') {
            rightBtn.disabled = !videoPlaying;
        } else {
            rightBtn.disabled = true; // Video is the last view
        }
    }

    updateTitle() {
        const titleElement = document.getElementById('mobileNavTitle');
        let title = this.viewTitles[this.currentView];
        
        // Add context for streams and video
        if (this.currentView === 'streams') {
            const streamTitle = document.querySelector('.right-panel .panel-title');
            if (streamTitle && streamTitle.textContent !== 'Streams') {
                title = streamTitle.textContent;
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
                break;
            case 'video':
                videoPanel.classList.add('active');
                break;
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
        return videoPanel && videoPanel.style.display !== 'none';
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
            // Auto-navigate to video view
            setTimeout(() => {
                this.setActiveView('video');
            }, 300);
        }
    }

    // Called when video is closed
    onVideoClosed() {
        if (this.isMobile && this.currentView === 'video') {
            // Navigate back to streams
            this.setActiveView('streams');
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