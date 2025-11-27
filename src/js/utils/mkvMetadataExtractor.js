// MKV Metadata Extractor Utility
// Extracts audio and subtitle track information from Matroska (MKV) file headers

import { logger } from './logger.js';

export class MkvMetadataExtractor {
    /**
     * Extract track metadata from MKV file
     * @param {string} url - URL to the MKV file
     * @returns {Promise<{audioTracks: Array, subtitleTracks: Array}>}
     */
    static async extractTracks(url) {
        try {
            // Only attempt extraction for .mkv files
            if (!url || !url.toLowerCase().includes('.mkv')) {
                return { audioTracks: [], subtitleTracks: [] };
            }

            // Fetch first ~128KB to get header information
            const response = await fetch(url, {
                headers: {
                    'Range': 'bytes=0-131071' // First 128KB
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch MKV header: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const tracks = this.parseMkvHeader(arrayBuffer);

            logger.log('MKV metadata extracted:', tracks);
            return tracks;

        } catch (error) {
            logger.warn('Failed to extract MKV metadata:', error);
            return { audioTracks: [], subtitleTracks: [] };
        }
    }

    /**
     * Parse MKV header to extract track information
     * @param {ArrayBuffer} buffer - First portion of MKV file
     * @returns {{audioTracks: Array, subtitleTracks: Array}}
     */
    static parseMkvHeader(buffer) {
        const audioTracks = [];
        const subtitleTracks = [];
        const dataView = new DataView(buffer);

        try {
            // Look for EBML header and Segment
            let offset = 0;
            
            // Find Segment element (usually starts around offset 4-32)
            // Segment contains Tracks element which has track entries
            const segmentOffset = this.findElement(dataView, 0x18538067, offset); // Segment ID
            if (segmentOffset === -1) {
                return { audioTracks, subtitleTracks };
            }

            // Find Tracks element within Segment
            const tracksOffset = this.findElement(dataView, 0x1654AE6B, segmentOffset); // Tracks ID
            if (tracksOffset === -1) {
                return { audioTracks, subtitleTracks };
            }

            // Parse track entries
            offset = tracksOffset;
            while (offset < buffer.byteLength - 8) {
                const trackEntryOffset = this.findElement(dataView, 0xAE, offset); // TrackEntry ID
                if (trackEntryOffset === -1) break;

                const trackInfo = this.parseTrackEntry(dataView, trackEntryOffset);
                if (trackInfo) {
                    if (trackInfo.type === 'audio') {
                        audioTracks.push(trackInfo);
                    } else if (trackInfo.type === 'subtitle') {
                        subtitleTracks.push(trackInfo);
                    }
                }

                offset = trackEntryOffset + 100; // Move forward to next potential track entry
            }

        } catch (error) {
            logger.warn('Error parsing MKV header:', error);
        }

        return { audioTracks, subtitleTracks };
    }

    /**
     * Find EBML element by ID
     * @param {DataView} dataView
     * @param {number} elementId - EBML element ID
     * @param {number} startOffset
     * @returns {number} - Offset of element or -1 if not found
     */
    static findElement(dataView, elementId, startOffset = 0) {
        const maxOffset = Math.min(dataView.byteLength - 8, startOffset + 100000);
        
        for (let offset = startOffset; offset < maxOffset; offset++) {
            // Check for 4-byte element ID
            if (offset + 4 <= dataView.byteLength) {
                const id = dataView.getUint32(offset, false); // Big-endian
                if (id === elementId) {
                    return offset;
                }
            }
        }
        return -1;
    }

    /**
     * Parse a TrackEntry element
     * @param {DataView} dataView
     * @param {number} offset
     * @returns {Object|null} - Track info or null
     */
    static parseTrackEntry(dataView, offset) {
        try {
            const trackInfo = {
                type: null,
                language: 'und', // undefined/unknown
                codec: null,
                name: null,
                index: 0
            };

            let currentOffset = offset + 4; // Skip TrackEntry ID

            // Find TrackNumber
            const trackNumberOffset = this.findElement(dataView, 0xD7, currentOffset);
            if (trackNumberOffset !== -1) {
                const trackNumber = this.readEbmlUint(dataView, trackNumberOffset + 4);
                trackInfo.index = trackNumber || 0;
            }

            // Find TrackType (1=video, 2=audio, 17=subtitle)
            const trackTypeOffset = this.findElement(dataView, 0x83, currentOffset);
            if (trackTypeOffset !== -1) {
                const trackType = this.readEbmlUint(dataView, trackTypeOffset + 4);
                if (trackType === 2) {
                    trackInfo.type = 'audio';
                } else if (trackType === 17) {
                    trackInfo.type = 'subtitle';
                } else {
                    return null; // Not audio or subtitle
                }
            } else {
                return null; // No track type found
            }

            // Find CodecID
            const codecOffset = this.findElement(dataView, 0x86, currentOffset);
            if (codecOffset !== -1) {
                trackInfo.codec = this.readEbmlString(dataView, codecOffset + 4);
            }

            // Find Language
            const languageOffset = this.findElement(dataView, 0x22B59C, currentOffset);
            if (languageOffset !== -1) {
                trackInfo.language = this.readEbmlString(dataView, languageOffset + 4) || 'und';
            }

            // Find Name
            const nameOffset = this.findElement(dataView, 0x536E, currentOffset);
            if (nameOffset !== -1) {
                trackInfo.name = this.readEbmlString(dataView, nameOffset + 4);
            }

            return trackInfo.type ? trackInfo : null;

        } catch (error) {
            logger.warn('Error parsing track entry:', error);
            return null;
        }
    }

    /**
     * Read EBML unsigned integer
     * @param {DataView} dataView
     * @param {number} offset
     * @returns {number}
     */
    static readEbmlUint(dataView, offset) {
        if (offset >= dataView.byteLength) return 0;
        
        const lengthByte = dataView.getUint8(offset);
        const length = this.getEbmlLength(lengthByte);
        
        if (offset + length > dataView.byteLength) return 0;
        
        let value = 0;
        for (let i = 0; i < length; i++) {
            value = (value << 8) | dataView.getUint8(offset + 1 + i);
        }
        return value;
    }

    /**
     * Read EBML string
     * @param {DataView} dataView
     * @param {number} offset
     * @returns {string}
     */
    static readEbmlString(dataView, offset) {
        if (offset >= dataView.byteLength) return '';
        
        const lengthByte = dataView.getUint8(offset);
        const length = this.getEbmlLength(lengthByte);
        
        if (offset + length > dataView.byteLength) return '';
        
        const bytes = new Uint8Array(dataView.buffer, offset + 1, length);
        return new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '');
    }

    /**
     * Get EBML element length from first byte
     * @param {number} firstByte
     * @returns {number}
     */
    static getEbmlLength(firstByte) {
        if ((firstByte & 0x80) !== 0) return 1;
        if ((firstByte & 0xC0) !== 0) return 2;
        if ((firstByte & 0xE0) !== 0) return 3;
        if ((firstByte & 0xF0) !== 0) return 4;
        if ((firstByte & 0xF8) !== 0) return 5;
        if ((firstByte & 0xFC) !== 0) return 6;
        if ((firstByte & 0xFE) !== 0) return 7;
        return 8;
    }
}
