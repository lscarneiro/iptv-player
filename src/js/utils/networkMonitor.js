// Network Monitor - Handles network connectivity monitoring
export class NetworkMonitor {
    constructor() {
        this.networkCheckInterval = null;
        this.loadingTimeout = null;
        this.maxLoadingTime = 30000; // 30 seconds
    }

    startLoadingTimeout(onTimeout) {
        this.clearLoadingTimeout();
        
        this.loadingTimeout = setTimeout(() => {
            const message = navigator.onLine === false ? 
                'No internet connection detected. Please check your network connection.' :
                'Stream is taking too long to load. This could be due to network issues or server problems.';
            onTimeout(message);
        }, this.maxLoadingTime);
    }

    clearLoadingTimeout() {
        if (this.loadingTimeout) {
            clearTimeout(this.loadingTimeout);
            this.loadingTimeout = null;
        }
    }

    startNetworkMonitoring(onNetworkIssue) {
        this.clearNetworkMonitoring();
        
        this.networkCheckInterval = setInterval(() => {
            if (typeof navigator.onLine !== 'undefined' && !navigator.onLine) {
                onNetworkIssue('Your device appears to be offline. Please check your internet connection.');
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

    async checkConnectivity(testUrl) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(testUrl, {
                method: 'HEAD',
                signal: controller.signal,
                cache: 'no-cache'
            });
            
            clearTimeout(timeoutId);
            return { success: response.ok, status: response.status };
            
        } catch (error) {
            return { 
                success: false, 
                error: error.name,
                message: error.message 
            };
        }
    }

    isOnline() {
        return typeof navigator.onLine !== 'undefined' ? navigator.onLine : true;
    }

    cleanup() {
        this.clearLoadingTimeout();
        this.clearNetworkMonitoring();
    }
}