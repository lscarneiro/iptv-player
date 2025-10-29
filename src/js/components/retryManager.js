// Retry Manager - Handles retry logic with exponential backoff
export class RetryManager {
    constructor(maxRetries = 5) {
        this.maxRetries = maxRetries;
        this.retryCount = 0;
    }

    reset() {
        this.retryCount = 0;
    }

    canRetry() {
        return this.retryCount < this.maxRetries;
    }

    getNextRetryDelay() {
        if (!this.canRetry()) return null;
        
        this.retryCount++;
        
        // Industry standard exponential backoff with jitter
        // Base delay: 1s, 2s, 4s, 8s, 16s (capped at 16s)
        const baseDelay = Math.min(1000 * Math.pow(2, this.retryCount - 1), 16000);
        
        // Add jitter (±25%) to prevent thundering herd
        const jitter = baseDelay * 0.25 * (Math.random() - 0.5);
        
        return Math.round(baseDelay + jitter);
    }

    getCurrentAttempt() {
        return this.retryCount;
    }

    getMaxRetries() {
        return this.maxRetries;
    }
}