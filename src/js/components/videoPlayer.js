// Video Player Component

import { escapeHtml } from '../utils/domHelpers.js';

export class VideoPlayer {
    constructor() {
        this.hlsPlayer = null;
        this.isWatching = false;
        this.currentStreamUrl = null;
        this.currentStreamName = null;
        this.playbackStarted = false;
        this.errorRetryCount = 0;
        this.maxRetries = 3;
        this.bufferingCheckInterval = null;
        this.lastBufferTime = 0;
        this.bufferingEvents = [];
        this.streamEndDetected = false;
        
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
        
        // Reset state for new stream
        this.currentStreamUrl = streamUrl;
        this.currentStreamName = streamName;
        this.playbackStarted = false;
        this.errorRetryCount = 0;
        this.streamEndDetected = false;
        this.clearBufferingMonitor();
        
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
        
        this.initializePlayer(streamUrl, videoLarge);
        this.isWatching = true;
    }

    initializePlayer(streamUrl, videoElement) {
        // Destroy existing HLS instance
        if (this.hlsPlayer) {
            this.hlsPlayer.destroy();
            this.hlsPlayer = null;
        }
        
        // Check for black.ts stream ending indicator
        if (streamUrl.includes('black.ts')) {
            this.handleStreamEnded();
            return;
        }
        
        // Check if HLS is supported
        if (window.Hls && Hls.isSupported()) {
            this.setupHlsPlayer(streamUrl, videoElement);
        } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            this.setupNativePlayer(streamUrl, videoElement);
        } else {
            this.handleError('UNSUPPORTED', 'HLS not supported on this device. Try the direct link below.');
        }
    }

    setupHlsPlayer(streamUrl, videoElement) {
        this.hlsPlayer = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90
        });
        
        this.hlsPlayer.loadSource(streamUrl);
        this.hlsPlayer.attachMedia(videoElement);
        
        // Set up event listeners
        this.setupHlsEventListeners(videoElement);
        this.setupVideoEventListeners(videoElement);
    }

    setupNativePlayer(streamUrl, videoElement) {
        videoElement.src = streamUrl;
        this.setupVideoEventListeners(videoElement);
        
        videoElement.play().catch(e => {
            console.error('Native player autoplay failed:', e);
            this.handleError('AUTOPLAY_FAILED', 'Click the play button to start the stream.');
        });
    }

    setupHlsEventListeners(videoElement) {
        this.hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('HLS manifest parsed successfully');
            videoElement.play().catch(e => {
                console.error('Autoplay failed:', e);
                this.handleError('AUTOPLAY_FAILED', 'Click the play button to start the stream.');
            });
        });
        
        this.hlsPlayer.on(Hls.Events.FRAG_LOADED, () => {
            if (!this.playbackStarted) {
                this.playbackStarted = true;
                this.errorRetryCount = 0; // Reset retry count on successful start
                this.startBufferingMonitor(videoElement);
            }
        });
        
        this.hlsPlayer.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS error:', data);
            this.handleHlsError(data, videoElement);
        });
    }

    setupVideoEventListeners(videoElement) {
        videoElement.addEventListener('loadstart', () => {
            console.log('Video load started');
        });
        
        videoElement.addEventListener('canplay', () => {
            if (!this.playbackStarted) {
                this.playbackStarted = true;
                this.errorRetryCount = 0;
                this.startBufferingMonitor(videoElement);
            }
        });
        
        videoElement.addEventListener('error', (e) => {
            console.error('Video element error:', e);
            this.handleVideoError(e);
        });
        
        videoElement.addEventListener('stalled', () => {
            console.warn('Video playback stalled');
            this.recordBufferingEvent('stalled');
        });
        
        videoElement.addEventListener('waiting', () => {
            console.warn('Video waiting for data');
            this.recordBufferingEvent('waiting');
        });
    }

    handleHlsError(data, videoElement) {
        const { type, details, fatal } = data;
        
        if (fatal) {
            switch (type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                    this.handleNetworkError(details, data);
                    break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                    this.handleMediaError(details, data, videoElement);
                    break;
                default:
                    this.handleError('HLS_FATAL', `Fatal HLS error: ${details}`);
                    break;
            }
        } else {
            // Non-fatal errors - log but continue
            console.warn('Non-fatal HLS error:', data);
        }
    }

    handleNetworkError(details, data) {
        if (!this.playbackStarted) {
            // Stream failed to start
            if (this.errorRetryCount < this.maxRetries) {
                this.errorRetryCount++;
                console.log(`Retrying stream load (attempt ${this.errorRetryCount}/${this.maxRetries})`);
                setTimeout(() => {
                    this.retryStream();
                }, 2000 * this.errorRetryCount); // Exponential backoff
            } else {
                this.handleError('STREAM_FAILED_TO_START', 
                    'Unable to start the stream. The stream may be offline or the URL is incorrect. Try the direct link below.');
            }
        } else {
            // Stream was playing but encountered network error
            this.handleError('STREAM_INTERRUPTED', 
                'Stream connection lost. The stream may have ended or there\'s a network issue.',
                true); // Show retry option
        }
    }

    handleMediaError(details, data, videoElement) {
        if (details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
            this.recordBufferingEvent('buffer_stalled');
            return;
        }
        
        if (!this.playbackStarted) {
            this.handleError('MEDIA_ERROR', 
                'Media format error. This stream format may not be supported by your browser.');
        } else {
            // Try to recover from media error
            try {
                this.hlsPlayer.recoverMediaError();
                console.log('Attempting to recover from media error');
            } catch (e) {
                this.handleError('MEDIA_RECOVERY_FAILED', 
                    'Playback error occurred and recovery failed.',
                    true);
            }
        }
    }

    handleVideoError(error) {
        const videoElement = error.target;
        const errorCode = videoElement.error ? videoElement.error.code : 'unknown';
        
        if (!this.playbackStarted) {
            this.handleError('VIDEO_LOAD_ERROR', 
                `Failed to load video (Error code: ${errorCode}). The stream may be incompatible with your browser.`);
        } else {
            this.handleError('VIDEO_PLAYBACK_ERROR', 
                `Video playback error (Error code: ${errorCode}).`,
                true);
        }
    }

    handleStreamEnded() {
        this.streamEndDetected = true;
        this.showStreamEndedDialog();
    }

    retryStream() {
        if (this.currentStreamUrl && this.isWatching) {
            console.log('Retrying stream:', this.currentStreamUrl);
            const videoElement = document.getElementById('videoPlayerLarge');
            this.initializePlayer(this.currentStreamUrl, videoElement);
        }
    }

    startBufferingMonitor(videoElement) {
        this.clearBufferingMonitor();
        
        this.bufferingCheckInterval = setInterval(() => {
            if (!videoElement.paused && !videoElement.ended) {
                const currentTime = videoElement.currentTime;
                
                if (currentTime === this.lastBufferTime) {
                    this.recordBufferingEvent('no_progress');
                } else {
                    this.lastBufferTime = currentTime;
                }
                
                // Check if we have too many buffering events
                this.checkBufferingHealth();
            }
        }, 5000); // Check every 5 seconds
    }

    clearBufferingMonitor() {
        if (this.bufferingCheckInterval) {
            clearInterval(this.bufferingCheckInterval);
            this.bufferingCheckInterval = null;
        }
        this.bufferingEvents = [];
        this.lastBufferTime = 0;
    }

    recordBufferingEvent(type) {
        const now = Date.now();
        this.bufferingEvents.push({ type, timestamp: now });
        
        // Keep only events from last 2 minutes
        this.bufferingEvents = this.bufferingEvents.filter(
            event => now - event.timestamp < 120000
        );
    }

    checkBufferingHealth() {
        const recentEvents = this.bufferingEvents.filter(
            event => Date.now() - event.timestamp < 60000 // Last minute
        );
        
        if (recentEvents.length >= 5) {
            console.warn('Frequent buffering detected, suggesting stream reload');
            this.showBufferingIssueDialog();
        }
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
        
        // Clear monitoring
        this.clearBufferingMonitor();
        
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
        
        // Reset state
        this.currentStreamUrl = null;
        this.currentStreamName = null;
        this.playbackStarted = false;
        this.errorRetryCount = 0;
        this.streamEndDetected = false;
        
        // Hide error and 3-column layout
        this.hideError();
        mainContainer.classList.remove('watching');
        videoPanel.style.display = 'none';
        this.isWatching = false;
    }

    handleError(errorType, message, showRetry = false) {
        console.error(`Video Player Error [${errorType}]:`, message);
        
        // Stop any ongoing monitoring
        this.clearBufferingMonitor();
        
        // Show appropriate error UI
        this.showError(message, errorType, showRetry);
    }

    showError(message, errorType = 'GENERIC', showRetry = false) {
        const errorDiv = document.getElementById('videoPanelError');
        const videoContainer = document.querySelector('.video-container-large');
        
        if (errorDiv) {
            let errorHtml = `
                <div class="error-container">
                    <div class="error-icon">⚠️</div>
                    <div class="error-content">
                        <h3 class="error-title">${this.getErrorTitle(errorType)}</h3>
                        <p class="error-message">${message}</p>
                        <div class="error-actions">
                            ${showRetry ? `
                                <button class="error-btn retry-btn" onclick="window.app.videoPlayer.retryStream()">
                                    🔄 Try Again
                                </button>
                            ` : ''}
                            <button class="error-btn fallback-btn" onclick="document.getElementById('fallbackLinkLarge').scrollIntoView()">
                                🔗 Direct Link
                            </button>
                            <button class="error-btn close-btn" onclick="window.app.videoPlayer.closeVideoPanel()">
                                ❌ Close Player
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            errorDiv.innerHTML = errorHtml;
            errorDiv.style.display = 'block';
            if (videoContainer) {
                videoContainer.style.display = 'none';
            }
        }
    }

    getErrorTitle(errorType) {
        switch (errorType) {
            case 'STREAM_FAILED_TO_START':
                return 'Stream Failed to Start';
            case 'STREAM_INTERRUPTED':
                return 'Stream Connection Lost';
            case 'STREAM_ENDED':
                return 'Stream Has Ended';
            case 'MEDIA_ERROR':
                return 'Media Format Error';
            case 'AUTOPLAY_FAILED':
                return 'Autoplay Blocked';
            case 'UNSUPPORTED':
                return 'Unsupported Format';
            case 'BUFFERING_ISSUES':
                return 'Frequent Buffering Detected';
            default:
                return 'Playback Error';
        }
    }

    showStreamEndedDialog() {
        const errorDiv = document.getElementById('videoPanelError');
        const videoContainer = document.querySelector('.video-container-large');
        
        if (errorDiv) {
            const dialogHtml = `
                <div class="error-container stream-ended">
                    <div class="error-icon">📺</div>
                    <div class="error-content">
                        <h3 class="error-title">Stream Has Ended</h3>
                        <p class="error-message">
                            This stream appears to have ended or is temporarily unavailable. 
                            Would you like to try reloading it?
                        </p>
                        <div class="error-actions">
                            <button class="error-btn retry-btn" onclick="window.app.videoPlayer.reloadStream()">
                                🔄 Reload Stream
                            </button>
                            <button class="error-btn fallback-btn" onclick="document.getElementById('fallbackLinkLarge').scrollIntoView()">
                                🔗 Direct Link
                            </button>
                            <button class="error-btn close-btn" onclick="window.app.videoPlayer.closeVideoPanel()">
                                ❌ Close Player
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            errorDiv.innerHTML = dialogHtml;
            errorDiv.style.display = 'block';
            if (videoContainer) {
                videoContainer.style.display = 'none';
            }
        }
    }

    showBufferingIssueDialog() {
        // Only show if not already showing an error
        const errorDiv = document.getElementById('videoPanelError');
        if (errorDiv && errorDiv.style.display === 'none') {
            const dialogHtml = `
                <div class="error-container buffering-issues">
                    <div class="error-icon">⏳</div>
                    <div class="error-content">
                        <h3 class="error-title">Frequent Buffering Detected</h3>
                        <p class="error-message">
                            The stream is experiencing frequent buffering. This might be due to network issues 
                            or server problems. Would you like to reload the stream?
                        </p>
                        <div class="error-actions">
                            <button class="error-btn retry-btn" onclick="window.app.videoPlayer.reloadStream(); window.app.videoPlayer.hideError();">
                                🔄 Reload Stream
                            </button>
                            <button class="error-btn continue-btn" onclick="window.app.videoPlayer.hideError()">
                                ▶️ Continue Watching
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            // Show as overlay, not replacing video
            const overlay = document.createElement('div');
            overlay.className = 'buffering-overlay';
            overlay.innerHTML = dialogHtml;
            overlay.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            `;
            
            const videoContainer = document.querySelector('.video-container-large');
            if (videoContainer) {
                videoContainer.style.position = 'relative';
                videoContainer.appendChild(overlay);
                
                // Auto-hide after 10 seconds if user doesn't interact
                setTimeout(() => {
                    if (overlay.parentNode) {
                        overlay.remove();
                    }
                }, 10000);
            }
        }
    }

    reloadStream() {
        if (this.currentStreamUrl && this.isWatching) {
            console.log('Reloading stream:', this.currentStreamUrl);
            // Reset buffering events when manually reloading
            this.bufferingEvents = [];
            const videoElement = document.getElementById('videoPlayerLarge');
            this.hideError();
            this.initializePlayer(this.currentStreamUrl, videoElement);
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
        
        // Clear monitoring
        this.clearBufferingMonitor();
        
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
        
        // Reset all state
        this.currentStreamUrl = null;
        this.currentStreamName = null;
        this.playbackStarted = false;
        this.errorRetryCount = 0;
        this.streamEndDetected = false;
        this.isWatching = false;
    }
}

