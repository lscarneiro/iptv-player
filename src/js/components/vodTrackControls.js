// VOD Track Controls Component

import { logger } from '../utils/logger.js';

export class VodTrackControls {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.videoElement = null;
        this.audioTracks = [];
        this.textTracks = [];
        this.currentAudioTrack = 0;
        this.currentSubtitleTrack = -1; // -1 = off
    }

    setVideoElement(videoElement) {
        this.videoElement = videoElement;
        this.detectTracks();
        this.setupTrackListeners();
    }

    detectTracks() {
        if (!this.videoElement) return;

        // Detect audio tracks (if available via HTML5 API)
        if (this.videoElement.audioTracks) {
            this.audioTracks = Array.from(this.videoElement.audioTracks);
        }

        // Detect text tracks (subtitles/captions)
        if (this.videoElement.textTracks) {
            this.textTracks = Array.from(this.videoElement.textTracks);
        }
    }

    setupTrackListeners() {
        if (!this.videoElement) return;

        // Listen for track changes
        this.videoElement.addEventListener('loadedmetadata', () => {
            this.detectTracks();
            this.render();
        });

        // Listen for text track additions (subtitles can be added dynamically)
        if (this.videoElement.textTracks) {
            this.videoElement.textTracks.addEventListener('addtrack', () => {
                this.detectTracks();
                this.render();
            });
        }
    }

    render() {
        if (!this.container) return;

        let html = '<div class="vod-track-controls">';

        // Audio track selector
        if (this.audioTracks.length > 1) {
            html += `
                <div class="track-control-group">
                    <label for="vodAudioTrackSelect">Audio:</label>
                    <select id="vodAudioTrackSelect" class="track-select">
                        ${this.audioTracks.map((track, index) => `
                            <option value="${index}" ${track.enabled ? 'selected' : ''}>
                                ${track.label || track.language || `Track ${index + 1}`}
                            </option>
                        `).join('')}
                    </select>
                </div>
            `;
        }

        // Subtitle selector
        html += `
            <div class="track-control-group">
                <label for="vodSubtitleSelect">Subtitles:</label>
                <select id="vodSubtitleSelect" class="track-select">
                    <option value="-1">Off</option>
                    ${this.textTracks.map((track, index) => `
                        <option value="${index}" ${track.mode === 'showing' ? 'selected' : ''}>
                            ${track.label || track.language || `Subtitle ${index + 1}`}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;

        html += '</div>';

        this.container.innerHTML = html;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Audio track selection
        const audioSelect = document.getElementById('vodAudioTrackSelect');
        if (audioSelect) {
            audioSelect.addEventListener('change', (e) => {
                this.setAudioTrack(parseInt(e.target.value));
            });
        }

        // Subtitle selection
        const subtitleSelect = document.getElementById('vodSubtitleSelect');
        if (subtitleSelect) {
            subtitleSelect.addEventListener('change', (e) => {
                this.setSubtitleTrack(parseInt(e.target.value));
            });
        }
    }

    setAudioTrack(index) {
        if (!this.videoElement || !this.videoElement.audioTracks) return;

        for (let i = 0; i < this.videoElement.audioTracks.length; i++) {
            this.videoElement.audioTracks[i].enabled = (i === index);
        }
        this.currentAudioTrack = index;
        logger.log(`Audio track changed to: ${index}`);
    }

    setSubtitleTrack(index) {
        if (!this.videoElement || !this.videoElement.textTracks) return;

        for (let i = 0; i < this.videoElement.textTracks.length; i++) {
            this.videoElement.textTracks[i].mode = (i === index) ? 'showing' : 'hidden';
        }
        this.currentSubtitleTrack = index;
        logger.log(`Subtitle track changed to: ${index}`);
    }

    hide() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
