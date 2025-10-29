// Refactored Video Player - Core orchestration with single responsibility
import { ErrorHandler } from './errorHandler.js';
import { RetryManager } from './retryManager.js';
import { BufferingManager } from './bufferingManager.js';
import { HlsPlayerManager } from './hlsPlayerManager.js';
import { StreamAnalyzer } from './streamAnalyzer.js';
import { VideoEventManager } from './videoEventManager.js';
import { NetworkMonitor } from '../utils/networkMonitor.js';

export class VideoPlayer {
    constructor() {
        this.initializeState();
        this.initializeManagers();
        this.initializeFullscreenHandlers();
    }

    initializeState() {
        this.isWatching = false;
        this.currentStreamUrl = null;
        this.currentStreamName = null;
        this.playbackStarted = false;
        this.streamEndDetected = false;
        this.autoplayErrorShown = false;
        this.fragmentErrors = [];
        this.maxFragmentErrors = 8;
    }

    initializeManagers() {
        this.errorHandler = new ErrorHandler(this);
        this.retryManager = new RetryManager(5);
        this.bufferingManager = new BufferingManager(this, this.errorHandler);
        this.hlsManager = new HlsPlayerManager(this);
        this.eventManager = new VideoEventManager(this);
        this.networkMonitor = new NetworkMonitor();
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
        this.resetStateForNewStream(streamUrl, streamName);
        this.initializePlayer(streamUrl);
        this.startMonitoring();
        
        this.isWatching = true;
    }

    resetStateForNewStream(streamUrl, streamName) {
        this.currentStreamUrl = streamUrl;
        this.currentStreamName = streamName;
        this.playbackStarted = false;
        this.streamEndDetected = false;
        this.autoplayErrorShown = false;
        this.fragmentErrors = [];
        
        this.retryManager.reset();
        this.bufferingManager.reset();
    }

    forceCleanup() {
        console.log('Force cleaning up current stream state');
        
        this.hlsManager.destroy();
        this.cleanupVideoElement();
        this.networkMonitor.cleanup();
        this.eventManager.cleanup();
        this.errorHandler.hideError();
    }

    cleanupVideoElement() {
        const videoLarge = document.getElementById('videoPlayerLarge');
        if (videoLarge) {
            videoLarge.pause();
            videoLarge.currentTime = 0;
            videoLarge.removeAttribute('src');
            videoLarge.load();
            
            // Clean reset by cloning element to remove all event listeners
            const newVideo = videoLarge.cloneNode(true);
            videoLarge.parentNode.replaceChild(newVideo, videoLarge);
        }
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
        
        this.updateFallbackLinks(streamUrl);
        this.showVideoUI();
        this.notifyMobileNavigation();
    }

    updateFallbackLinks(streamUrl) {
        ['fallbackUrl', 'fallbackUrlLarge'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.href = streamUrl;
                element.textContent = streamUrl;
            }
        });
    }

    showVideoUI() {
        const mainContainer = document.getElementById('mainContainer');
        const videoPanel = document.getElementById('videoPanel');
        
        if (mainContainer) mainContainer.classList.add('watching');
        if (videoPanel) videoPanel.style.display = 'flex';
        
        ['fallbackLink', 'fallbackLinkLarge'].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.style.display = 'block';
        });
    }

    notifyMobileNavigation() {
        if (window.app?.mobileNav) {
            setTimeout(() => window.app.mobileNav.onVideoReady(), 100);
        }
    }

    initializePlayer(streamUrl) {
        const videoElement = document.getElementById('videoPlayerLarge');
        if (!videoElement) return;
        
        if (StreamAnalyzer.isBlackTsUrl(streamUrl)) {
            this.handleNoSignal();
            return;
        }
        
        if (this.hlsManager.isSupported()) {
            this.setupHlsPlayer(streamUrl, videoElement);
        } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            this.setupNativePlayer(streamUrl, videoElement);
        } else {
            this.errorHandler.showError('UNSUPPORTED', 'HLS not supported on this device. Try the direct link below.');
        }
    }

    setupHlsPlayer(streamUrl, videoElement) {
        this.hlsManager.createPlayer();
        this.hlsManager.loadSource(streamUrl, videoElement);
        
        const callbacks = {
            onManifestParsed: () => this.attemptAutoplay(videoElement, 'HLS manifest loaded'),
            onManifestLoaded: (event, data) => this.checkForStreamEnd(data),
            onLevelLoaded: (event, data) => this.checkForStreamEnd(data),
            onFragLoaded: () => this.onFirstFragmentLoaded(videoElement),
            onError: (event, data) => this.handleHlsError(data)
        };
        
        this.hlsManager.setupEventListeners(videoElement, callbacks);
        this.eventManager.setupVideoElementEvents(videoElement);
    }

    setupNativePlayer(streamUrl, videoElement) {
        videoElement.src = streamUrl;
        this.eventManager.setupVideoElementEvents(videoElement);
        this.attemptAutoplay(videoElement, 'Native player loaded');
    }

    checkForStreamEnd(data) {
        if (StreamAnalyzer.isStreamEndedPlaylist(data)) {
            console.log('Detected stream ended playlist pattern');
            this.handleNoSignal();
        }
    }

    onFirstFragmentLoaded(videoElement) {
        if (!this.playbackStarted) {
            this.onPlaybackStarted(videoElement);
        }
    }

    onPlaybackStarted(videoElement) {
        console.log('Playback started successfully');
        this.playbackStarted = true;
        this.retryManager.reset();
        this.networkMonitor.cleanup();
        this.dismissAutoplayError();
        this.bufferingManager.startMonitoring(videoElement);
    }

    startMonitoring() {
        this.networkMonitor.startLoadingTimeout((message) => {
            this.errorHandler.showError('LOADING_TIMEOUT', message, true);
        });
        
        this.networkMonitor.startNetworkMonitoring((message) => {
            this.errorHandler.showError('NO_INTERNET', message);
        });
    }

    handleHlsError(data) {
        const { type, details, fatal, frag } = data;
        
        if (frag?.url && StreamAnalyzer.isBlackTsUrl(frag.url)) {
            this.handleNoSignal();
            return;
        }
        
        if (details === 'fragLoadError' && !fatal) {
            this.trackFragmentError(data);
            return;
        }
        
        if (fatal) {
            this.handleFatalError(type, details, data);
        }
    }

    handleFatalError(type, details, data) {
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

    handleNetworkError(details, data) {
        if (data.frag?.url && StreamAnalyzer.isBlackTsUrl(data.frag.url)) {
            this.handleNoSignal();
            return;
        }
        
        const errorDetails = StreamAnalyzer.analyzeNetworkError(details, data);
        
        if (!this.playbackStarted && this.retryManager.canRetry()) {
            this.scheduleRetry(errorDetails);
        } else if (!this.playbackStarted) {
            this.showStartupFailureError(errorDetails);
        } else {
            this.showPlaybackInterruptedError(errorDetails);
        }
    }

    scheduleRetry(errorDetails) {
        const delay = this.retryManager.getNextRetryDelay();
        console.log(`Retrying stream (${this.retryManager.getCurrentAttempt()}/${this.retryManager.getMaxRetries()}) in ${delay}ms`);
        setTimeout(() => this.retryStream(), delay);
    }

    showStartupFailureError(errorDetails) {
        const message = `Unable to start stream after ${this.retryManager.getMaxRetries()} attempts.\n\n` +
            `**Error:** ${errorDetails.description}\n` +
            `**Causes:** ${errorDetails.causes}\n` +
            `**Solutions:** ${errorDetails.solutions}`;
        this.errorHandler.showError('STREAM_FAILED_TO_START', message);
    }

    showPlaybackInterruptedError(errorDetails) {
        const actions = [
            { class: 'retry-btn', icon: '🔄', text: 'Reload Stream', onclick: 'window.app.videoPlayer.reloadStreamWithOverlay(this);' },
            { class: 'continue-btn', icon: '▶️', text: 'Keep Trying', onclick: 'window.app.videoPlayer.errorHandler.dismissOverlay()' }
        ];
        
        const message = `Stream connection lost during playback.\n\n` +
            `**Error:** ${errorDetails.description}\n` +
            `**Causes:** ${errorDetails.causes}\n` +
            `**Solutions:** ${errorDetails.solutions}`;
            
        this.errorHandler.showOverlayError('STREAM_INTERRUPTED', message, actions);
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
                this.hlsManager.recoverMediaError();
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
            this.handleExcessiveFragmentErrors();
        }
    }

    handleExcessiveFragmentErrors() {
        const uniqueUrls = [...new Set(this.fragmentErrors.map(e => e.url))];
        
        if (uniqueUrls.length === 1 && StreamAnalyzer.isBlackTsUrl(uniqueUrls[0])) {
            this.handleNoSignal();
        } else if (this.playbackStarted && this.bufferingManager.recoveryAttempts < this.bufferingManager.maxRecoveryAttempts) {
            this.bufferingManager.attemptRecovery();
            this.fragmentErrors = this.fragmentErrors.slice(-3);
        } else {
            const message = `Persistent connection issues. ${this.fragmentErrors.length} fragment errors in 30 seconds.`;
            this.errorHandler.showError('STREAM_INTERRUPTED', message, true);
        }
    }

    handleNoSignal() {
        if (this.streamEndDetected) return;
        
        console.log('No signal detected');
        this.streamEndDetected = true;
        this.hlsManager.stopLoad();
        this.networkMonitor.cleanup();
        
        this.errorHandler.showError('NO_SIGNAL', 
            'The stream is currently showing no signal. This usually means:\n\n' +
            '• The broadcast has ended or is temporarily offline\n' +
            '• Technical difficulties at the source\n' +
            '• The channel is between programs\n\n' +
            'You can try reloading to check if the signal has returned.');
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
        
        const reason = StreamAnalyzer.getAutoplayFailureReason(error);
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

    // Stream control methods
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

    // Cleanup methods
    closeVideoPanel() {
        this.forceCleanup();
        
        const mainContainer = document.getElementById('mainContainer');
        const videoPanel = document.getElementById('videoPanel');
        
        if (mainContainer) mainContainer.classList.remove('watching');
        if (videoPanel) videoPanel.style.display = 'none';
        
        if (window.app?.mobileNav) {
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

    // Backward compatibility methods
    showError(errorType, message, showRetry = false) {
        this.errorHandler.showError(errorType, message, showRetry);
    }

    hideError() {
        this.errorHandler.hideError();
    }

    showLoading(message) {
        this.showLoadingState();
    }

    closePlayer() {
        this.closeVideoPanel();
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