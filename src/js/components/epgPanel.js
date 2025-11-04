// EPG Panel Component - TV guide grid display

import { TimezoneUtils } from '../utils/timezoneUtils.js';
import { escapeHtml, formatStreamName } from '../utils/domHelpers.js';
import { logger } from '../utils/logger.js';

export class EPGPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.channelsContainer = null;
        this.programmesContainer = null;
        this.timeHeaderContainer = null;
        
        this.channels = [];
        this.allChannels = []; // Store all channels before filtering
        this.filteredChannels = []; // Currently filtered channels
        this.programmes = {};
        this.timezone = TimezoneUtils.getTimezone();
        
        // Filtering state
        this.currentSearchTerm = '';
        this.favoritesFilterActive = false;
        this.favoritesService = null;
        
        // Rendering state
        this.visibleChannels = 50; // Start with 50 channels visible
        this.visibleTimeStart = null; // Will be set to current time
        this.visibleTimeEnd = null;
        this.hoursToShow = 6; // 6 hour window (increased from 4)
        this.pixelsPerMinute = 6; // 6px per minute for better use of space
        this.rowHeight = 80; // Fixed row height in pixels for sync
        
        // Scroll handlers
        this.isLoadingMore = false;
        this.horizontalScrollPos = 0;
        this.isSyncingScroll = false; // Prevent infinite scroll sync loops
        
        // Callbacks
        this.onChannelClick = null;
        
        this.setupContainers();
        this.setupScrollHandlers();
    }

    setupContainers() {
        if (!this.container) return;
        
        // Find containers by ID (set by HTML)
        this.channelsContainer = document.getElementById('epgChannelsColumn');
        this.programmesContainer = document.getElementById('epgProgrammesArea');
        this.timeHeaderContainer = document.getElementById('epgTimeHeader');
        this.gridContainer = document.querySelector('.epg-grid-container');
        
        if (!this.channelsContainer || !this.programmesContainer || !this.timeHeaderContainer || !this.gridContainer) {
            logger.error('EPG panel containers not found', {
                channels: !!this.channelsContainer,
                programmes: !!this.programmesContainer,
                timeHeader: !!this.timeHeaderContainer,
                gridContainer: !!this.gridContainer
            });
        }
    }

    setupScrollHandlers() {
        if (!this.gridContainer || !this.programmesContainer || !this.timeHeaderContainer) return;
        
        // The grid container handles vertical scrolling (channels and programmes scroll together)
        // The programmes container handles horizontal scrolling
        this.gridContainer.addEventListener('scroll', () => {
            this.handleVerticalScroll();
        });

        // Sync horizontal scrolling between time header and programmes
        this.programmesContainer.addEventListener('scroll', () => {
            if (this.timeHeaderContainer && !this.isSyncingScroll) {
                this.isSyncingScroll = true;
                this.timeHeaderContainer.scrollLeft = this.programmesContainer.scrollLeft;
                requestAnimationFrame(() => {
                    this.isSyncingScroll = false;
                });
            }
        });

        if (this.timeHeaderContainer) {
            this.timeHeaderContainer.addEventListener('scroll', () => {
                if (this.isSyncingScroll) return;
                
                this.isSyncingScroll = true;
                this.programmesContainer.scrollLeft = this.timeHeaderContainer.scrollLeft;
                requestAnimationFrame(() => {
                    this.isSyncingScroll = false;
                });
            });
        }

        // Ensure horizontal scrollbar is always visible when content overflows
        const checkScrollbars = () => {
            if (this.programmesContainer) {
                const hasHorizontalScroll = this.programmesContainer.scrollWidth > this.programmesContainer.clientWidth;
                if (hasHorizontalScroll) {
                    this.programmesContainer.style.overflowX = 'scroll';
                }
            }
        };
        
        // Handle window resize to recalculate optimal hours
        const handleResize = () => {
            if (this.channels.length > 0) {
                this.calculateOptimalHours();
                this.renderTimeHeader();
                this.renderProgrammes(0);
            }
            checkScrollbars();
        };
        
        // Check after a short delay to ensure content is rendered
        setTimeout(() => {
            checkScrollbars();
            if (this.channels.length > 0) {
                this.calculateOptimalHours();
                this.renderTimeHeader();
                this.renderProgrammes(0);
            }
        }, 100);
        
        // Also check on resize
        window.addEventListener('resize', handleResize);
    }

    handleVerticalScroll() {
        if (this.isLoadingMore || !this.gridContainer) return;
        
        const container = this.gridContainer;
        const { scrollTop, scrollHeight, clientHeight } = container;
        
        // Debug logging
        logger.log('[EPG Scroll]', {
            scrollTop: Math.round(scrollTop),
            scrollHeight: Math.round(scrollHeight),
            clientHeight: Math.round(clientHeight),
            visibleChannels: this.visibleChannels,
            totalChannels: this.filteredChannels.length,
            scrollableHeight: Math.round(scrollHeight - clientHeight),
            distanceFromBottom: Math.round(scrollHeight - scrollTop - clientHeight)
        });
        
        // Calculate threshold - load when within 2 screen heights of bottom
        const threshold = clientHeight * 2;
        
        // Load more when near bottom
        if (scrollTop + clientHeight >= scrollHeight - threshold) {
            if (this.visibleChannels < this.filteredChannels.length) {
                logger.log('[EPG Scroll] Loading more channels...');
                this.loadMoreChannels();
            }
        }
    }

    loadMoreChannels() {
        if (this.isLoadingMore || this.visibleChannels >= this.filteredChannels.length) return;
        
        this.isLoadingMore = true;
        const previousVisible = this.visibleChannels;
        this.visibleChannels = Math.min(this.visibleChannels + 50, this.filteredChannels.length);
        
        // Render additional channels
        this.renderChannels(previousVisible);
        this.renderProgrammes(previousVisible);
        
        // Wait for DOM update before allowing next load
        requestAnimationFrame(() => {
            this.isLoadingMore = false;
        });
    }

    setChannels(channels) {
        // Sort channels alphabetically by display name
        this.allChannels = (channels || []).sort((a, b) => {
            const nameA = (a.displayName || a.streamName || a.id || '').toLowerCase();
            const nameB = (b.displayName || b.streamName || b.id || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
        
        // Apply current filters
        this.applyFilters();
    }

    setProgrammes(programmes) {
        this.programmes = programmes || {};
    }

    setFavoritesService(favoritesService) {
        this.favoritesService = favoritesService;
    }

    setTimezone(timezone) {
        this.timezone = timezone;
        TimezoneUtils.setTimezone(timezone);
    }

    setOnChannelClick(callback) {
        this.onChannelClick = callback;
    }

    showLoading(message) {
        if (!this.programmesContainer) return;
        this.programmesContainer.innerHTML = `<div class="loading">${escapeHtml(message)}</div>`;
        if (this.channelsContainer) {
            this.channelsContainer.innerHTML = '';
        }
    }

    showError(message) {
        if (!this.programmesContainer) return;
        this.programmesContainer.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
        if (this.channelsContainer) {
            this.channelsContainer.innerHTML = '';
        }
    }

    calculateTimeRange() {
        const now = new Date();
        const start = new Date(now);
        start.setHours(Math.floor(now.getHours() / 2) * 2, 0, 0, 0); // Round to even hour
        
        const end = new Date(start);
        end.setHours(end.getHours() + this.hoursToShow);
        
        this.visibleTimeStart = start;
        this.visibleTimeEnd = end;
    }

    render(channels, programmes) {
        this.setChannels(channels);
        this.setProgrammes(programmes);
        this.calculateTimeRange();
        this.visibleChannels = Math.min(50, this.filteredChannels.length);
        
        // Log to confirm only matched channels are shown
        logger.log('[EPG Render]', {
            totalChannels: this.filteredChannels.length,
            visibleChannels: this.visibleChannels,
            channelsWithStreamId: this.filteredChannels.filter(c => c.streamId).length,
            note: 'All channels shown have matching epg_channel_id from EPG service'
        });
        
        // Calculate optimal hours to show based on available width
        this.calculateOptimalHours();
        
        // Reset scroll positions before rendering
        if (this.gridContainer) this.gridContainer.scrollTop = 0;
        if (this.programmesContainer) this.programmesContainer.scrollLeft = 0;
        if (this.timeHeaderContainer) this.timeHeaderContainer.scrollLeft = 0;
        
        this.renderTimeHeader();
        this.renderChannels(0);
        this.renderProgrammes(0);
    }


    applyFilters() {
        let filtered = [...this.allChannels];
        // Apply favorites filter if active
        if (this.favoritesFilterActive) {
            if (!this.favoritesService) {
                logger.warn('[EPG Filter] Favorites service not available');
                filtered = [];
            } else {
                filtered = filtered.filter(channel => {
                    // Channel must have a streamId to be favoritable
                    if (!channel.streamId) {
                        return false;
                    }
                    
                    // Channel must be favorited (using stream favorites, not series favorites)
                    const isFavorite = this.favoritesService.isFavorite(channel.streamId);
                    
                    // Channel must have EPG data (programmes)
                    const hasEPGData = channel.id && this.programmes[channel.id] && Array.isArray(this.programmes[channel.id]) && this.programmes[channel.id].length > 0;
                    
                    // Both conditions must be true
                    if (isFavorite && hasEPGData) console.log('[EPG Filter] Channel:',{ channel: channel, isFavorite: isFavorite, hasEPGData: hasEPGData});
                    return isFavorite && hasEPGData;
                });
            }
        }
        
        // Apply search filter if active
        if (this.currentSearchTerm) {
            const term = this.currentSearchTerm.toLowerCase();
            filtered = filtered.filter(channel => {
                const name = (channel.displayName || channel.streamName || channel.id || '').toLowerCase();
                return name.includes(term);
            });
        }
        
        this.filteredChannels = filtered;
        this.channels = this.filteredChannels; // Update channels for rendering
    }

    filter(searchTerm) {
        this.currentSearchTerm = searchTerm.trim();
        this.favoritesFilterActive = false; // Clear favorites filter when searching
        
        // Update favorites button state
        const favoritesBtn = document.getElementById('epgFavoritesFilter');
        if (favoritesBtn) {
            favoritesBtn.classList.remove('active');
        }
        
        this.applyFilters();
        this.visibleChannels = Math.min(50, this.filteredChannels.length);
        
        // Reset scroll position when filtering
        if (this.gridContainer) this.gridContainer.scrollTop = 0;
        
        // Re-render
        this.renderTimeHeader();
        this.renderChannels(0);
        this.renderProgrammes(0);
    }

    filterFavorites() {
        this.favoritesFilterActive = !this.favoritesFilterActive;
        this.currentSearchTerm = ''; // Clear search when using favorites filter
        
        // Clear search input
        const searchInput = document.getElementById('epgChannelSearch');
        if (searchInput) {
            searchInput.value = '';
        }
        
        // Update favorites button state
        const favoritesBtn = document.getElementById('epgFavoritesFilter');
        if (favoritesBtn) {
            if (this.favoritesFilterActive) {
                favoritesBtn.classList.add('active');
            } else {
                favoritesBtn.classList.remove('active');
            }
        }
        
        this.applyFilters();
        this.visibleChannels = Math.min(50, this.filteredChannels.length);
        
        // Reset scroll position when filtering
        if (this.gridContainer) this.gridContainer.scrollTop = 0;
        
        // Re-render
        this.renderTimeHeader();
        this.renderChannels(0);
        this.renderProgrammes(0);
    }

    calculateOptimalHours() {
        // Calculate based on available width in programmes area
        if (!this.programmesContainer) return;
        
        // Get actual container width, or estimate if not available yet
        let availableWidth = this.programmesContainer.clientWidth;
        if (!availableWidth || availableWidth === 0) {
            // Fallback: estimate based on window width (200px channels + 40px padding/margins)
            availableWidth = window.innerWidth - 200 - 40;
            if (availableWidth <= 0) {
                // Still no valid width, use default
                return;
            }
        }
        
        // Calculate how many hours we can fit with current pixelsPerMinute
        // Each hour = 60 minutes * pixelsPerMinute
        const pixelsPerHour = 60 * this.pixelsPerMinute;
        const maxHours = Math.floor(availableWidth / pixelsPerHour);
        
        // Use at least 6 hours, but up to 12 hours if space allows
        // This ensures we fill the available space better
        if (maxHours >= 10) {
            this.hoursToShow = Math.min(12, maxHours);
        } else if (maxHours >= 8) {
            this.hoursToShow = 10;
        } else if (maxHours >= 6) {
            this.hoursToShow = 8;
        } else {
            // If space is limited, use what we can fit (minimum 4)
            this.hoursToShow = Math.max(4, maxHours);
        }
        
        // Update visibleTimeEnd to match new hours
        if (this.visibleTimeStart) {
            const end = new Date(this.visibleTimeStart);
            end.setHours(end.getHours() + this.hoursToShow);
            this.visibleTimeEnd = end;
        }
    }

    renderTimeHeader() {
        if (!this.timeHeaderContainer) return;
        
        const slots = [];
        const slotCount = this.hoursToShow * 2; // 30 minute slots
        const slotWidth = 30 * this.pixelsPerMinute; // 30 minutes * pixels per minute
        const containerWidth = this.hoursToShow * 60 * this.pixelsPerMinute;
        
        // Calculate channels column width for full width calculation
        const channelsWidth = this.channelsContainer ? this.channelsContainer.offsetWidth || 200 : 200;
        const fullWidth = channelsWidth + containerWidth;
        
        for (let i = 0; i <= slotCount; i++) {
            const time = new Date(this.visibleTimeStart);
            time.setMinutes(time.getMinutes() + (i * 30));
            
            const leftOffset = i === 0 ? channelsWidth : 0;
            slots.push(`
                <div class="epg-time-slot" style="width: ${slotWidth}px; min-width: ${slotWidth}px; ${i === 0 ? `margin-left: ${channelsWidth}px;` : ''}">
                    <div class="epg-time-slot-time">${TimezoneUtils.formatTimeShort(time)}</div>
                    <div class="epg-time-slot-line"></div>
                </div>
            `);
        }
        
        // Add current time line to header (wrap in inner container for positioning)
        const currentTimeLine = this.renderCurrentTimeLineForHeader(containerWidth, channelsWidth);
        this.timeHeaderContainer.innerHTML = `
            <div class="epg-time-header-inner" style="width: ${fullWidth}px;">
                ${slots.join('')}
                ${currentTimeLine}
            </div>
        `;
    }

    renderCurrentTimeLineForHeader(containerWidth, channelsWidth) {
        if (!this.visibleTimeStart) return '';
        
        const now = new Date();
        
        // Check if current time is within visible range
        if (now < this.visibleTimeStart || now > this.visibleTimeEnd) {
            return ''; // Don't show line if current time is outside visible range
        }
        
        // Calculate position in pixels (offset by channels width)
        const minutesFromStart = (now - this.visibleTimeStart) / (1000 * 60);
        const left = channelsWidth + (minutesFromStart * this.pixelsPerMinute);
        
        // Only render if within visible bounds
        if (left >= channelsWidth && left <= channelsWidth + containerWidth) {
            return `
                <div class="epg-current-time-line-header" style="left: ${left}px;"></div>
            `;
        }
        
        return '';
    }

    renderChannels(startIndex = 0) {
        if (!this.channelsContainer) return;
        
        const channelsToRender = this.filteredChannels.slice(startIndex, this.visibleChannels);
        
        let html = '';
        channelsToRender.forEach((channel, index) => {
            const actualIndex = startIndex + index;
            const iconHtml = channel.icon ? 
                `<img src="${escapeHtml(channel.icon)}" class="epg-channel-icon" alt="${escapeHtml(channel.displayName)}" onerror="this.style.display='none'">` : 
                '<div class="epg-channel-icon" style="background-color: #404040;"></div>';
            
            const channelName = channel.displayName || channel.streamName || channel.id;
            const formattedName = formatStreamName(channelName);
            const streamId = channel.streamId || '';
            const epgId = channel.id || '';
            const streamIdDisplay = streamId && epgId ? `${streamId} | ${epgId}` : (streamId || epgId || '');
            html += `
                <div class="epg-channel-row" data-channel-id="${escapeHtml(channel.id)}" data-channel-index="${actualIndex}" style="height: ${this.rowHeight}px; min-height: ${this.rowHeight}px; max-height: ${this.rowHeight}px;">
                    ${iconHtml}
                    <div class="epg-channel-info">
                        <div class="epg-channel-name">${escapeHtml(formattedName)}</div>
                        ${streamIdDisplay ? `<div class="epg-channel-stream-id">${escapeHtml(streamIdDisplay)}</div>` : ''}
                    </div>
                </div>
            `;
        });
        
        if (startIndex === 0) {
            this.channelsContainer.innerHTML = html;
        } else {
            this.channelsContainer.insertAdjacentHTML('beforeend', html);
        }
        
        // Ensure channels container has correct height for scroll calculation
        requestAnimationFrame(() => {
            const channelsHeight = this.visibleChannels * this.rowHeight;
            // Set both min-height and height to ensure proper scroll calculation
            this.channelsContainer.style.minHeight = `${channelsHeight}px`;
            this.channelsContainer.style.height = `${channelsHeight}px`;
        });
        
        // Attach click handlers
        this.attachChannelClickHandlers();
    }

    attachChannelClickHandlers() {
        const channelRows = this.channelsContainer.querySelectorAll('.epg-channel-row');
        channelRows.forEach(row => {
            row.addEventListener('click', (e) => {
                const channelId = row.getAttribute('data-channel-id');
                if (channelId && this.onChannelClick) {
                    this.onChannelClick(channelId);
                }
            });
        });
    }

    renderProgrammes(startIndex = 0) {
        if (!this.programmesContainer) return;
        
        const channelsToRender = this.filteredChannels.slice(startIndex, this.visibleChannels);
        const containerWidth = this.hoursToShow * 60 * this.pixelsPerMinute; // Total width for time range
        
        let html = '';
        
        channelsToRender.forEach((channel, index) => {
            const actualIndex = startIndex + index;
            const channelProgrammes = this.programmes[channel.id] || [];
            
            // Filter programmes visible in current time range
            const visibleProgrammes = channelProgrammes.filter(prog => {
                const progStart = new Date(prog.startDate);
                const progEnd = new Date(prog.stopDate);
                return progEnd >= this.visibleTimeStart && progStart <= this.visibleTimeEnd;
            });
            
            html += `<div class="epg-programme-row" data-channel-index="${actualIndex}" style="height: ${this.rowHeight}px; min-height: ${this.rowHeight}px; max-height: ${this.rowHeight}px;">`;
            
            // Render programme blocks
            visibleProgrammes.forEach(prog => {
                const progStart = new Date(prog.startDate);
                const progEnd = new Date(prog.stopDate);
                
                // Calculate position and width
                const minutesFromStart = (progStart - this.visibleTimeStart) / (1000 * 60);
                const durationMinutes = (progEnd - progStart) / (1000 * 60);
                
                let left = minutesFromStart * this.pixelsPerMinute;
                let width = durationMinutes * this.pixelsPerMinute;
                
                // Adjust if programme extends beyond visible area
                if (left < 0) {
                    width += left;
                    left = 0;
                }
                if (left + width > containerWidth) {
                    width = containerWidth - left;
                }
                
                // Only render if visible and wide enough
                if (width > 0 && left < containerWidth && width >= 40) { // Minimum 40px width
                    const title = escapeHtml(prog.title || 'No title');
                    const desc = escapeHtml(prog.description || '');
                    const timeStr = `${TimezoneUtils.formatTimeShort(progStart)} - ${TimezoneUtils.formatTimeShort(progEnd)}`;
                    
                    // Check if program is currently in progress
                    const now = new Date();
                    const isInProgress = progStart <= now && now < progEnd;
                    const inProgressClass = isInProgress ? 'epg-programme-now' : '';
                    
                    // Only show description if box is wide enough
                    const showDesc = width >= 120;
                    
                    html += `
                        <div class="epg-programme-block ${inProgressClass}" 
                             style="left: ${left}px; width: ${Math.max(width, 40)}px; min-width: 40px;"
                             title="${title} - ${timeStr}${desc ? ' - ' + desc : ''}">
                            <div class="epg-programme-title">${title}</div>
                            ${showDesc && desc ? `<div class="epg-programme-desc">${desc}</div>` : ''}
                        </div>
                    `;
                }
            });
            
            html += `</div>`;
        });
        
        // Calculate total height needed to match ALL visible channels (not just this batch)
        const totalHeight = this.visibleChannels * this.rowHeight;
        
        if (startIndex === 0) {
            // Calculate current time position for the red line
            const currentTimeLine = this.renderCurrentTimeLine(containerWidth);
            
            this.programmesContainer.innerHTML = `
                <div class="epg-programme-rows-container" style="width: ${containerWidth}px; min-height: ${totalHeight}px;">
                    ${html}
                    ${currentTimeLine}
                </div>
            `;
        } else {
            const rowsContainer = this.programmesContainer.querySelector('.epg-programme-rows-container');
            if (rowsContainer) {
                // Find the current time line (if exists) and insert before it
                const currentTimeLine = rowsContainer.querySelector('.epg-current-time-line');
                if (currentTimeLine) {
                    currentTimeLine.insertAdjacentHTML('beforebegin', html);
                } else {
                    rowsContainer.insertAdjacentHTML('beforeend', html);
                }
                
                // Update total height to match all visible channels
                const updatedHeight = this.visibleChannels * this.rowHeight;
                rowsContainer.style.minHeight = `${updatedHeight}px`;
                rowsContainer.style.height = `${updatedHeight}px`;
            }
        }
        
        // Ensure the programmes rows container height matches all visible channels
        // This is critical for proper scroll detection
        requestAnimationFrame(() => {
            const rowsContainer = this.programmesContainer.querySelector('.epg-programme-rows-container');
            if (rowsContainer) {
                const correctHeight = this.visibleChannels * this.rowHeight;
                const currentHeight = parseInt(rowsContainer.style.minHeight) || 0;
                if (currentHeight !== correctHeight) {
                    rowsContainer.style.minHeight = `${correctHeight}px`;
                    rowsContainer.style.height = `${correctHeight}px`;
                }
            }
            
            // Also ensure channels container matches
            if (this.channelsContainer) {
                const correctHeight = this.visibleChannels * this.rowHeight;
                this.channelsContainer.style.minHeight = `${correctHeight}px`;
                this.channelsContainer.style.height = `${correctHeight}px`;
            }
            
            // Check if we need to load more after rendering
            if (this.gridContainer && !this.isLoadingMore) {
                setTimeout(() => {
                    this.handleVerticalScroll();
                }, 100);
            }
        });
        
        // Attach programme click handlers
        this.attachProgrammeClickHandlers();
    }

    renderCurrentTimeLine(containerWidth) {
        if (!this.visibleTimeStart) return '';
        
        const now = new Date();
        
        // Check if current time is within visible range
        if (now < this.visibleTimeStart || now > this.visibleTimeEnd) {
            return ''; // Don't show line if current time is outside visible range
        }
        
        // Calculate position in pixels
        const minutesFromStart = (now - this.visibleTimeStart) / (1000 * 60);
        const left = minutesFromStart * this.pixelsPerMinute;
        
        // Only render if within visible bounds
        if (left >= 0 && left <= containerWidth) {
            return `
                <div class="epg-current-time-line" style="left: ${left}px;"></div>
            `;
        }
        
        return '';
    }

    attachProgrammeClickHandlers() {
        const programmeBlocks = this.programmesContainer.querySelectorAll('.epg-programme-block');
        programmeBlocks.forEach(block => {
            block.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = block.closest('.epg-programme-row');
                if (row && this.onChannelClick) {
                    const channelIndex = parseInt(row.getAttribute('data-channel-index'));
                    const channel = this.filteredChannels[channelIndex];
                    if (channel && channel.id) {
                        this.onChannelClick(channel.id);
                    }
                }
            });
        });
    }

    scrollToCurrentTime() {
        if (!this.programmesContainer) return;
        
        const now = new Date();
        const minutesFromStart = (now - this.visibleTimeStart) / (1000 * 60);
        const scrollLeft = minutesFromStart * this.pixelsPerMinute - 200; // Offset a bit
        
        this.programmesContainer.scrollLeft = Math.max(0, scrollLeft);
    }
}


