// Video Player Component

import { escapeHtml } from '../utils/domHelpers.js';

export class VideoPlayer {
    constructor() {
        this.hlsPlayer = null;
        this.isWatching = false;
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
        
        playerSection.classList.remove('open');
        
        if (this.hlsPlayer) {
            this.hlsPlayer.destroy();
            this.hlsPlayer = null;
        }
        
        video.src = '';
        video.load();
    }

    closeVideoPanel() {
        const mainContainer = document.getElementById('mainContainer');
        const videoPanel = document.getElementById('videoPanel');
        const videoLarge = document.getElementById('videoPlayerLarge');
        
        // Hide 3-column layout
        mainContainer.classList.remove('watching');
        videoPanel.style.display = 'none';
        
        if (this.hlsPlayer) {
            this.hlsPlayer.destroy();
            this.hlsPlayer = null;
        }
        
        videoLarge.src = '';
        videoLarge.load();

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
}

