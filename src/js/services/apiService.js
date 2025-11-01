// API Service - handles all API communication

import { logger } from '../utils/logger.js';

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
            logger.error('API fetch error:', error);
            throw error;
        }
    }

    async fetchXml(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.text();
        } catch (error) {
            logger.error('XML fetch error:', error);
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
                logger.log(`Tried ${endpoint.action}:`, result);
                
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
                logger.log(`Endpoint ${endpoint.action} failed:`, error.message);
                continue;
            }
        }
        
        // If no endpoint worked, try constructing the stream URL manually
        const manualUrl = `${this.credentials.serverUrl}/live/${this.credentials.username}/${this.credentials.password}/${streamId}.m3u8`;
        logger.log('Trying manual URL construction:', manualUrl);
        return manualUrl;
    }

    async getEPGXml() {
        if (!this.credentials) throw new Error('No credentials available');
        
        const url = new URL(`${this.credentials.serverUrl}/xmltv.php`);
        url.searchParams.set('username', this.credentials.username);
        url.searchParams.set('password', this.credentials.password);
        
        return await this.fetchXml(url.toString());
    }

    async getStreamEPG(streamId) {
        try {
            const url = this.buildApiUrl('get_simple_data_table', { stream_id: streamId });
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Check if we have valid EPG data
            if (!data || !data.epg_listings || data.epg_listings.length === 0) {
                return null;
            }
            
            return data;
        } catch (error) {
            logger.error('Stream EPG fetch error:', error);
            return null; // Return null instead of throwing to gracefully handle missing EPG
        }
    }
}

