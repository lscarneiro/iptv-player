// Video Event Manager - Handles video element events and state
export class VideoEventManager {
    constructor(videoPlayer) {
        this.videoPlayer = videoPlayer;
        this.eventListeners = new Map();
    }

    setupVideoElementEvents(videoElement) {
        const events = {
            'loadstart': () => {
                console.log('Video load started');
            },
            'canplay': () => {
                if (!this.videoPlayer.playbackStarted) {
                    console.log('Video can play - playback starting');
                    this.videoPlayer.onPlaybackStarted(videoElement);
                }
            },
            'playing': () => {
                console.log('Video is now playing');
                if (!this.videoPlayer.playbackStarted) {
                    this.videoPlayer.onPlaybackStarted(videoElement);
                }
                this.videoPlayer.dismissAutoplayError();
            },
            'play': () => {
                console.log('Video play event fired');
                this.videoPlayer.dismissAutoplayError();
            },
            'error': (e) => {
                console.error('Video element error:', e);
                this.videoPlayer.handleVideoError(e);
            },
            'stalled': () => {
                console.warn('Video playback stalled');
                this.videoPlayer.bufferingManager.recordEvent('stalled');
            },
            'waiting': () => {
                console.warn('Video waiting for data');
                this.videoPlayer.bufferingManager.recordEvent('waiting');
            }
        };

        // Remove existing listeners
        this.removeAllListeners(videoElement);

        // Add new listeners and track them
        Object.entries(events).forEach(([event, handler]) => {
            videoElement.addEventListener(event, handler);
            
            if (!this.eventListeners.has(videoElement)) {
                this.eventListeners.set(videoElement, new Map());
            }
            this.eventListeners.get(videoElement).set(event, handler);
        });
    }

    removeAllListeners(videoElement) {
        if (this.eventListeners.has(videoElement)) {
            const elementListeners = this.eventListeners.get(videoElement);
            elementListeners.forEach((handler, event) => {
                videoElement.removeEventListener(event, handler);
            });
            this.eventListeners.delete(videoElement);
        }
    }

    cleanup() {
        this.eventListeners.forEach((elementListeners, videoElement) => {
            this.removeAllListeners(videoElement);
        });
        this.eventListeners.clear();
    }
}