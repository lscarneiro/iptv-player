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

    async fetchApi(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API fetch error:', error);
            throw error;
        }
    }

    async getUserInfo() {
        const url = this.buildApiUrl();
        return await this.fetchApi(url);
    }

    async getLiveCategories() {
        const url = this.buildApiUrl('get_live_categories');
        return await this.fetchApi(url);
    }

    async getLiveStreams(categoryId = null) {
        const params = categoryId ? { category_id: categoryId } : {};
        const url = this.buildApiUrl('get_live_streams', params);
        return await this.fetchApi(url);
    }

    async getStreamPlaylist(streamId) {
        // Try different endpoints that might return the stream URL
        const endpoints = [
            { action: 'get_simple_data_table', params: { stream_id: streamId } },
            { action: 'get_stream_url', params: { stream_id: streamId } },
            { action: 'get_stream_info', params: { stream_id: streamId } }
        ];
        
        for (const endpoint of endpoints) {
            try {
                const url = this.buildApiUrl(endpoint.action, endpoint.params);
                const result = await this.fetchApi(url);
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

