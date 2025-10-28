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
        this.fragmentErrors = [];
        this.maxFragmentErrors = 8; // Increased tolerance
        this.bufferingRecoveryAttempts = 0;
        this.maxBufferingRecoveryAttempts = 3;
        this.loadingTimeout = null;
        this.maxLoadingTime = 30000; // 30 seconds max to start playing
        this.networkCheckInterval = null;
        this.lastNetworkCheck = Date.now();
        this.autoplayErrorShown = false;
        
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
        console.log('Starting new stream:', streamName, streamUrl);
        
        // FIRST: Completely cleanup any existing stream before starting new one
        this.forceCleanupCurrentStream();
        
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
        
        // Reset ALL state for new stream (after cleanup)
        this.currentStreamUrl = streamUrl;
        this.currentStreamName = streamName;
        this.playbackStarted = false;
        this.errorRetryCount = 0;
        this.streamEndDetected = false;
        this.fragmentErrors = [];
        this.autoplayErrorShown = false;
        this.bufferingRecoveryAttempts = 0;
        this.clearAllMonitoring();
        
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
        this.startLoadingTimeout();
        this.startNetworkMonitoring();
        this.isWatching = true;
    }

    forceCleanupCurrentStream() {
        console.log('Force cleaning up current stream state');
        
        // Stop and destroy HLS player immediately
        if (this.hlsPlayer) {
            try {
                this.hlsPlayer.stopLoad();
                this.hlsPlayer.detachMedia();
                this.hlsPlayer.destroy();
            } catch (e) {
                console.warn('Error destroying HLS player:', e);
            }
            this.hlsPlayer = null;
        }
        
        // Clear all video elements
        const videoLarge = document.getElementById('videoPlayerLarge');
        if (videoLarge) {
            videoLarge.pause();
            videoLarge.currentTime = 0;
            videoLarge.removeAttribute('src');
            videoLarge.load();
            // Remove any existing event listeners by cloning the element
            const newVideoLarge = videoLarge.cloneNode(true);
            videoLarge.parentNode.replaceChild(newVideoLarge, videoLarge);
        }
        
        // Clear all monitoring and timeouts
        this.clearAllMonitoring();
        
        // Hide any existing errors
        this.hideError();
        
        // Reset all state flags
        this.playbackStarted = false;
        this.errorRetryCount = 0;
        this.streamEndDetected = false;
        this.fragmentErrors = [];
        this.autoplayErrorShown = false;
        this.bufferingRecoveryAttempts = 0;
    }

    clearAllMonitoring() {
        this.clearBufferingMonitor();
        this.clearLoadingTimeout();
        this.clearNetworkMonitoring();
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
            backBufferLength: 90,
            maxLoadingDelay: 4,
            maxBufferLength: 30,
            maxMaxBufferLength: 600,
            fragLoadingTimeOut: 20000,
            manifestLoadingTimeOut: 10000,
            fragLoadingMaxRetry: 2,
            manifestLoadingMaxRetry: 1
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
        
        this.attemptAutoplay(videoElement, 'Native player loaded');
    }

    attemptAutoplay(videoElement, context) {
        console.log(`Attempting autoplay: ${context}`);
        
        videoElement.play().then(() => {
            console.log('Autoplay successful');
        }).catch(e => {
            console.error('Autoplay failed:', e);
            this.handleAutoplayFailure(videoElement, e, context);
        });
    }

    handleAutoplayFailure(videoElement, error, context) {
        console.warn(`Autoplay blocked (${context}):`, error.message);
        
        // Determine the specific reason for autoplay failure
        let reason = 'Unknown reason';
        let solution = 'Click the play button below to start the stream.';
        
        if (error.name === 'NotAllowedError') {
            reason = 'Browser autoplay policy prevents automatic playback';
            solution = 'Your browser requires user interaction to start video playback. Click the play button below.';
        } else if (error.name === 'AbortError') {
            reason = 'Playback was interrupted (possibly by another stream starting)';
            solution = 'The previous playback was stopped. Click the play button below to start this stream.';
        } else if (error.name === 'NotSupportedError') {
            reason = 'Video format or codec not supported';
            solution = 'This video format may not be supported. Try the direct link below.';
        } else if (error.message.includes('user activation')) {
            reason = 'User interaction required by browser policy';
            solution = 'Modern browsers require a user click before playing video. Click the play button below.';
        }
        
        this.showAutoplayBlockedDialog(videoElement, reason, solution, context);
    }

    showAutoplayBlockedDialog(videoElement, reason, solution, context) {
        // Don't show autoplay error if playback has already started
        if (this.playbackStarted) {
            console.log('Playback already started, skipping autoplay error dialog');
            return;
        }
        
        this.autoplayErrorShown = true;
        const errorDiv = document.getElementById('videoPanelError');
        const videoContainer = document.querySelector('.video-container-large');
        
        // Auto-dismiss after 10 seconds if playback starts
        setTimeout(() => {
            if (this.playbackStarted && this.autoplayErrorShown) {
                console.log('Auto-dismissing autoplay error after playback started');
                this.dismissAutoplayErrorIfShown();
            }
        }, 10000);
        
        if (errorDiv) {
            const dialogHtml = `
                <div class="error-container autoplay-blocked">
                    <div class="error-icon">▶️</div>
                    <div class="error-content">
                        <h3 class="error-title">Autoplay Blocked</h3>
                        <p class="error-message">
                            <strong>Reason:</strong> ${reason}<br><br>
                            <strong>Solution:</strong> ${solution}
                        </p>
                        <div class="error-actions">
                            <button class="error-btn play-btn" onclick="window.app.videoPlayer.manualPlay()">
                                ▶️ Play Stream
                            </button>
                            <button class="error-btn fallback-btn" onclick="document.getElementById('fallbackLinkLarge').scrollIntoView()">
                                🔗 Direct Link
                            </button>
                            <button class="error-btn close-btn" onclick="window.app.videoPlayer.closeVideoPanel()">
                                ❌ Close Player
                            </button>
                        </div>
                        <div class="error-details">
                            <small>Context: ${context}</small>
                        </div>
                    </div>
                </div>
            `;
            
            errorDiv.innerHTML = dialogHtml;
            errorDiv.style.display = 'block';
            if (videoContainer) {
                videoContainer.style.display = 'flex'; // Keep video visible for play button
            }
        }
    }

    manualPlay() {
        const videoElement = document.getElementById('videoPlayerLarge');
        if (videoElement) {
            console.log('Manual play triggered by user');
            this.hideError();
            
            videoElement.play().then(() => {
                console.log('Manual play successful');
                if (!this.playbackStarted) {
                    this.playbackStarted = true;
                    this.clearLoadingTimeout();
                    this.clearNetworkMonitoring();
                    this.dismissAutoplayErrorIfShown();
                    this.startBufferingMonitor(videoElement);
                }
            }).catch(e => {
                console.error('Manual play also failed:', e);
                this.handleError('PLAYBACK_FAILED', 
                    `Unable to start playback even with manual play. Error: ${e.message}. This may be a stream or browser compatibility issue.`,
                    true);
            });
        }
    }

    dismissAutoplayErrorIfShown() {
        if (this.autoplayErrorShown) {
            console.log('Playback started successfully - dismissing autoplay error dialog');
            this.autoplayErrorShown = false;
            this.hideError();
        }
    }

    setupHlsEventListeners(videoElement) {
        this.hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('HLS manifest parsed successfully');
            this.attemptAutoplay(videoElement, 'HLS manifest loaded');
        });
        
        this.hlsPlayer.on(Hls.Events.FRAG_LOADED, () => {
            if (!this.playbackStarted) {
                console.log('First fragment loaded - playback starting');
                this.playbackStarted = true;
                this.errorRetryCount = 0; // Reset retry count on successful start
                this.clearLoadingTimeout();
                this.clearNetworkMonitoring();
                this.dismissAutoplayErrorIfShown();
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
                console.log('Video can play - playback starting');
                this.playbackStarted = true;
                this.errorRetryCount = 0;
                this.clearLoadingTimeout();
                this.clearNetworkMonitoring();
                this.dismissAutoplayErrorIfShown();
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
        
        videoElement.addEventListener('playing', () => {
            console.log('Video is now playing');
            if (!this.playbackStarted) {
                this.playbackStarted = true;
                this.clearLoadingTimeout();
                this.clearNetworkMonitoring();
                this.startBufferingMonitor(videoElement);
            }
            this.dismissAutoplayErrorIfShown();
        });
        
        videoElement.addEventListener('play', () => {
            console.log('Video play event fired');
            this.dismissAutoplayErrorIfShown();
        });
    }

    handleHlsError(data, videoElement) {
        const { type, details, fatal, frag } = data;
        
        // Check if this is a black.ts fragment error (stream ended)
        if (frag && frag.url && frag.url.includes('black.ts')) {
            console.log('Detected black.ts fragment - stream has ended');
            this.handleStreamEnded();
            return;
        }
        
        // Check for repeated fragment load errors (potential stream ending)
        if (details === 'fragLoadError' && !fatal) {
            this.trackFragmentError(data);
            return;
        }
        
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
        // Check if this is a CORS error with black.ts (stream ended)
        if (data.frag && data.frag.url && data.frag.url.includes('black.ts')) {
            console.log('CORS error with black.ts fragment - stream has ended');
            this.handleStreamEnded();
            return;
        }
        
        // Create detailed error message based on the specific error
        const errorDetails = this.analyzeNetworkError(details, data);
        
        if (!this.playbackStarted) {
            // Stream failed to start
            if (this.errorRetryCount < this.maxRetries) {
                this.errorRetryCount++;
                console.log(`Retrying stream load (attempt ${this.errorRetryCount}/${this.maxRetries}) after ${details}`);
                setTimeout(() => {
                    this.retryStream();
                }, 2000 * this.errorRetryCount); // Exponential backoff
            } else {
                this.handleError('STREAM_FAILED_TO_START', 
                    `Unable to start the stream after ${this.maxRetries} attempts.\n\n` +
                    `**Error Details:** ${errorDetails.description}\n` +
                    `**Possible Causes:** ${errorDetails.causes}\n` +
                    `**Suggested Actions:** ${errorDetails.solutions}`);
            }
        } else {
            // Stream was playing but encountered network error
            this.handleError('STREAM_INTERRUPTED', 
                `Stream connection was interrupted during playback.\n\n` +
                `**Error Details:** ${errorDetails.description}\n` +
                `**What Happened:** ${errorDetails.causes}\n` +
                `**Next Steps:** ${errorDetails.solutions}`,
                true); // Show retry option
        }
    }

    handleMediaError(details, data, videoElement) {
        if (details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
            this.recordBufferingEvent('buffer_stalled');
            this.attemptBufferingRecovery(videoElement);
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
        if (this.streamEndDetected) {
            return; // Already handled
        }
        
        console.log('Stream ended - stopping player and showing dialog');
        this.streamEndDetected = true;
        
        // Stop the HLS player to prevent further fragment loading attempts
        if (this.hlsPlayer) {
            this.hlsPlayer.stopLoad();
        }
        
        // Stop all monitoring
        this.clearBufferingMonitor();
        this.clearLoadingTimeout();
        this.clearNetworkMonitoring();
        
        // Show the stream ended dialog
        this.showStreamEndedDialog();
    }

    analyzeNetworkError(details, data) {
        const response = data.response || {};
        const url = data.url || this.currentStreamUrl || 'unknown';
        
        switch (details) {
            case 'manifestLoadError':
                return {
                    description: `Failed to load stream manifest from ${url}`,
                    causes: 'Server is unreachable, stream is offline, or network connectivity issues',
                    solutions: 'Check your internet connection, verify the stream is online, or try the direct link'
                };
            case 'manifestLoadTimeOut':
                return {
                    description: 'Stream manifest request timed out',
                    causes: 'Slow network connection, server overload, or network congestion',
                    solutions: 'Check your network speed, try again later, or use a different network'
                };
            case 'fragLoadError':
                return {
                    description: `Failed to load video fragment (HTTP ${response.code || 'unknown'})`,
                    causes: 'Network interruption, server issues, or stream ended unexpectedly',
                    solutions: 'Reload the stream, check network stability, or try the direct link'
                };
            case 'fragLoadTimeOut':
                return {
                    description: 'Video fragment loading timed out',
                    causes: 'Network congestion, slow connection, or server performance issues',
                    solutions: 'Check network speed, try reloading, or switch to a better network'
                };
            case 'keyLoadError':
                return {
                    description: 'Failed to load decryption key for encrypted stream',
                    causes: 'Authentication issues, DRM problems, or server configuration errors',
                    solutions: 'Check if you have proper access rights or contact the stream provider'
                };
            default:
                return {
                    description: `Network error: ${details} (${response.code || 'no response code'})`,
                    causes: 'Various network or server-related issues',
                    solutions: 'Try reloading the stream, check your connection, or use the direct link'
                };
        }
    }

    retryStream() {
        if (this.currentStreamUrl && this.isWatching) {
            console.log('Retrying stream:', this.currentStreamUrl);
            
            // Reset recovery attempts for retry
            this.bufferingRecoveryAttempts = 0;
            
            const videoElement = document.getElementById('videoPlayerLarge');
            
            // Keep video player visible during retry
            this.hideError();
            this.showLoadingState();
            
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
        
        // Progressive response to buffering issues
        if (recentEvents.length >= 3 && this.bufferingRecoveryAttempts === 0) {
            console.warn(`Initial buffering issues detected (${recentEvents.length} events), attempting automatic recovery`);
            this.attemptBufferingRecovery();
        } else if (recentEvents.length >= 5 && this.bufferingRecoveryAttempts === 1) {
            console.warn(`Persistent buffering issues (${recentEvents.length} events), trying background stream reload`);
            this.showBufferingNotification();
            this.reloadStreamInBackground();
        } else if (recentEvents.length >= 8) {
            console.warn('Severe buffering detected after recovery attempts, showing user options');
            this.showBufferingIssueDialog();
        }
    }

    showBufferingNotification() {
        // Show a subtle notification that we're trying to fix buffering
        const videoContainer = document.querySelector('.video-container-large');
        if (!videoContainer) return;
        
        // Don't show if there's already a buffering overlay
        if (document.querySelector('.buffering-overlay') || document.querySelector('.buffering-notification')) {
            return;
        }
        
        const notification = document.createElement('div');
        notification.className = 'buffering-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">🔄</span>
                <span class="notification-text">Improving stream quality...</span>
            </div>
        `;
        notification.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(33, 150, 243, 0.9);
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 0.9rem;
            z-index: 999;
            backdrop-filter: blur(4px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: slideInRight 0.3s ease-out;
        `;
        
        videoContainer.appendChild(notification);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOutRight 0.3s ease-in';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, 4000);
    }

    attemptBufferingRecovery(videoElement = null) {
        if (this.bufferingRecoveryAttempts >= this.maxBufferingRecoveryAttempts) {
            console.log('Max buffering recovery attempts reached');
            return;
        }

        this.bufferingRecoveryAttempts++;
        console.log(`Attempting buffering recovery (attempt ${this.bufferingRecoveryAttempts}/${this.maxBufferingRecoveryAttempts})`);

        const video = videoElement || document.getElementById('videoPlayerLarge');
        
        if (this.hlsPlayer && video) {
            try {
                // Try HLS-specific recovery methods
                const currentTime = video.currentTime;
                
                // Method 1: Try to recover media error (handles buffering issues)
                this.hlsPlayer.recoverMediaError();
                
                // Method 2: If that doesn't work, try startLoad to resume
                setTimeout(() => {
                    if (video.paused || video.readyState < 3) {
                        console.log('Attempting to restart loading after recovery');
                        this.hlsPlayer.startLoad(Math.max(0, currentTime - 5)); // Start 5 seconds back
                    }
                }, 1000);
                
                // Method 3: If still having issues, try seeking slightly
                setTimeout(() => {
                    if (video.paused || video.readyState < 3) {
                        console.log('Attempting seek-based recovery');
                        const seekTime = Math.max(0, currentTime - 2);
                        video.currentTime = seekTime;
                        video.play().catch(e => console.warn('Recovery play failed:', e));
                    }
                }, 3000);
                
            } catch (error) {
                console.warn('Buffering recovery attempt failed:', error);
            }
        }
    }

    trackFragmentError(data) {
        const now = Date.now();
        const { frag } = data;
        
        // Track fragment errors
        this.fragmentErrors.push({
            timestamp: now,
            url: frag ? frag.url : 'unknown',
            details: data.details
        });
        
        // Keep only recent errors (last 30 seconds)
        this.fragmentErrors = this.fragmentErrors.filter(
            error => now - error.timestamp < 30000
        );
        
        // Check if we have too many fragment errors in a short time
        if (this.fragmentErrors.length >= this.maxFragmentErrors) {
            console.warn('Too many fragment errors detected, analyzing situation');
            
            // Check if errors are all the same URL (likely stream ended)
            const uniqueUrls = [...new Set(this.fragmentErrors.map(e => e.url))];
            if (uniqueUrls.length === 1 && uniqueUrls[0].includes('black.ts')) {
                this.handleStreamEnded();
            } else if (this.playbackStarted) {
                // Multiple different fragment errors during playback - try recovery first
                if (this.bufferingRecoveryAttempts < this.maxBufferingRecoveryAttempts) {
                    console.log('Fragment errors during playback - attempting recovery before giving up');
                    this.attemptBufferingRecovery();
                    // Clear some fragment errors to give recovery a chance
                    this.fragmentErrors = this.fragmentErrors.slice(-3);
                } else {
                    // Show as overlay instead of hiding video
                    this.showStreamInterruptedOverlay(
                        `Stream is experiencing persistent connection issues after ${this.bufferingRecoveryAttempts} recovery attempts.\n\n` +
                        `**Fragment Errors:** ${this.fragmentErrors.length} errors in 30 seconds\n` +
                        `**Recovery Attempts:** ${this.bufferingRecoveryAttempts}/${this.maxBufferingRecoveryAttempts} completed\n` +
                        `**Recommendation:** Try reloading the stream or check your network connection.`
                    );
                }
            } else {
                // Stream never started and having fragment issues
                this.handleError('STREAM_FAILED_TO_START',
                    `Unable to start the stream after multiple fragment loading failures.\n\n` +
                    `**Fragment Errors:** ${this.fragmentErrors.length} errors\n` +
                    `**Possible Causes:** Network issues, server problems, or stream unavailability\n` +
                    `**Next Steps:** Check your connection and try again, or use the direct link.`);
            }
        }
    }

    startLoadingTimeout() {
        this.clearLoadingTimeout();
        
        this.loadingTimeout = setTimeout(() => {
            if (!this.playbackStarted && this.isWatching) {
                console.warn('Stream loading timeout - no playback started within', this.maxLoadingTime, 'ms');
                this.handleLoadingTimeout();
            }
        }, this.maxLoadingTime);
    }

    clearLoadingTimeout() {
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
            this.loadingTimeout = null;
        }
    }

    startNetworkMonitoring() {
        this.clearNetworkMonitoring();
        
        // Check network connectivity every 5 seconds
        this.networkCheckInterval = setInterval(() => {
            this.checkNetworkConnectivity();
        }, 5000);
    }

    clearNetworkMonitoring() {
        if (this.networkCheckInterval) {
            clearInterval(this.networkCheckInterval);
            this.networkCheckInterval = null;
        }
    }

    async checkNetworkConnectivity() {
        // Skip if playback has started successfully
        if (this.playbackStarted) {
            return;
        }

        try {
            // Check if navigator.onLine is available and false
            if (typeof navigator.onLine !== 'undefined' && !navigator.onLine) {
                console.warn('Device reports offline status');
                this.handleNetworkConnectivityIssue('OFFLINE');
                return;
            }

            // Try a simple network request to detect connectivity issues
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(this.currentStreamUrl || window.location.origin, {
                method: 'HEAD',
                signal: controller.signal,
                cache: 'no-cache'
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                console.warn('Network connectivity check failed:', response.status);
                if (response.status >= 400) {
                    this.handleNetworkConnectivityIssue('HTTP_ERROR', response.status);
                }
            }
            
        } catch (error) {
            console.warn('Network connectivity check error:', error.message);
            
            // Analyze the error type
            if (error.name === 'AbortError') {
                this.handleNetworkConnectivityIssue('TIMEOUT');
            } else if (error.message.includes('SSL') || error.message.includes('certificate')) {
                this.handleNetworkConnectivityIssue('SSL_ERROR');
            } else if (error.message.includes('CORS')) {
                this.handleNetworkConnectivityIssue('CORS_ERROR');
            } else {
                this.handleNetworkConnectivityIssue('NETWORK_ERROR');
            }
        }
    }

    handleLoadingTimeout() {
        this.clearLoadingTimeout();
        this.clearNetworkMonitoring();
        
        // Check if we can determine the specific issue
        if (typeof navigator.onLine !== 'undefined' && !navigator.onLine) {
            this.handleError('NO_INTERNET', 
                'No internet connection detected. Please check your network connection and try again.');
        } else {
            this.handleError('LOADING_TIMEOUT', 
                'Stream is taking too long to load. This could be due to network issues, server problems, or the stream being offline.',
                true);
        }
    }

    handleNetworkConnectivityIssue(issueType, details = null) {
        // Only handle if we haven't started playback and are still watching
        if (this.playbackStarted || !this.isWatching) {
            return;
        }

        this.clearLoadingTimeout();
        this.clearNetworkMonitoring();

        switch (issueType) {
            case 'OFFLINE':
                this.handleError('NO_INTERNET', 
                    'Your device appears to be offline. Please check your internet connection.');
                break;
            case 'TIMEOUT':
                this.handleError('NETWORK_TIMEOUT', 
                    'Network request timed out. Your connection may be slow or unstable.',
                    true);
                break;
            case 'SSL_ERROR':
                this.handleError('SSL_ERROR', 
                    'SSL/HTTPS connection error. This may be due to network security settings or an untrusted certificate.',
                    true);
                break;
            case 'CORS_ERROR':
                this.handleError('CORS_ERROR', 
                    'Cross-origin request blocked. The stream server may have security restrictions.');
                break;
            case 'HTTP_ERROR':
                this.handleError('HTTP_ERROR', 
                    `Server returned error ${details}. The stream may be unavailable or require authentication.`,
                    true);
                break;
            default:
                this.handleError('NETWORK_ERROR', 
                    'Network connectivity issues detected. Please check your connection.',
                    true);
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
        this.clearLoadingTimeout();
        this.clearNetworkMonitoring();
        
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
        this.fragmentErrors = [];
        this.autoplayErrorShown = false;
        this.bufferingRecoveryAttempts = 0;
        
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
        this.clearLoadingTimeout();
        this.clearNetworkMonitoring();
        
        // Show appropriate error UI
        this.showError(message, errorType, showRetry);
    }

    showError(message, errorType = 'GENERIC', showRetry = false) {
        const errorDiv = document.getElementById('videoPanelError');
        const videoContainer = document.querySelector('.video-container-large');
        
        if (errorDiv) {
            const errorClass = this.getErrorCssClass(errorType);
            const errorIcon = this.getErrorIcon(errorType);
            
            let errorHtml = `
                <div class="error-container ${errorClass}">
                    <div class="error-icon">${errorIcon}</div>
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
            case 'NO_INTERNET':
                return 'No Internet Connection';
            case 'LOADING_TIMEOUT':
                return 'Loading Timeout';
            case 'NETWORK_TIMEOUT':
                return 'Network Timeout';
            case 'SSL_ERROR':
                return 'SSL/HTTPS Error';
            case 'CORS_ERROR':
                return 'Cross-Origin Error';
            case 'HTTP_ERROR':
                return 'Server Error';
            case 'NETWORK_ERROR':
                return 'Network Error';
            default:
                return 'Playback Error';
        }
    }

    getErrorCssClass(errorType) {
        switch (errorType) {
            case 'STREAM_ENDED':
                return 'stream-ended';
            case 'BUFFERING_ISSUES':
                return 'buffering-issues';
            case 'NO_INTERNET':
                return 'no-internet';
            case 'NETWORK_TIMEOUT':
            case 'SSL_ERROR':
            case 'CORS_ERROR':
            case 'HTTP_ERROR':
            case 'NETWORK_ERROR':
            case 'LOADING_TIMEOUT':
                return 'network-error';
            default:
                return '';
        }
    }

    getErrorIcon(errorType) {
        switch (errorType) {
            case 'STREAM_ENDED':
                return '📺';
            case 'BUFFERING_ISSUES':
                return '⏳';
            case 'NO_INTERNET':
                return '📶';
            case 'NETWORK_TIMEOUT':
            case 'LOADING_TIMEOUT':
                return '⏰';
            case 'SSL_ERROR':
                return '🔒';
            case 'CORS_ERROR':
                return '🚫';
            case 'HTTP_ERROR':
                return '🌐';
            case 'NETWORK_ERROR':
                return '📡';
            case 'AUTOPLAY_FAILED':
                return '▶️';
            case 'UNSUPPORTED':
                return '❌';
            case 'MEDIA_ERROR':
                return '🎬';
            default:
                return '⚠️';
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
        // Don't show if there's already a buffering overlay
        const existingOverlay = document.querySelector('.buffering-overlay');
        if (existingOverlay) {
            return;
        }
        
        const dialogHtml = `
            <div class="error-container buffering-issues">
                <div class="error-icon">⏳</div>
                <div class="error-content">
                    <h3 class="error-title">Frequent Buffering Detected</h3>
                    <p class="error-message">
                        The stream is experiencing frequent buffering. This might be due to network issues 
                        or server problems. The video will continue playing while we try to improve the connection.
                    </p>
                    <div class="error-actions">
                        <button class="error-btn retry-btn" onclick="window.app.videoPlayer.reloadStreamWithOverlay(this);">
                            🔄 Reload Stream
                        </button>
                        <button class="error-btn continue-btn" onclick="window.app.videoPlayer.dismissBufferingOverlay()">
                            ▶️ Continue Watching
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Show as overlay, keeping video visible and playing
        const overlay = document.createElement('div');
        overlay.className = 'buffering-overlay';
        overlay.innerHTML = dialogHtml;
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.75);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            backdrop-filter: blur(2px);
        `;
        
        const videoContainer = document.querySelector('.video-container-large');
        if (videoContainer) {
            videoContainer.style.position = 'relative';
            videoContainer.appendChild(overlay);
            
            // Auto-hide after 15 seconds if user doesn't interact
            setTimeout(() => {
                if (overlay.parentNode) {
                    console.log('Auto-dismissing buffering overlay after 15 seconds');
                    overlay.remove();
                }
            }, 15000);
        }
    }

    showStreamInterruptedOverlay(message) {
        // Don't show if there's already an overlay
        const existingOverlay = document.querySelector('.buffering-overlay');
        if (existingOverlay) {
            return;
        }
        
        const dialogHtml = `
            <div class="error-container network-error">
                <div class="error-icon">📡</div>
                <div class="error-content">
                    <h3 class="error-title">Stream Connection Issues</h3>
                    <p class="error-message">
                        ${message.replace(/\n/g, '<br>')}
                    </p>
                    <div class="error-actions">
                        <button class="error-btn retry-btn" onclick="window.app.videoPlayer.reloadStreamWithOverlay(this);">
                            🔄 Reload Stream
                        </button>
                        <button class="error-btn continue-btn" onclick="window.app.videoPlayer.dismissBufferingOverlay()">
                            ▶️ Keep Trying
                        </button>
                        <button class="error-btn close-btn" onclick="window.app.videoPlayer.closeVideoPanel()">
                            ❌ Close Player
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Show as overlay, keeping video visible and playing
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
            backdrop-filter: blur(3px);
        `;
        
        const videoContainer = document.querySelector('.video-container-large');
        if (videoContainer) {
            videoContainer.style.position = 'relative';
            videoContainer.appendChild(overlay);
        }
    }

    reloadStreamWithOverlay(buttonElement) {
        // Show loading state in the overlay while keeping video playing
        const overlay = buttonElement.closest('.buffering-overlay');
        if (overlay) {
            const loadingHtml = `
                <div class="error-container loading-state">
                    <div class="error-icon">🔄</div>
                    <div class="error-content">
                        <h3 class="error-title">Reloading Stream</h3>
                        <p class="error-message">
                            Restarting the stream connection while keeping the current video playing...
                        </p>
                        <div class="loading-spinner"></div>
                    </div>
                </div>
            `;
            overlay.innerHTML = loadingHtml;
            
            // Auto-dismiss overlay after reload attempt
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.remove();
                }
            }, 5000);
        }
        
        // Perform the reload without hiding the video
        this.reloadStreamInBackground();
    }

    reloadStreamInBackground() {
        if (this.currentStreamUrl && this.isWatching) {
            console.log('Reloading stream in background:', this.currentStreamUrl);
            
            // Reset error tracking when manually reloading
            this.bufferingEvents = [];
            this.fragmentErrors = [];
            this.errorRetryCount = 0;
            this.streamEndDetected = false;
            this.bufferingRecoveryAttempts = 0;
            
            // Don't hide video or show loading state - reload in background
            const videoElement = document.getElementById('videoPlayerLarge');
            
            // Store current playback position to try to resume
            const currentTime = videoElement ? videoElement.currentTime : 0;
            
            this.initializePlayer(this.currentStreamUrl, videoElement);
            
            // Try to seek to previous position after a short delay
            if (currentTime > 0) {
                setTimeout(() => {
                    if (videoElement && videoElement.readyState >= 2) {
                        videoElement.currentTime = Math.max(0, currentTime - 5); // Go back 5 seconds
                    }
                }, 2000);
            }
        }
    }

    dismissBufferingOverlay() {
        const overlay = document.querySelector('.buffering-overlay');
        if (overlay) {
            console.log('User dismissed buffering overlay');
            overlay.remove();
        }
    }

    reloadStream() {
        if (this.currentStreamUrl && this.isWatching) {
            console.log('Reloading stream:', this.currentStreamUrl);
            // Reset error tracking when manually reloading
            this.bufferingEvents = [];
            this.fragmentErrors = [];
            this.errorRetryCount = 0;
            this.streamEndDetected = false;
            this.bufferingRecoveryAttempts = 0; // Reset recovery attempts
            const videoElement = document.getElementById('videoPlayerLarge');
            
            // Keep video player visible during reload
            this.hideError();
            this.showLoadingState();
            
            this.initializePlayer(this.currentStreamUrl, videoElement);
        }
    }

    showLoadingState() {
        const errorDiv = document.getElementById('videoPanelError');
        const videoContainer = document.querySelector('.video-container-large');
        
        if (errorDiv) {
            const loadingHtml = `
                <div class="error-container loading-state">
                    <div class="error-icon">⏳</div>
                    <div class="error-content">
                        <h3 class="error-title">Loading Stream</h3>
                        <p class="error-message">
                            Restarting stream playback, please wait...
                        </p>
                        <div class="loading-spinner"></div>
                    </div>
                </div>
            `;
            
            errorDiv.innerHTML = loadingHtml;
            errorDiv.style.display = 'block';
            if (videoContainer) {
                videoContainer.style.display = 'flex'; // Keep video visible
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
        
        // Clear monitoring
        this.clearBufferingMonitor();
        this.clearLoadingTimeout();
        this.clearNetworkMonitoring();
        
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
        this.fragmentErrors = [];
        this.autoplayErrorShown = false;
        this.bufferingRecoveryAttempts = 0;
        this.isWatching = false;
    }
}

