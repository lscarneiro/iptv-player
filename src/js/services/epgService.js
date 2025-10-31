// EPG Service - handles EPG data fetching, parsing, and storage

import { TimezoneUtils } from '../utils/timezoneUtils.js';

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
                    console.warn(`Failed to parse timestamp for programme: ${startStr}`, error);
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
            console.error('EPG fetch and parse error:', error);
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
}

