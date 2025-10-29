// Error Handler Module - Manages all error states and UI
export class ErrorHandler {
    constructor(videoPlayer) {
        this.videoPlayer = videoPlayer;
    }

    showError(errorType, message, showRetry = false) {
        const errorDiv = document.getElementById('videoPanelError');
        const videoContainer = document.querySelector('.video-container-large');
        
        if (!errorDiv) return;

        const errorClass = this.getErrorCssClass(errorType);
        const errorIcon = this.getErrorIcon(errorType);
        
        const errorHtml = `
            <div class="error-container ${errorClass}">
                <div class="error-icon">${errorIcon}</div>
                <div class="error-content">
                    <h3 class="error-title">${this.getErrorTitle(errorType)}</h3>
                    <p class="error-message">${message.replace(/\n/g, '<br>')}</p>
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

    showOverlayError(errorType, message, actions = []) {
        const existingOverlay = document.querySelector('.buffering-overlay');
        if (existingOverlay) return;
        
        const errorClass = this.getErrorCssClass(errorType);
        const errorIcon = this.getErrorIcon(errorType);
        
        const actionButtons = actions.map(action => 
            `<button class="error-btn ${action.class}" onclick="${action.onclick}">
                ${action.icon} ${action.text}
            </button>`
        ).join('');
        
        const dialogHtml = `
            <div class="error-container ${errorClass}">
                <div class="error-icon">${errorIcon}</div>
                <div class="error-content">
                    <h3 class="error-title">${this.getErrorTitle(errorType)}</h3>
                    <p class="error-message">${message.replace(/\n/g, '<br>')}</p>
                    <div class="error-actions">${actionButtons}</div>
                </div>
            </div>
        `;
        
        const overlay = document.createElement('div');
        overlay.className = 'buffering-overlay';
        overlay.innerHTML = dialogHtml;
        overlay.style.cssText = `
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.75); display: flex;
            align-items: center; justify-content: center; z-index: 1000;
            backdrop-filter: blur(2px);
        `;
        
        const videoContainer = document.querySelector('.video-container-large');
        if (videoContainer) {
            videoContainer.style.position = 'relative';
            videoContainer.appendChild(overlay);
        }
    }

    showNotification(message, icon = '🔄', duration = 4000) {
        const videoContainer = document.querySelector('.video-container-large');
        if (!videoContainer || document.querySelector('.buffering-notification')) return;
        
        const notification = document.createElement('div');
        notification.className = 'buffering-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${icon}</span>
                <span class="notification-text">${message}</span>
            </div>
        `;
        notification.style.cssText = `
            position: absolute; top: 20px; right: 20px;
            background: rgba(33, 150, 243, 0.9); color: white;
            padding: 12px 16px; border-radius: 8px; font-size: 0.9rem;
            z-index: 999; backdrop-filter: blur(4px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: slideInRight 0.3s ease-out;
        `;
        
        videoContainer.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOutRight 0.3s ease-in';
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);
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

    dismissOverlay() {
        const overlay = document.querySelector('.buffering-overlay');
        if (overlay) overlay.remove();
    }

    getErrorTitle(errorType) {
        const titles = {
            'STREAM_FAILED_TO_START': 'Stream Failed to Start',
            'STREAM_INTERRUPTED': 'Stream Connection Lost',
            'NO_SIGNAL': 'No Signal',
            'MEDIA_ERROR': 'Media Format Error',
            'AUTOPLAY_FAILED': 'Autoplay Blocked',
            'UNSUPPORTED': 'Unsupported Format',
            'BUFFERING_ISSUES': 'Frequent Buffering Detected',
            'NO_INTERNET': 'No Internet Connection',
            'LOADING_TIMEOUT': 'Loading Timeout',
            'NETWORK_TIMEOUT': 'Network Timeout',
            'SSL_ERROR': 'SSL/HTTPS Error',
            'CORS_ERROR': 'Cross-Origin Error',
            'HTTP_ERROR': 'Server Error',
            'NETWORK_ERROR': 'Network Error'
        };
        return titles[errorType] || 'Playback Error';
    }

    getErrorCssClass(errorType) {
        const classes = {
            'NO_SIGNAL': 'no-signal',
            'BUFFERING_ISSUES': 'buffering-issues',
            'NO_INTERNET': 'no-internet',
            'AUTOPLAY_FAILED': 'autoplay-blocked'
        };
        return classes[errorType] || 'network-error';
    }

    getErrorIcon(errorType) {
        const icons = {
            'NO_SIGNAL': '📵',
            'BUFFERING_ISSUES': '⏳',
            'NO_INTERNET': '📶',
            'NETWORK_TIMEOUT': '⏰',
            'LOADING_TIMEOUT': '⏰',
            'SSL_ERROR': '🔒',
            'CORS_ERROR': '🚫',
            'HTTP_ERROR': '🌐',
            'NETWORK_ERROR': '📡',
            'AUTOPLAY_FAILED': '▶️',
            'UNSUPPORTED': '❌',
            'MEDIA_ERROR': '🎬'
        };
        return icons[errorType] || '⚠️';
    }
}