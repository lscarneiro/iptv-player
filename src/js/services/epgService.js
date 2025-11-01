// EPG Service - handles EPG data fetching, parsing, and storage

import { TimezoneUtils } from '../utils/timezoneUtils.js';
import { logger } from '../utils/logger.js';

export class EPGService {
    constructor(apiService, storageService) {
        this.apiService = apiService;
        this.storageService = storageService;
        this.parsingProgress = null; // Callback for progress updates
    }

    setProgressCallback(callback) {
        this.parsingProgress = callback;
    }

    async fetchAndParseEPG(allStreams = []) {
        try {
            // Update progress
            if (this.parsingProgress) {
                this.parsingProgress({ stage: 'fetching', message: 'Fetching EPG data...' });
            }

            // Fetch XML
            const xmlText = await this.apiService.getEPGXml();
            
            if (this.parsingProgress) {
                this.parsingProgress({ stage: 'parsing', message: 'Parsing XML...', progress: 0 });
            }

            // Parse XML
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            
            // Check for parse errors
            const parserError = xmlDoc.querySelector('parsererror');
            if (parserError) {
                throw new Error('Failed to parse XML: ' + parserError.textContent);
            }

            // Create a map of epg_channel_id -> stream for quick lookup
            const streamMap = new Map();
            allStreams.forEach(stream => {
                if (stream.epg_channel_id && stream.epg_channel_id.trim() !== '') {
                    streamMap.set(stream.epg_channel_id.trim(), stream);
                }
            });

            if (this.parsingProgress) {
                this.parsingProgress({ stage: 'processing', message: 'Processing channels...', progress: 10 });
            }

            // Process channels - only keep ones that match our streams
            const channels = [];
            const channelElements = xmlDoc.querySelectorAll('channel');
            let processedChannels = 0;

            for (const channelEl of channelElements) {
                const channelId = channelEl.getAttribute('id');
                if (!channelId) continue;

                // Check if we have a stream with matching epg_channel_id
                if (streamMap.has(channelId)) {
                    const stream = streamMap.get(channelId);
                    
                    const displayNameEl = channelEl.querySelector('display-name');
                    const iconEl = channelEl.querySelector('icon');
                    
                    const channel = {
                        id: channelId,
                        displayName: displayNameEl ? displayNameEl.textContent.trim() : '',
                        icon: iconEl ? iconEl.getAttribute('src') : null,
                        streamId: stream.stream_id,
                        streamName: stream.name,
                        categoryId: stream.category_id
                    };
                    
                    channels.push(channel);
                }

                processedChannels++;
                if (processedChannels % 100 === 0 && this.parsingProgress) {
                    const progress = 10 + Math.floor((processedChannels / channelElements.length) * 40);
                    this.parsingProgress({ 
                        stage: 'processing', 
                        message: `Processing channels... ${processedChannels}/${channelElements.length}`,
                        progress 
                    });
                }
            }

            // Create set of channel IDs we care about for quick lookup
            const validChannelIds = new Set(channels.map(c => c.id));

            if (this.parsingProgress) {
                this.parsingProgress({ stage: 'processing', message: 'Processing programmes...', progress: 50 });
            }

            // Process programmes - only for channels we have
            const programmes = new Map();
            const programmeElements = xmlDoc.querySelectorAll('programme');
            let processedProgrammes = 0;
            const totalProgrammes = programmeElements.length;

            for (const progEl of programmeElements) {
                const channelId = progEl.getAttribute('channel');
                if (!channelId || !validChannelIds.has(channelId)) {
                    processedProgrammes++;
                    continue;
                }

                const startStr = progEl.getAttribute('start');
                const stopStr = progEl.getAttribute('stop');
                
                if (!startStr || !stopStr) {
                    processedProgrammes++;
                    continue;
                }

                // Convert timestamps to local time
                let startDate, stopDate;
                try {
                    startDate = TimezoneUtils.convertToLocalTime(startStr);
                    stopDate = TimezoneUtils.convertToLocalTime(stopStr);
                } catch (error) {
                    logger.warn(`Failed to parse timestamp for programme: ${startStr}`, error);
                    processedProgrammes++;
                    continue;
                }

                const titleEl = progEl.querySelector('title');
                const descEl = progEl.querySelector('desc');

                const programme = {
                    channelId: channelId,
                    title: titleEl ? titleEl.textContent.trim() : '',
                    description: descEl ? descEl.textContent.trim() : '',
                    start: startStr, // Keep original for reference
                    stop: stopStr,
                    startDate: startDate.getTime(), // Store as timestamp for sorting
                    stopDate: stopDate.getTime()
                };

                if (!programmes.has(channelId)) {
                    programmes.set(channelId, []);
                }
                programmes.get(channelId).push(programme);

                processedProgrammes++;
                
                // Yield to UI every 1000 programmes
                if (processedProgrammes % 1000 === 0) {
                    if (this.parsingProgress) {
                        const progress = 50 + Math.floor((processedProgrammes / totalProgrammes) * 45);
                        this.parsingProgress({ 
                            stage: 'processing', 
                            message: `Processing programmes... ${processedProgrammes}/${totalProgrammes}`,
                            progress 
                        });
                    }
                    // Yield to prevent blocking
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            // Sort programmes by start time for each channel
            for (const [channelId, progs] of programmes.entries()) {
                progs.sort((a, b) => a.startDate - b.startDate);
            }

            if (this.parsingProgress) {
                this.parsingProgress({ stage: 'saving', message: 'Saving to cache...', progress: 95 });
            }

            // Convert Map to object for storage (IndexedDB doesn't support Maps directly)
            const programmesObj = {};
            for (const [channelId, progs] of programmes.entries()) {
                programmesObj[channelId] = progs;
            }

            // Save to IndexedDB
            await this.storageService.saveEPGData(channels, programmesObj);

            if (this.parsingProgress) {
                this.parsingProgress({ stage: 'complete', message: 'EPG data loaded', progress: 100 });
            }

            return {
                channels,
                programmes: programmesObj
            };

        } catch (error) {
            logger.error('EPG fetch and parse error:', error);
            if (this.parsingProgress) {
                this.parsingProgress({ stage: 'error', message: `Error: ${error.message}`, progress: 0 });
            }
            throw error;
        }
    }

    async getEPGData() {
        const cached = await this.storageService.getEPGData();
        if (!cached) {
            return null;
        }
        return cached;
    }

    async refreshEPG(allStreams) {
        // Clear cache first
        await this.storageService.clearEPGData();
        // Fetch and parse fresh data
        return await this.fetchAndParseEPG(allStreams);
    }

    async getChannels() {
        const epgData = await this.getEPGData();
        if (!epgData) {
            return [];
        }
        return epgData.channels || [];
    }

    async getProgrammes(channelId) {
        const epgData = await this.getEPGData();
        if (!epgData || !epgData.programmes) {
            return [];
        }
        return epgData.programmes[channelId] || [];
    }

    async getAllProgrammes() {
        const epgData = await this.getEPGData();
        if (!epgData || !epgData.programmes) {
            return {};
        }
        return epgData.programmes;
    }

    // Find stream by epg_channel_id
    findStreamForChannel(allStreams, channelId) {
        return allStreams.find(stream => 
            stream.epg_channel_id && 
            stream.epg_channel_id.trim() === channelId.trim()
        );
    }

    /**
     * Decode Base64 string safely with proper UTF-8 handling
     */
    decodeBase64(str) {
        if (!str) return '';
        
        try {
            // Check if string looks like Base64 (contains only valid Base64 characters)
            if (/^[A-Za-z0-9+/]+=*$/.test(str)) {
                // Decode Base64 to binary string
                const binaryString = atob(str);
                
                // Convert binary string to UTF-8 bytes
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                // Decode UTF-8 bytes to JavaScript string
                const decoder = new TextDecoder('utf-8');
                return decoder.decode(bytes);
            }
            // Not Base64, return as-is
            return str;
        } catch (error) {
            logger.warn('Failed to decode Base64 string:', str, error);
            return str; // Return original if decoding fails
        }
    }

    /**
     * Process stream EPG data from get_simple_data_table API
     * Returns formatted programs with current program highlighted
     */
    processStreamEPG(epgData) {
        if (!epgData || !epgData.epg_listings || epgData.epg_listings.length === 0) {
            return null;
        }

        const now = Date.now();
        const programmes = [];

        // Process each EPG listing
        for (const listing of epgData.epg_listings) {
            try {
                // Parse the timestamps - prioritize start_timestamp/stop_timestamp fields
                let startDate, stopDate;
                
                if (listing.start_timestamp && listing.stop_timestamp) {
                    // Use the timestamp fields (Unix timestamp as string)
                    startDate = new Date(parseInt(listing.start_timestamp) * 1000);
                    stopDate = new Date(parseInt(listing.stop_timestamp) * 1000);
                } else if (listing.start && listing.end) {
                    // Fallback to start/end fields
                    if (typeof listing.start === 'string' && /^\d+$/.test(listing.start)) {
                        // Unix timestamp in seconds
                        startDate = new Date(parseInt(listing.start) * 1000);
                        stopDate = new Date(parseInt(listing.end || listing.stop) * 1000);
                    } else if (typeof listing.start === 'number') {
                        // Unix timestamp in seconds
                        startDate = new Date(listing.start * 1000);
                        stopDate = new Date((listing.end || listing.stop) * 1000);
                    } else {
                        // Try parsing as datetime string
                        startDate = new Date(listing.start);
                        stopDate = new Date(listing.end || listing.stop);
                    }
                } else {
                    logger.warn('No valid timestamp fields in listing:', listing);
                    continue;
                }

                // Validate dates
                if (isNaN(startDate.getTime()) || isNaN(stopDate.getTime())) {
                    logger.warn('Invalid dates in listing:', listing);
                    continue;
                }

                // Decode Base64 encoded title and description
                const title = this.decodeBase64(listing.title) || 'Untitled';
                const description = this.decodeBase64(listing.description || listing.desc || '');

                // Check if currently playing (use now_playing field if available)
                const isCurrent = listing.now_playing === 1 || 
                                (now >= startDate.getTime() && now < stopDate.getTime());

                const programme = {
                    title: title,
                    description: description,
                    start: startDate,
                    stop: stopDate,
                    startTime: startDate.getTime(),
                    stopTime: stopDate.getTime(),
                    isCurrent: isCurrent
                };

                programmes.push(programme);
            } catch (error) {
                logger.warn('Failed to parse stream EPG listing:', listing, error);
                continue;
            }
        }

        // Sort by start time
        programmes.sort((a, b) => a.startTime - b.startTime);

        // Find the current program index (in case now_playing wasn't set)
        const currentIndex = programmes.findIndex(p => p.isCurrent);

        return {
            programmes,
            currentIndex,
            hasData: programmes.length > 0
        };
    }

    /**
     * Get nearest programs for display (current + next few)
     */
    getNearestProgrammes(epgData, count = 5) {
        const processed = this.processStreamEPG(epgData);
        
        if (!processed || !processed.hasData) {
            return null;
        }

        const { programmes, currentIndex } = processed;
        
        if (currentIndex >= 0) {
            // Return current program + next programs
            return programmes.slice(currentIndex, currentIndex + count);
        } else {
            // No current program, find the next upcoming program
            const now = Date.now();
            const nextIndex = programmes.findIndex(p => p.startTime > now);
            
            if (nextIndex >= 0) {
                return programmes.slice(nextIndex, nextIndex + count);
            } else {
                // All programs are in the past, return last few
                return programmes.slice(-count);
            }
        }
    }
}

