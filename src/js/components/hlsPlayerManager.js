// HLS Player Manager - Handles HLS.js specific functionality
export class HlsPlayerManager {
    constructor(videoPlayer) {
        this.videoPlayer = videoPlayer;
        this.hlsPlayer = null;
    }

    createPlayer(config = {}) {
        const defaultConfig = {
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90,
            maxLoadingDelay: 4,
            maxBufferLength: 30,
            fragLoadingTimeOut: 20000,
            manifestLoadingTimeOut: 10000,
            fragLoadingMaxRetry: 2,
            manifestLoadingMaxRetry: 1
        };

        this.hlsPlayer = new Hls({ ...defaultConfig, ...config });
        return this.hlsPlayer;
    }

    loadSource(streamUrl, videoElement) {
        if (!this.hlsPlayer) {
            throw new Error('HLS player not initialized');
        }

        this.hlsPlayer.loadSource(streamUrl);
        this.hlsPlayer.attachMedia(videoElement);
    }

    setupEventListeners(videoElement, callbacks = {}) {
        if (!this.hlsPlayer) return;

        const {
            onManifestParsed = () => {},
            onManifestLoaded = () => {},
            onLevelLoaded = () => {},
            onFragLoaded = () => {},
            onError = () => {}
        } = callbacks;

        this.hlsPlayer.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
        this.hlsPlayer.on(Hls.Events.MANIFEST_LOADED, onManifestLoaded);
        this.hlsPlayer.on(Hls.Events.LEVEL_LOADED, onLevelLoaded);
        this.hlsPlayer.on(Hls.Events.FRAG_LOADED, onFragLoaded);
        this.hlsPlayer.on(Hls.Events.ERROR, onError);
    }

    destroy() {
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
    }

    stopLoad() {
        if (this.hlsPlayer) {
            this.hlsPlayer.stopLoad();
        }
    }

    recoverMediaError() {
        if (this.hlsPlayer) {
            this.hlsPlayer.recoverMediaError();
        }
    }

    startLoad(startPosition = -1) {
        if (this.hlsPlayer) {
            this.hlsPlayer.startLoad(startPosition);
        }
    }

    isSupported() {
        return window.Hls && Hls.isSupported();
    }

    getPlayer() {
        return this.hlsPlayer;
    }
}