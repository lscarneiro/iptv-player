// Track Detection Service
// Provides unified track detection with priority: API > HTML5 > MKV parsing

import { MkvMetadataExtractor } from '../utils/mkvMetadataExtractor.js';
import { logger } from '../utils/logger.js';

export class TrackDetectionService {
    /**
     * Detect tracks from multiple sources with priority
     * @param {Object} options
     * @param {Object} options.apiData - Track data from API (vodInfo.info.audio or episode.info.audio)
     * @param {HTMLVideoElement} options.videoElement - Video element for HTML5 API
     * @param {string} options.videoUrl - Video URL for MKV parsing fallback
     * @returns {Promise<{audioTracks: Array, subtitleTracks: Array, source: string}>}
     */
    static async detectTracks({ apiData = null, videoElement = null, videoUrl = null }) {
        // Priority 1: API metadata
        if (apiData) {
            const apiTracks = this.extractTracksFromApi(apiData);
            if (apiTracks.audioTracks.length > 0 || apiTracks.subtitleTracks.length > 0) {
                logger.log('Tracks detected from API:', apiTracks);
                return { ...apiTracks, source: 'api' };
            }
        }

        // Priority 2: HTML5 audioTracks/textTracks API
        if (videoElement) {
            const html5Tracks = await this.extractTracksFromHtml5(videoElement);
            if (html5Tracks.audioTracks.length > 0 || html5Tracks.subtitleTracks.length > 0) {
                logger.log('Tracks detected from HTML5 API:', html5Tracks);
                return { ...html5Tracks, source: 'html5' };
            }
        }

        // Priority 3: MKV header parsing (only for .mkv files)
        if (videoUrl && videoUrl.toLowerCase().includes('.mkv')) {
            const mkvTracks = await MkvMetadataExtractor.extractTracks(videoUrl);
            if (mkvTracks.audioTracks.length > 0 || mkvTracks.subtitleTracks.length > 0) {
                logger.log('Tracks detected from MKV parsing:', mkvTracks);
                return { ...mkvTracks, source: 'mkv' };
            }
        }

        logger.log('No tracks detected from any source');
        return { audioTracks: [], subtitleTracks: [], source: 'none' };
    }

    /**
     * Extract tracks from API data
     * @param {Object} apiData - API response data
     * @returns {{audioTracks: Array, subtitleTracks: Array}}
     */
    static extractTracksFromApi(apiData) {
        const audioTracks = [];
        const subtitleTracks = [];

        // Handle VOD API format: info.audio is an array of strings
        if (apiData.audio && Array.isArray(apiData.audio)) {
            apiData.audio.forEach((track, index) => {
                audioTracks.push({
                    index: index,
                    label: track,
                    language: this.guessLanguage(track),
                    codec: null,
                    name: track
                });
            });
        }

        // Handle Series API format: episode.info.audio might be an object
        if (apiData.audio && typeof apiData.audio === 'object' && !Array.isArray(apiData.audio)) {
            Object.entries(apiData.audio).forEach(([key, value], index) => {
                audioTracks.push({
                    index: index,
                    label: value || key,
                    language: this.guessLanguage(value || key),
                    codec: null,
                    name: value || key
                });
            });
        }

        // Subtitles are typically not in API responses, but check anyway
        if (apiData.subtitles && Array.isArray(apiData.subtitles)) {
            apiData.subtitles.forEach((track, index) => {
                subtitleTracks.push({
                    index: index,
                    label: track,
                    language: this.guessLanguage(track),
                    codec: null,
                    name: track
                });
            });
        }

        return { audioTracks, subtitleTracks };
    }

    /**
     * Extract tracks from HTML5 video element APIs
     * @param {HTMLVideoElement} videoElement
     * @returns {Promise<{audioTracks: Array, subtitleTracks: Array}>}
     */
    static async extractTracksFromHtml5(videoElement) {
        const audioTracks = [];
        const subtitleTracks = [];

        // Audio tracks (if supported)
        if (videoElement.audioTracks && videoElement.audioTracks.length > 0) {
            Array.from(videoElement.audioTracks).forEach((track, index) => {
                audioTracks.push({
                    index: index,
                    label: track.label || track.language || `Track ${index + 1}`,
                    language: track.language || 'und',
                    codec: null,
                    name: track.label || track.language || `Audio Track ${index + 1}`
                });
            });
        }

        // Text tracks (subtitles/captions)
        if (videoElement.textTracks && videoElement.textTracks.length > 0) {
            Array.from(videoElement.textTracks).forEach((track, index) => {
                subtitleTracks.push({
                    index: index,
                    label: track.label || track.language || `Subtitle ${index + 1}`,
                    language: track.language || 'und',
                    codec: track.kind || 'subtitles',
                    name: track.label || track.language || `Subtitle Track ${index + 1}`
                });
            });
        }

        return { audioTracks, subtitleTracks };
    }

    /**
     * Guess language code from track name
     * @param {string} trackName
     * @returns {string}
     */
    static guessLanguage(trackName) {
        if (!trackName) return 'und';
        
        const lowerName = trackName.toLowerCase();
        
        // Common language mappings
        const languageMap = {
            'english': 'en',
            'spanish': 'es',
            'french': 'fr',
            'german': 'de',
            'italian': 'it',
            'portuguese': 'pt',
            'russian': 'ru',
            'chinese': 'zh',
            'japanese': 'ja',
            'korean': 'ko',
            'arabic': 'ar',
            'hindi': 'hi',
            'dutch': 'nl',
            'polish': 'pl',
            'turkish': 'tr'
        };

        for (const [key, code] of Object.entries(languageMap)) {
            if (lowerName.includes(key)) {
                return code;
            }
        }

        return 'und';
    }
}
