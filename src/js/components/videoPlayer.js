// Video Player Component

import { escapeHtml } from '../utils/domHelpers.js';
import { RetryManager } from './retryManager.js';
import { BufferingManager } from './bufferingManager.js';

export class VideoPlayer {
    constructor() {
        this.hlsPlayer = null;
        this.isWatching = false;
        this.currentStreamUrl = null;
        this.currentStreamName = null;
        this.playbackStarted = false;
        this.retryManager = new RetryManager(5);
        this.bufferingCheckInterval = null;
        this.lastBufferTime = 0;
        this.bufferingEvents = [];
        this.streamEndDetected = false;
        this.fragmentErrors = [];
        this.maxFragmentErrors = 8;
        this.autoplayErrorShown = false;
        this.loadingTimeout = null;
        this.maxLoadingTime = 30000;
        this.networkCheckInterval = null;
        this.m3u8LoggingEnabled = false;
        
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

    setM3u8LoggingEnabled(enabled) {
        this.m3u8LoggingEnabled = enabled;
        console.log(`M3U8 tag logging ${enabled ? 'enabled' : 'disabled'}`);
    }

    logM3u8Tags(content, type = 'manifest') {
        if (!this.m3u8LoggingEnabled) return;
        
        const lines = content.split('\n');
        const tags = lines.filter(line => line.trim().startsWith('#'));
        
        if (tags.length > 0) {
            console.group(`🔍 M3U8 ${type.toUpperCase()} Tags (${tags.length} found)`);
            tags.forEach((tag, index) => {
                const trimmedTag = tag.trim();
                if (trimmedTag) {
                    console.log(`${index + 1}. ${trimmedTag}`);
                }
            });
            console.groupEnd();
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
        
        // Force cleanup to prevent race conditions
        this.forceCleanupCurrentStream();
        
        // Reset state for new stream
        this.currentStreamUrl = streamUrl;
        this.currentStreamName = streamName;
        this.playbackStarted = false;
        this.streamEndDetected = false;
        this.fragmentErrors = [];
        this.autoplayErrorShown = false;
        this.retryManager.reset();
        this.clearBufferingMonitor();
        this.clearLoadingTimeout();
        this.clearNetworkMonitoring();
        
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
        
        // Ensure video container is visible
        const videoContainer = document.querySelector('.video-container-large');
        if (videoContainer) {
            videoContainer.style.display = 'flex';
        }
        
        // Check for black.ts streams (no signal)
        if (streamUrl && streamUrl.includes('black.ts')) {
            this.handleNoSignal();
            return;
        }
        
        this.initializePlayer(streamUrl, videoLarge);
        this.startLoadingTimeout();
        this.startNetworkMonitoring();
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
        const hlsConfig = {
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90,
            maxLoadingDelay: 4,
            maxBufferLength: 30,
            maxMaxBufferLength: 600,
            fragLoadingTimeOut: 20000,
            manifestLoadingTimeOut: 10000,
            fragLoadingMaxRetry: 2,
            manifestLoadingMaxRetry: 1,
            // Additional settings for better compatibility
            debug: false,
            capLevelToPlayerSize: false,
            startLevel: -1,
            autoStartLoad: true,
            defaultAudioCodec: undefined,
            initialLiveManifestSize: 1,
            maxBufferSize: 60 * 1000 * 1000,
            maxBufferHole: 0.5
        };

        // Add custom loader to intercept M3U8 content if logging is enabled
        if (this.m3u8LoggingEnabled) {
            hlsConfig.loader = class extends Hls.DefaultConfig.loader {
                load(context, config, callbacks) {
                    const originalOnSuccess = callbacks.onSuccess;
                    callbacks.onSuccess = (response, stats, context) => {
                        // Log M3U8 content if it's a manifest
                        if (context.type === 'manifest' || context.url.includes('.m3u8')) {
                            const content = response.data || response;
                            if (typeof content === 'string' && content.includes('#EXTM3U')) {
                                console.group(`📄 Raw M3U8 Content from ${context.url}`);
                                console.log('Full content:');
                                console.log(content);
                                
                                // Extract and log tags directly
                                const lines = content.split('\n');
                                const tags = lines.filter(line => line.trim().startsWith('#'));
                                if (tags.length > 0) {
                                    console.log(`\n🏷️ Found ${tags.length} M3U8 tags:`);
                                    tags.forEach(tag => {
                                        const trimmedTag = tag.trim();
                                        if (trimmedTag) {
                                            console.log(trimmedTag);
                                        }
                                    });
                                }
                                console.groupEnd();
                            }
                        }
                        originalOnSuccess(response, stats, context);
                    };
                    super.load(context, config, callbacks);
                }
            };
        }

        this.hlsPlayer = new Hls(hlsConfig);
        
        this.hlsPlayer.loadSource(streamUrl);
        this.hlsPlayer.attachMedia(videoElement);
        
        // Ensure video element is properly configured
        videoElement.muted = false;
        videoElement.controls = true;
        videoElement.preload = 'metadata';
        
        console.log('HLS player attached to video element:', videoElement.id);
        console.log('Video element visibility:', {
            display: getComputedStyle(videoElement).display,
            visibility: getComputedStyle(videoElement).visibility,
            opacity: getComputedStyle(videoElement).opacity,
            width: videoElement.offsetWidth,
            height: videoElement.offsetHeight
        });
        
        // Set up event listeners
        this.setupHlsEventListeners(videoElement);
        this.setupVideoEventListeners(videoElement);
    }

    setupNativePlayer(streamUrl, videoElement) {
        videoElement.src = streamUrl;
        this.setupVideoEventListeners(videoElement);
        
        this.attemptAutoplay(videoElement, 'Native player loaded');
    }

    setupHlsEventListeners(videoElement) {
        this.hlsPlayer.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
            console.log('HLS manifest parsed successfully');
            console.log('Available levels:', data.levels?.map(l => `${l.width}x${l.height}@${l.bitrate}`));
            this.attemptAutoplay(videoElement, 'HLS manifest loaded');
        });

        // Log main manifest content
        this.hlsPlayer.on(Hls.Events.MANIFEST_LOADED, (event, data) => {
            if (this.m3u8LoggingEnabled && data.details && data.details.url) {
                console.log('📄 Main M3U8 manifest loaded from:', data.details.url);
                if (data.details.totalduration) {
                    console.log('📊 Total duration:', data.details.totalduration);
                }
            }
        });

        // Log level playlist content (variant streams)
        this.hlsPlayer.on(Hls.Events.LEVEL_LOADED, (event, data) => {
            if (this.m3u8LoggingEnabled && data.details) {
                console.group('📺 Level playlist loaded');
                console.log('Level:', data.level);
                console.log('URL:', data.details.url);
                console.log('Type:', data.details.type);
                console.log('Live:', data.details.live);
                if (data.details.fragments && data.details.fragments.length > 0) {
                    console.log('Fragments:', data.details.fragments.length);
                    console.log('Target duration:', data.details.targetduration);
                    
                    // Log any special fragments (like ad markers)
                    const specialFragments = data.details.fragments.filter(frag => 
                        frag.tagList && frag.tagList.length > 0
                    );
                    if (specialFragments.length > 0) {
                        console.log(`Fragments with tags: ${specialFragments.length}`);
                        specialFragments.forEach((frag, index) => {
                            console.log(`Fragment ${index + 1} tags:`);
                            frag.tagList.forEach(tag => {
                                console.log(`  ${tag}`);
                            });
                        });
                    }
                }
                console.groupEnd();
            }
        });

        // Log audio track changes (could indicate ad-breaks)
        this.hlsPlayer.on(Hls.Events.AUDIO_TRACK_SWITCHED, (event, data) => {
            if (this.m3u8LoggingEnabled) {
                console.log('🔊 Audio track switched:', data);
            }
        });

        // Log subtitle track changes
        this.hlsPlayer.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (event, data) => {
            if (this.m3u8LoggingEnabled) {
                console.log('📝 Subtitle track switched:', data);
            }
        });

        // Log level switches (quality changes that might happen during ads)
        this.hlsPlayer.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
            if (this.m3u8LoggingEnabled) {
                console.log('📊 Quality level switched to:', data.level);
            }
        });
        
        this.hlsPlayer.on(Hls.Events.FRAG_LOADED, (event, data) => {
            if (!this.playbackStarted) {
                this.playbackStarted = true;
                this.retryManager.reset(); // Reset retry count on successful start
                console.log('First fragment loaded - playback started');
                this.clearLoadingTimeout();
                this.clearNetworkMonitoring();
                this.dismissAutoplayError();
                this.startBufferingMonitor(videoElement);
            }

            // Log fragment details for debugging ad-breaks
            if (this.m3u8LoggingEnabled && data.frag) {
                const frag = data.frag;
                
                // Log all fragments with any special properties
                const hasSpecialProps = frag.tagList?.length > 0 || 
                                       frag.programDateTime || 
                                       frag.discontinuity ||
                                       frag.gap ||
                                       frag.byteRange;
                
                if (hasSpecialProps) {
                    console.group(`🎬 Fragment ${frag.sn} loaded with special properties`);
                    console.log('URL:', frag.url);
                    console.log('Duration:', frag.duration);
                    
                    if (frag.tagList?.length > 0) {
                        console.log('📋 Tags:');
                        frag.tagList.forEach(tag => {
                            console.log(`  ${tag}`);
                        });
                    }
                    if (frag.programDateTime) {
                        console.log('🕐 Program Date Time:', frag.programDateTime);
                    }
                    if (frag.discontinuity) {
                        console.log('⚠️ Discontinuity detected (possible ad-break)');
                    }
                    if (frag.gap) {
                        console.log('🕳️ Gap fragment detected');
                    }
                    if (frag.byteRange) {
                        console.log('📏 Byte range:', frag.byteRange);
                    }
                    
                    console.groupEnd();
                }
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
        
        videoElement.addEventListener('loadedmetadata', () => {
            console.log('Video metadata loaded - dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight);
        });
        
        videoElement.addEventListener('loadeddata', () => {
            console.log('Video data loaded');
        });
        
        videoElement.addEventListener('canplay', () => {
            if (!this.playbackStarted) {
                this.playbackStarted = true;
                this.retryManager.reset();
                console.log('Video can play - playback starting');
                this.clearLoadingTimeout();
                this.clearNetworkMonitoring();
                this.dismissAutoplayError();
                this.startBufferingMonitor(videoElement);
            }
        });
        
        videoElement.addEventListener('playing', () => {
            console.log('Video is now playing');
            console.log('Video tracks:', videoElement.videoTracks?.length || 'N/A');
            console.log('Audio tracks:', videoElement.audioTracks?.length || 'N/A');
            console.log('Video dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight);
            
            if (!this.playbackStarted) {
                this.playbackStarted = true;
                this.retryManager.reset();
                this.clearLoadingTimeout();
                this.clearNetworkMonitoring();
                this.startBufferingMonitor(videoElement);
            }
            this.dismissAutoplayError();
        });
        
        videoElement.addEventListener('play', () => {
            console.log('Video play event fired');
            this.dismissAutoplayError();
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
        const { type, details, fatal, frag } = data;
        
        // Check if this is a black.ts fragment error (no signal)
        if (frag && frag.url && frag.url.includes('black.ts')) {
            console.log('Detected black.ts fragment - no signal');
            this.handleNoSignal();
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
        // Check if this is a CORS error with black.ts (no signal)
        if (data.frag && data.frag.url && data.frag.url.includes('black.ts')) {
            console.log('CORS error with black.ts fragment - no signal');
            this.handleNoSignal();
            return;
        }
        
        if (!this.playbackStarted) {
            // Stream failed to start
            if (this.retryManager.canRetry()) {
                const delay = this.retryManager.getNextRetryDelay();
                console.log(`Retrying stream load (attempt ${this.retryManager.getCurrentAttempt()}/${this.retryManager.getMaxRetries()}) in ${delay}ms`);
                setTimeout(() => {
                    this.retryStream();
                }, delay);
            } else {
                this.handleError('STREAM_FAILED_TO_START', 
                    `Unable to start stream after ${this.retryManager.getMaxRetries()} attempts.\n\n**Error:** ${details}\n\n**Possible causes:**\n• Network connectivity issues\n• Server problems\n• Stream is offline\n• CORS or SSL issues`);
            }
        } else {
            // Stream was playing but encountered network error
            this.handleError('STREAM_INTERRUPTED', 
                `Stream connection lost during playback.\n\n**Error:** ${details}\n\n**Possible causes:**\n• Network interruption\n• Server issues\n• Stream ended unexpectedly`,
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
        if (this.streamEndDetected) {
            return; // Already handled
        }
        
        console.log('Stream ended - stopping player and showing dialog');
        this.streamEndDetected = true;
        
        // Stop the HLS player to prevent further fragment loading attempts
        if (this.hlsPlayer) {
            this.hlsPlayer.stopLoad();
        }
        
        // Stop buffering monitoring
        this.clearBufferingMonitor();
        
        // Show the stream ended dialog
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
            console.warn('Too many fragment errors detected, likely stream ended or network issues');
            
            // Check if errors are all the same URL (likely stream ended)
            const uniqueUrls = [...new Set(this.fragmentErrors.map(e => e.url))];
            if (uniqueUrls.length === 1 && uniqueUrls[0].includes('black.ts')) {
                this.handleStreamEnded();
            } else if (this.playbackStarted) {
                // Multiple different fragment errors - likely network/stream issues
                this.handleError('STREAM_INTERRUPTED', 
                    'Stream is experiencing connection issues. Multiple fragments failed to load.',
                    true);
            } else {
                // Stream never started and having fragment issues
                this.handleError('STREAM_FAILED_TO_START',
                    'Unable to start the stream. Multiple fragments failed to load.');
            }
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
        this.retryManager.reset();
        this.streamEndDetected = false;
        this.fragmentErrors = [];
        
        // Hide error and 3-column layout
        this.hideError();
        mainContainer.classList.remove('watching');
        videoPanel.style.display = 'none';
        
        // Notify mobile navigation
        if (window.app && window.app.mobileNav) {
            window.app.mobileNav.onVideoClosed();
        }
        
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
                                ❌ Close Stream
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
            case 'NO_SIGNAL':
                return 'No Signal';
            case 'LOADING_TIMEOUT':
                return 'Loading Timeout';
            case 'NO_INTERNET':
                return 'No Internet Connection';
            case 'PLAYBACK_FAILED':
                return 'Playback Failed';
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
                                ❌ Close Stream
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
            // Reset error tracking when manually reloading
            this.bufferingEvents = [];
            this.fragmentErrors = [];
            this.retryManager.reset();
            this.streamEndDetected = false;
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

    // Force cleanup to prevent race conditions
    forceCleanupCurrentStream() {
        console.log('Force cleaning up current stream state');
        this.cleanup();
        
        // Reset video element more carefully to prevent issues
        const videoLarge = document.getElementById('videoPlayerLarge');
        if (videoLarge) {
            videoLarge.pause();
            videoLarge.currentTime = 0;
            videoLarge.removeAttribute('src');
            videoLarge.load();
            
            // Remove event listeners without cloning (which can break video display)
            // Instead, just ensure we have a clean state
            videoLarge.muted = false;
            videoLarge.controls = true;
            videoLarge.preload = 'metadata';
            
            // Clear any inline styles that might interfere
            videoLarge.style.display = '';
            videoLarge.style.visibility = '';
        }
    }

    // Loading timeout management
    startLoadingTimeout() {
        this.clearLoadingTimeout();
        this.loadingTimeout = setTimeout(() => {
            const message = navigator.onLine === false ? 
                'No internet connection detected. Please check your network connection.' :
                'Stream is taking too long to load. This could be due to network issues or server problems.';
            this.showError('LOADING_TIMEOUT', message, true);
        }, this.maxLoadingTime);
    }

    clearLoadingTimeout() {
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
            this.loadingTimeout = null;
        }
    }

    // Network monitoring
    startNetworkMonitoring() {
        this.clearNetworkMonitoring();
        this.networkCheckInterval = setInterval(() => {
            if (typeof navigator.onLine !== 'undefined' && !navigator.onLine) {
                this.showError('NO_INTERNET', 'Your device appears to be offline. Please check your internet connection.');
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

    // Handle no signal (black.ts streams)
    handleNoSignal() {
        if (this.streamEndDetected) return;
        
        console.log('No signal detected');
        this.streamEndDetected = true;
        
        if (this.hlsPlayer) {
            this.hlsPlayer.stopLoad();
        }
        
        this.clearLoadingTimeout();
        this.clearNetworkMonitoring();
        
        this.showError('NO_SIGNAL', 
            'The stream is currently showing no signal. This usually means:\n\n' +
            '• The broadcast has ended or is temporarily offline\n' +
            '• Technical difficulties at the source\n' +
            '• The channel is between programs\n\n' +
            'You can try reloading to check if the signal has returned.');
    }


    // Improved autoplay handling
    attemptAutoplay(videoElement, context) {
        videoElement.play().then(() => {
            console.log('Autoplay successful');
        }).catch(e => {
            this.handleAutoplayFailure(videoElement, e, context);
        });
    }

    handleAutoplayFailure(videoElement, error, context) {
        if (this.playbackStarted || this.autoplayErrorShown) return;
        
        this.autoplayErrorShown = true;
        
        let reason = 'Unknown autoplay failure reason';
        if (error.name === 'NotAllowedError') {
            reason = 'Browser autoplay policy prevents automatic playback';
        } else if (error.name === 'AbortError') {
            reason = 'Playback was interrupted (possibly by another stream starting)';
        } else if (error.name === 'NotSupportedError') {
            reason = 'Video format or codec not supported';
        } else if (error.message.includes('user activation')) {
            reason = 'User interaction required by browser policy';
        }
        
        const message = `**Reason:** ${reason}\n\n**Solution:** Your browser requires user interaction to start video playback. Click the play button below.`;
        
        this.showAutoplayBlockedDialog(message, context);
        
        // Auto-dismiss if playback starts
        setTimeout(() => {
            if (this.playbackStarted && this.autoplayErrorShown) {
                this.dismissAutoplayError();
            }
        }, 10000);
    }

    showAutoplayBlockedDialog(message, context) {
        const errorDiv = document.getElementById('videoPanelError');
        if (!errorDiv) return;
        
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

    manualPlay() {
        const videoElement = document.getElementById('videoPlayerLarge');
        if (!videoElement) return;
        
        this.hideError();
        
        videoElement.play().then(() => {
            if (!this.playbackStarted) {
                this.onPlaybackStarted(videoElement);
            }
        }).catch(e => {
            this.showError('PLAYBACK_FAILED', 
                `Unable to start playback: ${e.message}. This may be a stream or browser compatibility issue.`, true);
        });
    }

    dismissAutoplayError() {
        if (this.autoplayErrorShown) {
            this.autoplayErrorShown = false;
            this.hideError();
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
        this.retryManager.reset();
        this.streamEndDetected = false;
        this.fragmentErrors = [];
        this.isWatching = false;
    }
}

