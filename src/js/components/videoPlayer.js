// Video Player Component

import { escapeHtml } from '../utils/domHelpers.js';

export class VideoPlayer {
    constructor() {
        this.hlsPlayer = null;
        this.isWatching = false;
        
        // Setup fullscreen handlers only once
        if (!VideoPlayer.handlersInitialized) {
            VideoPlayer.handlersInitialized = true;
            // Setup fullscreen handlers after DOM is ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.initializeFullscreenHandlers();
                });
            } else {
                this.initializeFullscreenHandlers();
            }
        }
    }

    initializeFullscreenHandlers() {
        // Setup fullscreen handlers for both video players
        const videoRegular = document.getElementById('videoPlayer');
        const videoLarge = document.getElementById('videoPlayerLarge');
        
        if (videoRegular) {
            this.setupFullscreenHandler(videoRegular);
        } else {
            console.warn('videoRegular not found');
        }
        if (videoLarge) {
            this.setupFullscreenHandler(videoLarge);
        } else {
            console.warn('videoLarge not found');
        }
    }

    playStream(streamUrl, streamName) {
        const videoLarge = document.getElementById('videoPlayerLarge');
        const playerSection = document.getElementById('playerSection');
        const videoPanel = document.getElementById('videoPanel');
        const mainContainer = document.getElementById('mainContainer');
        const playerTitle = document.getElementById('playerTitle');
        const videoPanelTitle = document.getElementById('videoPanelTitle');
        const fallbackLink = document.getElementById('fallbackLink');
        const fallbackLinkLarge = document.getElementById('fallbackLinkLarge');
        const fallbackUrl = document.getElementById('fallbackUrl');
        const fallbackUrlLarge = document.getElementById('fallbackUrlLarge');
        const videoInfoTitle = document.getElementById('videoInfoTitle');
        const videoInfoDetails = document.getElementById('videoInfoDetails');
        
        // Update UI
        playerTitle.textContent = streamName;
        videoPanelTitle.textContent = streamName;
        videoInfoTitle.textContent = streamName;
        videoInfoDetails.textContent = `Stream URL: ${streamUrl}`;
        
        fallbackUrl.href = streamUrl;
        fallbackUrl.textContent = streamUrl;
        fallbackUrlLarge.href = streamUrl;
        fallbackUrlLarge.textContent = streamUrl;
        
        // Show 3-column layout
        mainContainer.classList.add('watching');
        videoPanel.style.display = 'flex';
        fallbackLink.style.display = 'block';
        fallbackLinkLarge.style.display = 'block';
        
        // Notify mobile navigation that video panel is ready
        if (window.app && window.app.mobileNav) {
            setTimeout(() => {
                window.app.mobileNav.onVideoReady();
            }, 100);
        }
        
        // Clear any previous errors
        this.hideError();
        
        // Destroy existing HLS instance
        if (this.hlsPlayer) {
            this.hlsPlayer.destroy();
            this.hlsPlayer = null;
        }
        
        // Check if HLS is supported
        if (window.Hls && Hls.isSupported()) {
            this.hlsPlayer = new Hls();
            this.hlsPlayer.loadSource(streamUrl);
            this.hlsPlayer.attachMedia(videoLarge);
            
            this.hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
                videoLarge.play().catch(e => {
                    console.error('Autoplay failed:', e);
                });
            });
            
            this.hlsPlayer.on(Hls.Events.ERROR, (event, data) => {
                console.error('HLS error:', data);
                if (data.fatal) {
                    this.showError('Stream playback failed. Try the direct link below.');
                }
            });
        } else if (videoLarge.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            videoLarge.src = streamUrl;
            videoLarge.play().catch(e => {
                console.error('Autoplay failed:', e);
            });
        } else {
            this.showError('HLS not supported. Use the direct link below.');
        }

        this.isWatching = true;
    }

    closePlayer() {
        const playerSection = document.getElementById('playerSection');
        const video = document.getElementById('videoPlayer');
        
        // Pause and stop the video
        if (video) {
            video.pause();
            video.currentTime = 0;
            video.removeAttribute('src');
            video.load();
        }
        
        // Destroy HLS player
        if (this.hlsPlayer) {
            this.hlsPlayer.stopLoad();
            this.hlsPlayer.detachMedia();
            this.hlsPlayer.destroy();
            this.hlsPlayer = null;
        }
        
        playerSection.classList.remove('open');
        this.isWatching = false;
    }

    closeVideoPanel() {
        const mainContainer = document.getElementById('mainContainer');
        const videoPanel = document.getElementById('videoPanel');
        const videoLarge = document.getElementById('videoPlayerLarge');
        
        // Pause and stop the video
        if (videoLarge) {
            videoLarge.pause();
            videoLarge.currentTime = 0;
            videoLarge.removeAttribute('src');
            videoLarge.load();
        }
        
        // Destroy HLS player
        if (this.hlsPlayer) {
            this.hlsPlayer.stopLoad();
            this.hlsPlayer.detachMedia();
            this.hlsPlayer.destroy();
            this.hlsPlayer = null;
        }
        
        // Hide 3-column layout
        mainContainer.classList.remove('watching');
        videoPanel.style.display = 'none';
        this.isWatching = false;
    }

    showError(message) {
        const errorDiv = document.getElementById('videoPanelError');
        const videoContainer = document.querySelector('.video-container-large');
        
        if (errorDiv) {
            errorDiv.innerHTML = `<div class="error">${message}</div>`;
            errorDiv.style.display = 'block';
            if (videoContainer) {
                videoContainer.style.display = 'none';
            }
        }
    }

    hideError() {
        const errorDiv = document.getElementById('videoPanelError');
        const videoContainer = document.querySelector('.video-container-large');
        
        if (errorDiv) {
            errorDiv.style.display = 'none';
            errorDiv.innerHTML = '';
        }
        if (videoContainer) {
            videoContainer.style.display = 'flex';
        }
    }

    showLoading(message) {
        const playerTitle = document.getElementById('playerTitle');
        if (playerTitle) {
            playerTitle.textContent = message;
        }
    }

    setupFullscreenHandler(videoElement) {
        if (!videoElement) return;

        const handleFullscreenChange = (e) => {
            const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
            
            if (isFullscreen && (document.fullscreenElement === videoElement || document.webkitFullscreenElement === videoElement || document.mozFullScreenElement === videoElement)) {
                // When THIS video is fullscreen, hide the app UI elements
                document.body.classList.add('video-fullscreen');
            } else {
                // When exiting fullscreen, restore UI
                document.body.classList.remove('video-fullscreen');
            }
        };

        // Listen for fullscreen changes on the document
        if (!VideoPlayer.fullscreenListenerAdded) {
            VideoPlayer.fullscreenListenerAdded = true;
            document.addEventListener('fullscreenchange', handleFullscreenChange);
            document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        }
    }

    // Public method to cleanup resources
    cleanup() {
        const videoLarge = document.getElementById('videoPlayerLarge');
        const video = document.getElementById('videoPlayer');
        
        // Stop all video elements
        [videoLarge, video].forEach(v => {
            if (v) {
                v.pause();
                v.currentTime = 0;
                v.removeAttribute('src');
                v.load();
            }
        });
        
        // Destroy HLS player
        if (this.hlsPlayer) {
            this.hlsPlayer.stopLoad();
            this.hlsPlayer.detachMedia();
            this.hlsPlayer.destroy();
            this.hlsPlayer = null;
        }
        
        this.isWatching = false;
    }
}

