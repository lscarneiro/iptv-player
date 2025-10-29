// API Service - handles all API communication

export class ApiService {
    constructor(credentials) {
        this.credentials = credentials;
    }

    setCredentials(credentials) {
        this.credentials = credentials;
    }

    buildApiUrl(action = '', params = {}) {
        if (!this.credentials) throw new Error('No credentials available');
        
        const url = new URL(`${this.credentials.serverUrl}/player_api.php`);
        url.searchParams.set('username', this.credentials.username);
        url.searchParams.set('password', this.credentials.password);
        
        if (action) {
            url.searchParams.set('action', action);
        }
        
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });
        
        return url.toString();
    }

    async fetchApi(url, signal = null) {
        try {
            const options = {};
            if (signal) {
                options.signal = signal;
            }
            
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Request was cancelled');
                throw new Error('Request cancelled');
            }
            console.error('API fetch error:', error);
            throw error;
        }
    }

    async getUserInfo(signal = null) {
        const url = this.buildApiUrl();
        return await this.fetchApi(url, signal);
    }

    async getLiveCategories(signal = null) {
        const url = this.buildApiUrl('get_live_categories');
        return await this.fetchApi(url, signal);
    }

    async getLiveStreams(categoryId = null, signal = null) {
        const params = categoryId ? { category_id: categoryId } : {};
        const url = this.buildApiUrl('get_live_streams', params);
        return await this.fetchApi(url, signal);
    }

    async getStreamPlaylist(streamId, signal = null) {
        // Try different endpoints that might return the stream URL
        const endpoints = [
            { action: 'get_simple_data_table', params: { stream_id: streamId } },
            { action: 'get_stream_url', params: { stream_id: streamId } },
            { action: 'get_stream_info', params: { stream_id: streamId } }
        ];
        
        for (const endpoint of endpoints) {
            try {
                const url = this.buildApiUrl(endpoint.action, endpoint.params);
                const result = await this.fetchApi(url, signal);
                console.log(`Tried ${endpoint.action}:`, result);
                
                // Check if this looks like a stream URL response
                if (typeof result === 'string' && (result.includes('http') || result.includes('m3u8'))) {
                    return result;
                } else if (result && typeof result === 'object') {
                    // Look for common stream URL properties
                    const streamUrl = result.url || result.stream_url || result.link || result.playlist_url || result.m3u8_url;
                    if (streamUrl && typeof streamUrl === 'string') {
                        return streamUrl;
                    }
                }
            } catch (error) {
                if (error.message === 'Request cancelled') {
                    throw error;
                }
                console.log(`Endpoint ${endpoint.action} failed:`, error.message);
                continue;
            }
        }
        
        // If no endpoint worked, try constructing the stream URL manually
        const manualUrl = `${this.credentials.serverUrl}/live/${this.credentials.username}/${this.credentials.password}/${streamId}.m3u8`;
        console.log('Trying manual URL construction:', manualUrl);
        return manualUrl;
    }
}

