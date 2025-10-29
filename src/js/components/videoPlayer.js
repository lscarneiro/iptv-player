// Simplified Video Player Component
import { ErrorHandler } from './errorHandler.js';
import { RetryManager } from './retryManager.js';
import { BufferingManager } from './bufferingManager.js';

export class VideoPlayer {
    constructor() {
        this.hlsPlayer = null;
        this.isWatching = false;
        this.currentStreamUrl = null;
        this.currentStreamName = null;
        this.playbackStarted = false;
        this.streamEndDetected = false;
        this.autoplayErrorShown = false;
        
        // Initialize managers
        this.errorHandler = new ErrorHandler(this);
        this.retryManager = new RetryManager(5);
        this.bufferingManager = new BufferingManager(this, this.errorHandler);
        
        // Network monitoring
        this.loadingTimeout = null;
        this.maxLoadingTime = 30000;
        this.networkCheckInterval = null;
        
        // Fragment error tracking
        this.fragmentErrors = [];
        this.maxFragmentErrors = 8;
        
        this.initializeFullscreenHandlers();
    }

    initializeFullscreenHandlers() {
        if (VideoPlayer.handlersInitialized) return;
        VideoPlayer.handlersInitialized = true;
        
        const setupHandler = () => {
            ['videoPlayer', 'videoPlayerLarge'].forEach(id => {
                const video = document.getElementById(id);
                if (video) this.setupFullscreenHandler(video);
            });
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupHandler);
        } else {
            setupHandler();
        }
    }

    playStream(streamUrl, streamName) {
        console.log('Starting new stream:', streamName, streamUrl);
        
        this.forceCleanup();
        this.updateUI(streamUrl, streamName);
        
        // Reset state
        this.currentStreamUrl = streamUrl;
        this.currentStreamName = streamName;
        this.playbackStarted = false;
        this.streamEndDetected = false;
        this.autoplayErrorShown = false;
        this.retryManager.reset();
        this.bufferingManager.reset();
        this.fragmentErrors = [];
        
        this.initializePlayer(streamUrl);
        this.startLoadingTimeout();
        this.startNetworkMonitoring();
        this.isWatching = true;
    }

    forceCleanup() {
        console.log('Force cleaning up current stream state');
        
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
        
        const videoLarge = document.getElementById('videoPlayerLarge');
        if (videoLarge) {
            videoLarge.pause();
            videoLarge.currentTime = 0;
            videoLarge.removeAttribute('src');
            videoLarge.load();
            
            // Clean reset by cloning element
            const newVideo = videoLarge.cloneNode(true);
            videoLarge.parentNode.replaceChild(newVideo, videoLarge);
        }
        
        this.clearAllMonitoring();
        this.errorHandler.hideError();
    }

    updateUI(streamUrl, streamName) {
        const elements = {
            playerTitle: streamName,
            videoPanelTitle: streamName,
            videoInfoTitle: streamName,
            videoInfoDetails: `Stream URL: ${streamUrl}`
        };
        
        Object.entries(elements).forEach(([id, text]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = text;
        });
        
        // Update fallback links
        ['fallbackUrl', 'fallbackUrlLarge'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.href = streamUrl;
                element.textContent = streamUrl;
            }
        });
        
        // Show UI
        const mainContainer = document.getElementById('mainContainer');
        const videoPanel = document.getElementById('videoPanel');
        if (mainContainer) mainContainer.classList.add('watching');
        if (videoPanel) videoPanel.style.display = 'flex';
        
        ['fallbackLink', 'fallbackLinkLarge'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.style.display = 'block';
        });
        
        // Notify mobile navigation
        if (window.app?.mobileNav) {
            setTimeout(() => window.app.mobileNav.onVideoReady(), 100);
        }
    }

    initializePlayer(streamUrl) {
        const videoElement = document.getElementById('videoPlayerLarge');
        if (!videoElement) return;
        
        // Check for no signal
        if (streamUrl.includes('black.ts')) {
            this.handleNoSignal();
            return;
        }
        
        if (window.Hls && Hls.isSupported()) {
            this.setupHlsPlayer(streamUrl, videoElement);
        } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            this.setupNativePlayer(streamUrl, videoElement);
        } else {
            this.errorHandler.showError('UNSUPPORTED', 'HLS not supported on this device. Try the direct link below.');
        }
    }

    setupHlsPlayer(streamUrl, videoElement) {
        this.hlsPlayer = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90,
            maxLoadingDelay: 4,
            maxBufferLength: 30,
            fragLoadingTimeOut: 20000,
            manifestLoadingTimeOut: 10000,
            fragLoadingMaxRetry: 2,
            manifestLoadingMaxRetry: 1
        });
        
        this.hlsPlayer.loadSource(streamUrl);
        this.hlsPlayer.attachMedia(videoElement);
        
        this.setupEventListeners(videoElement);
    }

    setupNativePlayer(streamUrl, videoElement) {
        videoElement.src = streamUrl;
        this.setupEventListeners(videoElement);
        this.attemptAutoplay(videoElement, 'Native player loaded');
    }

    setupEventListeners(videoElement) {
        if (this.hlsPlayer) {
            this.hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
                this.attemptAutoplay(videoElement, 'HLS manifest loaded');
            });
            
            this.hlsPlayer.on(Hls.Events.MANIFEST_LOADED, (event, data) => {
                // Check if this is a "stream ended" playlist pattern
                if (this.isStreamEndedPlaylist(data)) {
                    console.log('Detected stream ended playlist pattern');
                    this.handleNoSignal();
                    return;
                }
            });
            
            this.hlsPlayer.on(Hls.Events.LEVEL_LOADED, (event, data) => {
                // Also check when playlist updates are received
                if (this.isStreamEndedPlaylist(data)) {
                    console.log('Playlist updated to stream ended pattern');
                    this.handleNoSignal();
                    return;
                }
            });
            
            this.hlsPlayer.on(Hls.Events.FRAG_LOADED, () => {
                if (!this.playbackStarted) {
                    this.onPlaybackStarted(videoElement);
                }
            });
            
            this.hlsPlayer.on(Hls.Events.ERROR, (event, data) => {
                this.handleHlsError(data);
            });
        }
        
        // Video element events
        videoElement.addEventListener('canplay', () => {
            if (!this.playbackStarted) {
                this.onPlaybackStarted(videoElement);
            }
        });
        
        videoElement.addEventListener('playing', () => {
            if (!this.playbackStarted) {
                this.onPlaybackStarted(videoElement);
            }
            this.dismissAutoplayError();
        });
        
        videoElement.addEventListener('play', () => {
            this.dismissAutoplayError();
        });
        
        videoElement.addEventListener('error', (e) => {
            this.handleVideoError(e);
        });
        
        ['stalled', 'waiting'].forEach(event => {
            videoElement.addEventListener(event, () => {
                this.bufferingManager.recordEvent(event);
            });
        });
    }

    onPlaybackStarted(videoElement) {
        console.log('Playback started successfully');
        this.playbackStarted = true;
        this.retryManager.reset();
        this.clearLoadingTimeout();
        this.clearNetworkMonitoring();
        this.dismissAutoplayError();
        this.bufferingManager.startMonitoring(videoElement);
    }

    handleHlsError(data) {
        const { type, details, fatal, frag } = data;
        
        // Check for no signal
        if (frag?.url?.includes('black.ts')) {
            this.handleNoSignal();
            return;
        }
        
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
                    this.handleMediaError(details, data);
                    break;
                default:
                    this.errorHandler.showError('HLS_FATAL', `Fatal HLS error: ${details}`);
            }
        }
    }

    handleNetworkError(details, data) {
        if (data.frag?.url?.includes('black.ts')) {
            this.handleNoSignal();
            return;
        }
        
        if (!this.playbackStarted && this.retryManager.canRetry()) {
            const delay = this.retryManager.getNextRetryDelay();
            console.log(`Retrying stream (${this.retryManager.getCurrentAttempt()}/${this.retryManager.getMaxRetries()}) in ${delay}ms`);
            setTimeout(() => this.retryStream(), delay);
        } else if (!this.playbackStarted) {
            this.errorHandler.showError('STREAM_FAILED_TO_START', 
                `Unable to start stream after ${this.retryManager.getMaxRetries()} attempts. The stream may be offline or unreachable.`);
        } else {
            const actions = [
                { class: 'retry-btn', icon: '🔄', text: 'Reload Stream', onclick: 'window.app.videoPlayer.reloadStreamWithOverlay(this);' },
                { class: 'continue-btn', icon: '▶️', text: 'Keep Trying', onclick: 'window.app.videoPlayer.errorHandler.dismissOverlay()' }
            ];
            this.errorHandler.showOverlayError('STREAM_INTERRUPTED', 
                'Stream connection lost during playback. The stream may have ended or there\'s a network issue.', actions);
        }
    }

    handleMediaError(details, data) {
        if (details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
            this.bufferingManager.recordEvent('buffer_stalled');
            this.bufferingManager.attemptRecovery();
            return;
        }
        
        if (!this.playbackStarted) {
            this.errorHandler.showError('MEDIA_ERROR', 'Media format error. This stream format may not be supported.');
        } else {
            try {
                this.hlsPlayer.recoverMediaError();
            } catch (e) {
                this.errorHandler.showError('MEDIA_RECOVERY_FAILED', 'Playback error occurred and recovery failed.', true);
            }
        }
    }

    handleVideoError(error) {
        const errorCode = error.target.error?.code || 'unknown';
        const message = `Video ${this.playbackStarted ? 'playback' : 'loading'} error (Code: ${errorCode})`;
        this.errorHandler.showError('VIDEO_ERROR', message, this.playbackStarted);
    }

    trackFragmentError(data) {
        const now = Date.now();
        this.fragmentErrors.push({
            timestamp: now,
            url: data.frag?.url || 'unknown',
            details: data.details
        });
        
        this.fragmentErrors = this.fragmentErrors.filter(
            error => now - error.timestamp < 30000
        );
        
        if (this.fragmentErrors.length >= this.maxFragmentErrors) {
            const uniqueUrls = [...new Set(this.fragmentErrors.map(e => e.url))];
            if (uniqueUrls.length === 1 && uniqueUrls[0].includes('black.ts')) {
                this.handleNoSignal();
            } else if (this.playbackStarted && this.bufferingManager.recoveryAttempts < this.bufferingManager.maxRecoveryAttempts) {
                this.bufferingManager.attemptRecovery();
                this.fragmentErrors = this.fragmentErrors.slice(-3);
            } else {
                const message = `Persistent connection issues. ${this.fragmentErrors.length} fragment errors in 30 seconds.`;
                this.errorHandler.showError('STREAM_INTERRUPTED', message, true);
            }
        }
    }

    handleNoSignal() {
        if (this.streamEndDetected) return;
        
        console.log('No signal detected (black.ts)');
        this.streamEndDetected = true;
        
        if (this.hlsPlayer) {
            this.hlsPlayer.stopLoad();
        }
        
        this.clearAllMonitoring();
        this.errorHandler.showError('NO_SIGNAL', 
            'The stream is currently showing no signal. This usually means:\n\n' +
            '• The broadcast has ended or is temporarily offline\n' +
            '• Technical difficulties at the source\n' +
            '• The channel is between programs\n\n' +
            'You can try reloading to check if the signal has returned.');
    }

    isStreamEndedPlaylist(manifestData) {
        try {
            // Check multiple possible data structures from HLS.js
            const manifest = manifestData.details || manifestData.level || manifestData;
            
            // Look for the classic "stream ended" pattern:
            // 1. Has EXT-X-ENDLIST (indicates stream has ended)
            // 2. Contains only black.ts segments  
            // 3. Usually has very few segments (often just 1)
            
            // Check if this is a non-live playlist (has ENDLIST)
            if (manifest && (manifest.live === false || manifest.endlist === true)) {
                const segments = manifest.segments || manifest.details?.segments || [];
                
                if (segments.length === 0) {
                    return false; // Empty playlist, not necessarily ended
                }
                
                // Check if all segments are black.ts (definitive stream ended pattern)
                const blackSegments = segments.filter(segment => 
                    segment && segment.url && segment.url.includes('black.ts')
                );
                
                if (blackSegments.length === segments.length && segments.length > 0) {
                    console.log(`Detected playlist with ${segments.length} black.ts segments and ENDLIST - stream has definitely ended`);
                    return true;
                }
                
                // Check for mixed playlist with majority black.ts segments (likely stream ended)
                if (blackSegments.length > 0 && segments.length <= 5) {
                    const blackRatio = blackSegments.length / segments.length;
                    if (blackRatio >= 0.5) { // 50% or more are black.ts
                        console.log(`Detected short playlist (${segments.length} segments) with ${blackSegments.length} black.ts segments and ENDLIST - likely stream ended`);
                        return true;
                    }
                }
                
                // Special case: single segment playlist with black.ts
                if (segments.length === 1 && blackSegments.length === 1) {
                    console.log('Detected single black.ts segment with ENDLIST - stream ended');
                    return true;
                }
            }
            
            // Also check the manifest URL itself
            const manifestUrl = manifestData.url || this.currentStreamUrl || '';
            if (manifestUrl.includes('black.ts')) {
                console.log('Manifest URL contains black.ts - stream ended');
                return true;
            }
            
            // Check if the manifest content indicates stream end
            if (manifestData.networkDetails && manifestData.networkDetails.responseText) {
                const manifestText = manifestData.networkDetails.responseText;
                if (manifestText.includes('#EXT-X-ENDLIST') && manifestText.includes('black.ts')) {
                    console.log('Manifest content contains ENDLIST and black.ts - stream ended');
                    return true;
                }
            }
            
        } catch (error) {
            console.warn('Error analyzing manifest for stream end pattern:', error);
        }
        
        return false;
    }

    attemptAutoplay(videoElement, context) {
        videoElement.play().then(() => {
            console.log('Autoplay successful');
        }).catch(e => {
            this.handleAutoplayFailure(videoElement, e, context);
        });
    }

    handleAutoplayFailure(videoElement, error, context) {
        if (this.playbackStarted) return;
        
        let reason = 'Browser autoplay policy prevents automatic playback';
        if (error.name === 'AbortError') {
            reason = 'Playback was interrupted (possibly by another stream starting)';
        }
        
        this.showAutoplayDialog(reason, context);
    }

    showAutoplayDialog(reason, context) {
        if (this.playbackStarted || this.autoplayErrorShown) return;
        
        this.autoplayErrorShown = true;
        
        const message = `**Reason:** ${reason}\n\n**Solution:** Your browser requires user interaction to start video playback. Click the play button below.`;
        
        const errorDiv = document.getElementById('videoPanelError');
        if (errorDiv) {
            const dialogHtml = `
                <div class="error-container autoplay-blocked">
                    <div class="error-icon">▶️</div>
                    <div class="error-content">
                        <h3 class="error-title">Autoplay Blocked</h3>
                        <p class="error-message">${message.replace(/\n/g, '<br>')}</p>
                        <div class="error-actions">
                            <button class="error-btn play-btn" onclick="window.app.videoPlayer.manualPlay()">
                                ▶️ Play Stream
                            </button>
                            <button class="error-btn fallback-btn" onclick="document.getElementById('fallbackLinkLarge').scrollIntoView()">
                                🔗 Direct Link
                            </button>
                            <button class="error-btn close-btn" onclick="window.app.videoPlayer.closeVideoPanel()">
                                ❌ Close Stream
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
            
            const videoContainer = document.querySelector('.video-container-large');
            if (videoContainer) {
                videoContainer.style.display = 'flex';
            }
        }
        
        // Auto-dismiss check
        setTimeout(() => {
            if (this.playbackStarted && this.autoplayErrorShown) {
                this.dismissAutoplayError();
            }
        }, 10000);
    }

    manualPlay() {
        const videoElement = document.getElementById('videoPlayerLarge');
        if (!videoElement) return;
        
        this.errorHandler.hideError();
        
        videoElement.play().then(() => {
            if (!this.playbackStarted) {
                this.onPlaybackStarted(videoElement);
            }
        }).catch(e => {
            this.errorHandler.showError('PLAYBACK_FAILED', 
                `Unable to start playback: ${e.message}. This may be a stream or browser compatibility issue.`, true);
        });
    }

    dismissAutoplayError() {
        if (this.autoplayErrorShown) {
            this.autoplayErrorShown = false;
            this.errorHandler.hideError();
        }
    }

    // Backward compatibility methods
    showError(errorType, message, showRetry = false) {
        this.errorHandler.showError(errorType, message, showRetry);
    }

    hideError() {
        this.errorHandler.hideError();
    }

    showLoading(message) {
        // Legacy method - redirect to showLoadingState
        this.showLoadingState();
    }

    closePlayer() {
        // Legacy method - redirect to closeVideoPanel
        this.closeVideoPanel();
    }

    retryStream() {
        if (!this.currentStreamUrl || !this.isWatching) return;
        
        this.bufferingManager.reset();
        this.errorHandler.hideError();
        this.showLoadingState();
        this.initializePlayer(this.currentStreamUrl);
    }

    reloadStream() {
        if (!this.currentStreamUrl || !this.isWatching) return;
        
        this.retryManager.reset();
        this.bufferingManager.reset();
        this.fragmentErrors = [];
        this.errorHandler.hideError();
        this.showLoadingState();
        this.initializePlayer(this.currentStreamUrl);
    }

    reloadStreamInBackground() {
        if (!this.currentStreamUrl || !this.isWatching) return;
        
        const videoElement = document.getElementById('videoPlayerLarge');
        const currentTime = videoElement?.currentTime || 0;
        
        this.bufferingManager.reset();
        this.fragmentErrors = [];
        this.initializePlayer(this.currentStreamUrl);
        
        if (currentTime > 0) {
            setTimeout(() => {
                if (videoElement && videoElement.readyState >= 2) {
                    videoElement.currentTime = Math.max(0, currentTime - 5);
                }
            }, 2000);
        }
    }

    reloadStreamWithOverlay(buttonElement) {
        const overlay = buttonElement.closest('.buffering-overlay');
        if (overlay) {
            overlay.innerHTML = `
                <div class="error-container loading-state">
                    <div class="error-icon">🔄</div>
                    <div class="error-content">
                        <h3 class="error-title">Reloading Stream</h3>
                        <p class="error-message">Restarting stream connection...</p>
                        <div class="loading-spinner"></div>
                    </div>
                </div>
            `;
            setTimeout(() => overlay.remove(), 5000);
        }
        
        this.reloadStreamInBackground();
    }

    showLoadingState() {
        const errorDiv = document.getElementById('videoPanelError');
        const videoContainer = document.querySelector('.video-container-large');
        
        if (errorDiv) {
            errorDiv.innerHTML = `
                <div class="error-container loading-state">
                    <div class="error-icon">⏳</div>
                    <div class="error-content">
                        <h3 class="error-title">Loading Stream</h3>
                        <p class="error-message">Restarting stream playback, please wait...</p>
                        <div class="loading-spinner"></div>
                    </div>
                </div>
            `;
            errorDiv.style.display = 'block';
            if (videoContainer) {
                videoContainer.style.display = 'flex';
            }
        }
    }

    // Network monitoring methods
    startLoadingTimeout() {
        this.clearLoadingTimeout();
        this.loadingTimeout = setTimeout(() => {
            if (!this.playbackStarted && this.isWatching) {
                const message = navigator.onLine === false ? 
                    'No internet connection detected. Please check your network connection.' :
                    'Stream is taking too long to load. This could be due to network issues or server problems.';
                this.errorHandler.showError('LOADING_TIMEOUT', message, true);
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
        this.networkCheckInterval = setInterval(() => {
            if (!this.playbackStarted && typeof navigator.onLine !== 'undefined' && !navigator.onLine) {
                this.errorHandler.showError('NO_INTERNET', 'Your device appears to be offline. Please check your internet connection.');
                this.clearNetworkMonitoring();
            }
        }, 5000);
    }

    clearNetworkMonitoring() {
        if (this.networkCheckInterval) {
            clearInterval(this.networkCheckInterval);
            this.networkCheckInterval = null;
        }
    }

    clearAllMonitoring() {
        this.bufferingManager.clearMonitoring();
        this.clearLoadingTimeout();
        this.clearNetworkMonitoring();
    }

    // Cleanup methods
    closeVideoPanel() {
        this.forceCleanup();
        
        const mainContainer = document.getElementById('mainContainer');
        const videoPanel = document.getElementById('videoPanel');
        
        if (mainContainer) mainContainer.classList.remove('watching');
        if (videoPanel) videoPanel.style.display = 'none';
        
        // Notify mobile navigation that video was closed
        if (window.app && window.app.mobileNav) {
            window.app.mobileNav.onVideoClosed();
        }
        
        this.resetState();
    }

    cleanup() {
        this.forceCleanup();
        this.resetState();
    }

    resetState() {
        this.currentStreamUrl = null;
        this.currentStreamName = null;
        this.playbackStarted = false;
        this.streamEndDetected = false;
        this.autoplayErrorShown = false;
        this.fragmentErrors = [];
        this.retryManager.reset();
        this.bufferingManager.reset();
        this.isWatching = false;
    }

    // Fullscreen handling
    setupFullscreenHandler(videoElement) {
        if (!videoElement || VideoPlayer.fullscreenListenerAdded) return;
        
        VideoPlayer.fullscreenListenerAdded = true;
        
        const handleFullscreenChange = () => {
            const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
            const isThisVideo = [document.fullscreenElement, document.webkitFullscreenElement, document.mozFullScreenElement].includes(videoElement);
            
            if (isFullscreen && isThisVideo) {
                document.body.classList.add('video-fullscreen');
            } else {
                document.body.classList.remove('video-fullscreen');
            }
        };
        
        ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'].forEach(event => {
            document.addEventListener(event, handleFullscreenChange);
        });
    }
}