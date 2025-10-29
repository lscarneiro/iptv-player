// Buffering Manager - Handles buffering detection and recovery
export class BufferingManager {
    constructor(videoPlayer, errorHandler) {
        this.videoPlayer = videoPlayer;
        this.errorHandler = errorHandler;
        this.bufferingEvents = [];
        this.bufferingCheckInterval = null;
        this.lastBufferTime = 0;
        this.recoveryAttempts = 0;
        this.maxRecoveryAttempts = 3;
    }

    startMonitoring(videoElement) {
        this.clearMonitoring();
        
        this.bufferingCheckInterval = setInterval(() => {
            if (!videoElement.paused && !videoElement.ended) {
                const currentTime = videoElement.currentTime;
                
                if (currentTime === this.lastBufferTime) {
                    this.recordEvent('no_progress');
                } else {
                    this.lastBufferTime = currentTime;
                }
                
                this.checkHealth();
            }
        }, 5000);
    }

    clearMonitoring() {
        if (this.bufferingCheckInterval) {
            clearInterval(this.bufferingCheckInterval);
            this.bufferingCheckInterval = null;
        }
        this.bufferingEvents = [];
        this.lastBufferTime = 0;
    }

    recordEvent(type) {
        const now = Date.now();
        this.bufferingEvents.push({ type, timestamp: now });
        
        // Keep only events from last 2 minutes
        this.bufferingEvents = this.bufferingEvents.filter(
            event => now - event.timestamp < 120000
        );
    }

    checkHealth() {
        const recentEvents = this.bufferingEvents.filter(
            event => Date.now() - event.timestamp < 60000 // Last minute
        );
        
        // Progressive response to buffering issues
        if (recentEvents.length >= 3 && this.recoveryAttempts === 0) {
            console.warn(`Initial buffering issues detected (${recentEvents.length} events), attempting automatic recovery`);
            this.attemptRecovery();
        } else if (recentEvents.length >= 5 && this.recoveryAttempts === 1) {
            console.warn(`Persistent buffering issues (${recentEvents.length} events), trying background stream reload`);
            this.errorHandler.showNotification('Improving stream quality...');
            this.videoPlayer.reloadStreamInBackground();
        } else if (recentEvents.length >= 8) {
            console.warn('Severe buffering detected after recovery attempts, showing user options');
            this.showBufferingDialog();
        }
    }

    attemptRecovery(videoElement = null) {
        if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
            console.log('Max buffering recovery attempts reached');
            return;
        }

        this.recoveryAttempts++;
        console.log(`Attempting buffering recovery (attempt ${this.recoveryAttempts}/${this.maxRecoveryAttempts})`);

        const video = videoElement || document.getElementById('videoPlayerLarge');
        
        if (this.videoPlayer.hlsPlayer && video) {
            try {
                const currentTime = video.currentTime;
                
                // Try HLS recovery methods
                this.videoPlayer.hlsPlayer.recoverMediaError();
                
                setTimeout(() => {
                    if (video.paused || video.readyState < 3) {
                        this.videoPlayer.hlsPlayer.startLoad(Math.max(0, currentTime - 5));
                    }
                }, 1000);
                
                setTimeout(() => {
                    if (video.paused || video.readyState < 3) {
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

    showBufferingDialog() {
        const actions = [
            {
                class: 'retry-btn',
                icon: '🔄',
                text: 'Reload Stream',
                onclick: 'window.app.videoPlayer.reloadStreamWithOverlay(this);'
            },
            {
                class: 'continue-btn',
                icon: '▶️',
                text: 'Continue Watching',
                onclick: 'window.app.videoPlayer.errorHandler.dismissOverlay()'
            }
        ];

        this.errorHandler.showOverlayError(
            'BUFFERING_ISSUES',
            'The stream is experiencing frequent buffering. This might be due to network issues or server problems. The video will continue playing while we try to improve the connection.',
            actions
        );
    }

    reset() {
        this.recoveryAttempts = 0;
        this.bufferingEvents = [];
    }
}