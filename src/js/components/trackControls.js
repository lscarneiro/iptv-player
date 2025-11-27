// Unified Track Controls Component
// Works for both VOD and Series playback

import { logger } from '../utils/logger.js';

export class TrackControls {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.videoElement = null;
        this.audioTracks = [];
        this.subtitleTracks = [];
        this.currentAudioTrack = 0;
        this.currentSubtitleTrack = -1; // -1 = off
        this.source = 'none';
    }

    /**
     * Set tracks from detected sources
     * @param {Object} options
     * @param {Array} options.audioTracks - Array of audio track objects
     * @param {Array} options.subtitleTracks - Array of subtitle track objects
     * @param {string} options.source - Source of tracks ('api', 'html5', 'mkv', 'none')
     * @param {HTMLVideoElement} options.videoElement - Video element for track switching
     */
    setTracks({ audioTracks = [], subtitleTracks = [], source = 'none', videoElement = null }) {
        this.audioTracks = audioTracks || [];
        this.subtitleTracks = subtitleTracks || [];
        this.source = source;
        this.videoElement = videoElement;
        
        this.render();
    }

    /**
     * Set video element for HTML5 track switching
     * @param {HTMLVideoElement} videoElement
     */
    setVideoElement(videoElement) {
        this.videoElement = videoElement;
        
        // If we have HTML5 tracks, update them
        if (this.source === 'html5' && videoElement) {
            this.setupHtml5TrackListeners();
        }
    }

    setupHtml5TrackListeners() {
        if (!this.videoElement) return;

        // Listen for track changes
        this.videoElement.addEventListener('loadedmetadata', () => {
            // Re-detect tracks if using HTML5 API
            if (this.source === 'html5') {
                this.detectHtml5Tracks();
            }
        });

        // Listen for text track additions
        if (this.videoElement.textTracks) {
            this.videoElement.textTracks.addEventListener('addtrack', () => {
                if (this.source === 'html5') {
                    this.detectHtml5Tracks();
                }
            });
        }
    }

    detectHtml5Tracks() {
        if (!this.videoElement) return;

        const audioTracks = [];
        const subtitleTracks = [];

        if (this.videoElement.audioTracks && this.videoElement.audioTracks.length > 0) {
            Array.from(this.videoElement.audioTracks).forEach((track, index) => {
                audioTracks.push({
                    index: index,
                    label: track.label || track.language || `Track ${index + 1}`,
                    language: track.language || 'und',
                    codec: null,
                    name: track.label || track.language || `Audio Track ${index + 1}`
                });
            });
        }

        if (this.videoElement.textTracks && this.videoElement.textTracks.length > 0) {
            Array.from(this.videoElement.textTracks).forEach((track, index) => {
                subtitleTracks.push({
                    index: index,
                    label: track.label || track.language || `Subtitle ${index + 1}`,
                    language: track.language || 'und',
                    codec: track.kind || 'subtitles',
                    name: track.label || track.language || `Subtitle Track ${index + 1}`
                });
            });
        }

        this.audioTracks = audioTracks;
        this.subtitleTracks = subtitleTracks;
        this.render();
    }

    render() {
        if (!this.container) return;

        let html = '<div class="track-controls">';

        // Audio tracks section
        if (this.audioTracks.length > 1) {
            // Multiple tracks - show dropdown
            html += `
                <div class="track-control-group">
                    <label for="trackAudioSelect">Audio:</label>
                    <select id="trackAudioSelect" class="track-select">
                        ${this.audioTracks.map((track, index) => `
                            <option value="${index}" ${index === this.currentAudioTrack ? 'selected' : ''}>
                                ${this.escapeHtml(track.label || track.name || `Track ${index + 1}`)}
                            </option>
                        `).join('')}
                    </select>
                </div>
            `;
        } else if (this.audioTracks.length === 1) {
            // Single track - show info text
            const track = this.audioTracks[0];
            const codecInfo = track.codec ? ` (${track.codec})` : '';
            html += `
                <div class="track-control-group">
                    <span class="track-status-message">
                        Audio: ${this.escapeHtml(track.label || track.name || 'Unknown')}${codecInfo}
                    </span>
                </div>
            `;
        } else {
            // No audio info
            html += `
                <div class="track-control-group">
                    <span class="track-status-message">Audio track info unavailable</span>
                </div>
            `;
        }

        // Subtitle tracks section
        if (this.subtitleTracks.length > 0) {
            // Multiple subtitles - show dropdown
            html += `
                <div class="track-control-group">
                    <label for="trackSubtitleSelect">Subtitles:</label>
                    <select id="trackSubtitleSelect" class="track-select">
                        <option value="-1" ${this.currentSubtitleTrack === -1 ? 'selected' : ''}>Off</option>
                        ${this.subtitleTracks.map((track, index) => `
                            <option value="${index}" ${index === this.currentSubtitleTrack ? 'selected' : ''}>
                                ${this.escapeHtml(track.label || track.name || `Subtitle ${index + 1}`)}
                            </option>
                        `).join('')}
                    </select>
                </div>
            `;
        } else {
            // No subtitles
            html += `
                <div class="track-control-group">
                    <span class="track-status-message">No subtitles available</span>
                </div>
            `;
        }

        html += '</div>';

        this.container.innerHTML = html;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Audio track selection
        const audioSelect = document.getElementById('trackAudioSelect');
        if (audioSelect) {
            audioSelect.addEventListener('change', (e) => {
                this.setAudioTrack(parseInt(e.target.value));
            });
        }

        // Subtitle selection
        const subtitleSelect = document.getElementById('trackSubtitleSelect');
        if (subtitleSelect) {
            subtitleSelect.addEventListener('change', (e) => {
                this.setSubtitleTrack(parseInt(e.target.value));
            });
        }
    }

    setAudioTrack(index) {
        if (index < 0 || index >= this.audioTracks.length) return;

        this.currentAudioTrack = index;

        // If using HTML5 API, switch tracks
        if (this.videoElement && this.videoElement.audioTracks && this.source === 'html5') {
            for (let i = 0; i < this.videoElement.audioTracks.length; i++) {
                this.videoElement.audioTracks[i].enabled = (i === index);
            }
        }

        logger.log(`Audio track changed to: ${index} (${this.audioTracks[index]?.label})`);
    }

    setSubtitleTrack(index) {
        this.currentSubtitleTrack = index;

        // If using HTML5 API, switch tracks
        if (this.videoElement && this.videoElement.textTracks && this.source === 'html5') {
            for (let i = 0; i < this.videoElement.textTracks.length; i++) {
                this.videoElement.textTracks[i].mode = (i === index) ? 'showing' : 'hidden';
            }
        }

        if (index === -1) {
            logger.log('Subtitles turned off');
        } else {
            logger.log(`Subtitle track changed to: ${index} (${this.subtitleTracks[index]?.label})`);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    hide() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
