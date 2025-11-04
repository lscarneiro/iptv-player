// Stream List Component

import { escapeHtml } from '../utils/domHelpers.js';
import { logger } from '../utils/logger.js';

export class StreamList {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.allStreams = []; // Original unfiltered streams
        this.filteredStreams = []; // Currently filtered streams
        this.visibleStreams = 30;
        this.currentPlayingStreamId = null;
        this.filterMarkers = true;
        this.currentCategoryName = 'All Channels';
        this.isLoading = false;
        this.infiniteScrollEnabled = true;
        this.currentSearchTerm = ''; // Track current search
        this.renderRequestId = 0; // Prevent race conditions
        this.isDestroyed = false; // Track component lifecycle
        this.favoritesService = null; // Will be set by app
        this.onFavoriteToggle = null; // Callback for favorite toggle
        
        this.setupInfiniteScroll();
    }

    buildStreamItemHtml(stream, playingClass, isFavorite, starClass, starIcon) {
        const iconHtml = stream.stream_icon ? 
            `<img src="${escapeHtml(stream.stream_icon)}" class="stream-icon" alt="Channel icon" onerror="this.style.display='none'">` : 
            '<div class="stream-icon" style="background-color: #404040;"></div>';
        
        // Build tags for catchup and EPG
        let tagsHtml = '';
        const tags = [];
        
        // Catchup tag
        if (stream.tv_archive && stream.tv_archive !== 0 && stream.tv_archive_duration) {
            tags.push(`<span class="stream-tag stream-tag-catchup">Catchup: ${stream.tv_archive_duration}h</span>`);
        }
        
        // EPG tag
        if (stream.epg_channel_id && stream.epg_channel_id.trim() !== '') {
            tags.push(`<span class="stream-tag stream-tag-epg">EPG</span>`);
        }
        
        if (tags.length > 0) {
            tagsHtml = `<div class="stream-tags">${tags.join('')}</div>`;
        }
        
        return `
            <div class="stream-item clickable-stream ${playingClass}" data-stream-id="${stream.stream_id}" data-stream-name="${escapeHtml(stream.name)}">
                ${iconHtml}
                <div class="stream-info">
                    <div class="stream-name">${escapeHtml(stream.name)}</div>
                    <div class="stream-id-row">
                        <span class="stream-id">ID: ${stream.stream_id}</span>
                        ${tagsHtml}
                    </div>
                </div>
                <div class="stream-actions">
                    <button class="${starClass}" data-stream-id="${stream.stream_id}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                        ${starIcon}
                    </button>
                    <button class="watch-btn" data-stream-id="${stream.stream_id}" data-stream-name="${escapeHtml(stream.name)}">
                        ${playingClass ? 'Now Playing' : 'Watch'}
                    </button>
                </div>
            </div>
        `;
    }

    setupInfiniteScroll() {
        // The container itself is the scrollable area
        const contentArea = this.container;
        if (!contentArea) return;

        // Use throttled scroll event for better performance
        let scrollTimeout;
        contentArea.addEventListener('scroll', () => {
            if (scrollTimeout) return;
            
            scrollTimeout = setTimeout(() => {
                scrollTimeout = null;
                
                if (this.isLoading || !this.infiniteScrollEnabled) return;
                
                const { scrollTop, scrollHeight, clientHeight } = contentArea;
                const threshold = 200; // Load more when 200px from bottom
                
                // Debug logging (can be removed in production)
                // logger.log('Scroll check:', { scrollTop, scrollHeight, clientHeight, threshold });
                
                if (scrollTop + clientHeight >= scrollHeight - threshold) {
                    this.loadMoreAutomatically();
                }
            }, 50); // Throttle to 50ms
        });
    }

    loadMoreAutomatically() {
        // Safety checks
        if (this.isDestroyed || this.isLoading || !this.infiniteScrollEnabled) {
            return;
        }
        
        // Use the current filtered streams, not recalculated ones
        const hasMore = this.filteredStreams.length > this.visibleStreams;
        
        if (hasMore) {
            this.isLoading = true;
            const previousVisible = this.visibleStreams;
            this.visibleStreams += 30;
            
            // Only re-render the additional items to prevent full re-render
            this.renderAdditionalItems(previousVisible);
            
            // Reset loading state after a short delay
            setTimeout(() => {
                if (!this.isDestroyed) {
                    this.isLoading = false;
                }
            }, 100);
        }
    }

    // Method to enable/disable infinite scroll
    setInfiniteScrollEnabled(enabled) {
        this.infiniteScrollEnabled = enabled;
    }

    // Check if operations should continue (not destroyed, request still valid)
    shouldContinueOperation(requestId = null) {
        if (this.isDestroyed) return false;
        if (requestId !== null && requestId !== this.renderRequestId) return false;
        return true;
    }

    // Reset search state (useful when changing categories)
    resetSearch() {
        this.currentSearchTerm = '';
        this.visibleStreams = 30;
        this.isLoading = false;
    }

    clear() {
        this.container.innerHTML = '';
        this.allStreams = [];
        this.filteredStreams = [];
        this.visibleStreams = 30;
        this.currentPlayingStreamId = null;
        this.currentSearchTerm = '';
        this.isLoading = false;
    }

    // Cleanup method
    destroy() {
        this.isDestroyed = true;
        this.isLoading = false;
    }

    setOnWatchStream(callback) {
        this.onWatchStream = callback;
    }

    setFavoritesService(favoritesService) {
        this.favoritesService = favoritesService;
        logger.log('StreamList: Favorites service set:', !!favoritesService);
    }

    setOnFavoriteToggle(callback) {
        this.onFavoriteToggle = callback;
    }

    setFilterMarkers(value) {
        this.filterMarkers = value;
        // Re-apply current filter with new marker setting
        this.filter(this.currentSearchTerm);
    }

    getFilteredStreams() {
        // Apply marker filter to current filtered streams
        return this.filteredStreams.filter(stream => {
            if (!this.filterMarkers) return true;
            const name = stream.name || '';
            return !name.trim().startsWith('###');
        });
    }

    render(streams, categoryName) {
        // Generate unique request ID to prevent race conditions
        const requestId = ++this.renderRequestId;
        
        this.currentCategoryName = categoryName;
        
        // Store original streams and apply marker filter
        this.allStreams = streams || [];
        this.filteredStreams = this.filterMarkers
            ? streams.filter(stream => {
                const name = stream.name || '';
                return !name.trim().startsWith('###');
            })
            : streams;

        // Apply search filter if there's an active search
        if (this.currentSearchTerm) {
            this.filteredStreams = this.filteredStreams.filter(stream => {
                const name = stream.name ? stream.name.toLowerCase() : '';
                return name.includes(this.currentSearchTerm.toLowerCase());
            });
        }
        
        // Reset scroll position to top when rendering new streams (important for mobile)
        if (this.container) {
            // Use requestAnimationFrame to ensure DOM has been updated before scrolling
            requestAnimationFrame(() => {
                this.container.scrollTop = 0;
            });
        }
        
        // Check if this render is still valid
        if (!this.shouldContinueOperation(requestId)) {
            logger.log('Render request outdated or component destroyed, skipping');
            return;
        }
        
        // Update panel header with category name and count
        const panelTitle = document.querySelector('.right-panel .panel-title');
        if (panelTitle) {
            const displayText = this.currentSearchTerm 
                ? `Streams - ${categoryName} (${this.filteredStreams.length} filtered)`
                : `Streams - ${categoryName} (${this.filteredStreams.length})`;
            panelTitle.textContent = displayText;
        }
        
        // Lazy load: only show first visibleStreams items
        const visibleItems = this.filteredStreams.slice(0, this.visibleStreams);
        const hasMore = this.filteredStreams.length > this.visibleStreams;
        
        let html = '';
        visibleItems.forEach(stream => {
            // Add playing class if this is the currently playing stream
            const playingClass = this.currentPlayingStreamId === stream.stream_id ? 'playing' : '';
            
            // Check if stream is favorited
            const isFavorite = this.favoritesService ? this.favoritesService.isFavorite(stream.stream_id) : false;
            const starClass = isFavorite ? 'favorite-star favorited' : 'favorite-star';
            const starIcon = isFavorite ? '★' : '☆';
            
            html += this.buildStreamItemHtml(stream, playingClass, isFavorite, starClass, starIcon);
        });
        
        // Add loading indicator if there are more items and we're loading
        if (hasMore && this.isLoading) {
            html += `
                <div class="load-more-container">
                    <div class="loading">Loading more streams...</div>
                </div>
            `;
        }
        
        this.container.innerHTML = html;
        
        // Add click listeners
        this.container.querySelectorAll('.watch-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onWatchStream) {
                    this.onWatchStream(btn.dataset.streamId, btn.dataset.streamName);
                }
            });
        });

        // Add click listeners for favorite stars
        this.container.querySelectorAll('.favorite-star').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleFavoriteToggle(btn.dataset.streamId, btn);
            });
        });
        
        // Add click listeners for entire stream rows
        this.container.querySelectorAll('.clickable-stream').forEach(item => {
            item.addEventListener('click', () => {
                if (this.onWatchStream) {
                    const streamId = item.dataset.streamId;
                    const streamName = item.dataset.streamName;
                    // Find the stream object to get catchup info
                    const stream = this.allStreams.find(s => s.stream_id == streamId);
                    const tvArchive = stream ? stream.tv_archive : null;
                    const tvArchiveDuration = stream ? stream.tv_archive_duration : null;
                    this.onWatchStream(streamId, streamName, tvArchive, tvArchiveDuration);
                }
            });
        });
        
        // Infinite scroll handles loading automatically - no manual button needed
    }

    renderAdditionalItems(startIndex) {
        // Safety check
        if (this.isDestroyed || !this.container) return;
        
        // Render additional items for infinite scroll without full re-render
        const endIndex = Math.min(this.visibleStreams, this.filteredStreams.length);
        const additionalItems = this.filteredStreams.slice(startIndex, endIndex);
        
        if (additionalItems.length === 0) return;
        
        let html = '';
        additionalItems.forEach(stream => {
            const playingClass = this.currentPlayingStreamId === stream.stream_id ? 'playing' : '';
            
            // Check if stream is favorited
            const isFavorite = this.favoritesService ? this.favoritesService.isFavorite(stream.stream_id) : false;
            const starClass = isFavorite ? 'favorite-star favorited' : 'favorite-star';
            const starIcon = isFavorite ? '★' : '☆';
            
            html += this.buildStreamItemHtml(stream, playingClass, isFavorite, starClass, starIcon);
        });
        
        // Remove any existing loading indicator
        const loadingContainer = this.container.querySelector('.load-more-container');
        if (loadingContainer) {
            loadingContainer.remove();
        }
        
        // Append new items
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        while (tempDiv.firstChild) {
            this.container.appendChild(tempDiv.firstChild);
        }
        
        // Add event listeners to new items
        const newItems = this.container.querySelectorAll('.stream-item:not([data-listeners-added])');
        newItems.forEach(item => {
            item.setAttribute('data-listeners-added', 'true');
            
            const watchBtn = item.querySelector('.watch-btn');
            if (watchBtn) {
                watchBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.onWatchStream) {
                        const streamId = watchBtn.dataset.streamId;
                        const streamName = watchBtn.dataset.streamName;
                        // Find the stream object to get catchup info
                        const stream = this.allStreams.find(s => s.stream_id == streamId);
                        const tvArchive = stream ? stream.tv_archive : null;
                        const tvArchiveDuration = stream ? stream.tv_archive_duration : null;
                        this.onWatchStream(streamId, streamName, tvArchive, tvArchiveDuration);
                    }
                });
            }

            const favoriteBtn = item.querySelector('.favorite-star');
            if (favoriteBtn) {
                favoriteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleFavoriteToggle(favoriteBtn.dataset.streamId, favoriteBtn);
                });
            }
            
            item.addEventListener('click', () => {
                if (this.onWatchStream) {
                    const streamId = item.dataset.streamId;
                    const streamName = item.dataset.streamName;
                    // Find the stream object to get catchup info
                    const stream = this.allStreams.find(s => s.stream_id == streamId);
                    const tvArchive = stream ? stream.tv_archive : null;
                    const tvArchiveDuration = stream ? stream.tv_archive_duration : null;
                    this.onWatchStream(streamId, streamName, tvArchive, tvArchiveDuration);
                }
            });
        });
        
        // Add loading indicator if there are still more items
        const hasMore = this.filteredStreams.length > this.visibleStreams;
        if (hasMore && this.isLoading) {
            const loadingHtml = `
                <div class="load-more-container">
                    <div class="loading">Loading more streams...</div>
                </div>
            `;
            this.container.insertAdjacentHTML('beforeend', loadingHtml);
        }
    }

    renderCurrentState() {
        // Re-render with current filtered streams and visible count
        const visibleItems = this.filteredStreams.slice(0, this.visibleStreams);
        const hasMore = this.filteredStreams.length > this.visibleStreams;
        
        // Reset scroll position to top when rendering new streams
        if (this.container) {
            requestAnimationFrame(() => {
                this.container.scrollTop = 0;
            });
        }
        
        let html = '';
        visibleItems.forEach(stream => {
            const playingClass = this.currentPlayingStreamId === stream.stream_id ? 'playing' : '';
            
            // Check if stream is favorited
            const isFavorite = this.favoritesService ? this.favoritesService.isFavorite(stream.stream_id) : false;
            const starClass = isFavorite ? 'favorite-star favorited' : 'favorite-star';
            const starIcon = isFavorite ? '★' : '☆';
            
            html += this.buildStreamItemHtml(stream, playingClass, isFavorite, starClass, starIcon);
        });
        
        // Add loading indicator if there are more items and we're loading
        if (hasMore && this.isLoading) {
            html += `
                <div class="load-more-container">
                    <div class="loading">Loading more streams...</div>
                </div>
            `;
        }
        
        this.container.innerHTML = html;
        
        // Add click listeners
        this.container.querySelectorAll('.watch-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onWatchStream) {
                    const streamId = btn.dataset.streamId;
                    const streamName = btn.dataset.streamName;
                    // Find the stream object to get catchup info
                    const stream = this.allStreams.find(s => s.stream_id == streamId);
                    const tvArchive = stream ? stream.tv_archive : null;
                    const tvArchiveDuration = stream ? stream.tv_archive_duration : null;
                    this.onWatchStream(streamId, streamName, tvArchive, tvArchiveDuration);
                }
            });
        });

        // Add click listeners for favorite stars
        this.container.querySelectorAll('.favorite-star').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleFavoriteToggle(btn.dataset.streamId, btn);
            });
        });
        
        this.container.querySelectorAll('.clickable-stream').forEach(item => {
            item.addEventListener('click', () => {
                if (this.onWatchStream) {
                    const streamId = item.dataset.streamId;
                    const streamName = item.dataset.streamName;
                    // Find the stream object to get catchup info
                    const stream = this.allStreams.find(s => s.stream_id == streamId);
                    const tvArchive = stream ? stream.tv_archive : null;
                    const tvArchiveDuration = stream ? stream.tv_archive_duration : null;
                    this.onWatchStream(streamId, streamName, tvArchive, tvArchiveDuration);
                }
            });
        });
        
        // Update panel header
        const panelTitle = document.querySelector('.right-panel .panel-title');
        if (panelTitle) {
            const displayText = this.currentSearchTerm 
                ? `Streams - ${this.currentCategoryName} (${this.filteredStreams.length} filtered)`
                : `Streams - ${this.currentCategoryName} (${this.filteredStreams.length})`;
            panelTitle.textContent = displayText;
        }
    }

    loadMore() {
        // This method is kept for backward compatibility but now just calls loadMoreAutomatically
        this.loadMoreAutomatically();
    }

    showLoading(message) {
        this.container.innerHTML = `<div class="loading">${message}</div>`;
    }

    showError(message) {
        this.container.innerHTML = `<div class="error">${message}</div>`;
    }

    filter(searchTerm) {
        const term = searchTerm.trim().toLowerCase();
        this.currentSearchTerm = term;
        
        // Reset loading state and visible count when filtering
        this.isLoading = false;
        this.visibleStreams = 30;
        
        // Apply search filter to original streams
        if (!term) {
            // No search term - show all streams (with marker filter applied)
            this.filteredStreams = this.filterMarkers
                ? this.allStreams.filter(stream => {
                    const name = stream.name || '';
                    return !name.trim().startsWith('###');
                })
                : this.allStreams;
        } else {
            // Apply both search and marker filters
            this.filteredStreams = this.allStreams.filter(stream => {
                const name = stream.name ? stream.name.toLowerCase() : '';
                const matchesSearch = name.includes(term);
                const matchesMarkerFilter = !this.filterMarkers || !name.trim().startsWith('###');
                return matchesSearch && matchesMarkerFilter;
            });
        }
        
        // Re-render with filtered results
        this.renderCurrentState();
        
        return this.filteredStreams;
    }

    highlightPlayingStream(streamId) {
        // Update currently playing stream
        this.currentPlayingStreamId = streamId;
        
        // Remove playing class from all streams and reset all button text
        this.container.querySelectorAll('.stream-item').forEach(item => {
            item.classList.remove('playing');
            const watchBtn = item.querySelector('.watch-btn');
            if (watchBtn) {
                watchBtn.textContent = 'Watch';
            }
        });
        
        // Add playing class to current stream
        const playingStream = this.container.querySelector(`[data-stream-id="${streamId}"]`);
        if (playingStream) {
            playingStream.classList.add('playing');
            const watchBtn = playingStream.querySelector('.watch-btn');
            if (watchBtn) {
                watchBtn.textContent = 'Now Playing';
            }
        }
    }

    clearPlayingHighlight() {
        this.currentPlayingStreamId = null;
        this.container.querySelectorAll('.stream-item').forEach(item => {
            item.classList.remove('playing');
            const watchBtn = item.querySelector('.watch-btn');
            if (watchBtn) {
                watchBtn.textContent = 'Watch';
            }
        });
    }

    async handleFavoriteToggle(streamId, buttonElement) {
        logger.log(`🌟 FAVORITE TOGGLE: StreamId=${streamId} (${typeof streamId}), Service=${!!this.favoritesService}`);
        
        if (!this.favoritesService) {
            logger.warn('Favorites service not available');
            return;
        }

        try {
            const beforeState = this.favoritesService.isFavorite(streamId);
            logger.log(`🌟 Before toggle: ${beforeState}`);
            
            const isFavorite = await this.favoritesService.toggleFavorite(streamId);
            logger.log(`🌟 After toggle: ${isFavorite}`);
            logger.log(`🌟 All favorites now:`, this.favoritesService.getFavorites());
            
            this.updateFavoriteButton(buttonElement, isFavorite);
            
            // Notify app about favorite change
            if (this.onFavoriteToggle) {
                this.onFavoriteToggle(streamId, isFavorite);
            }
        } catch (error) {
            logger.error('Failed to toggle favorite:', error);
        }
    }

    updateFavoriteButton(buttonElement, isFavorite) {
        if (isFavorite) {
            buttonElement.classList.add('favorited');
            buttonElement.textContent = '★';
            buttonElement.title = 'Remove from favorites';
        } else {
            buttonElement.classList.remove('favorited');
            buttonElement.textContent = '☆';
            buttonElement.title = 'Add to favorites';
        }
    }

    // Update all favorite stars for a specific stream (used when favorite changes from video player)
    updateStreamFavoriteStatus(streamId, isFavorite) {
        const streamItems = this.container.querySelectorAll(`[data-stream-id="${streamId}"]`);
        streamItems.forEach(item => {
            const favoriteBtn = item.querySelector('.favorite-star');
            if (favoriteBtn) {
                this.updateFavoriteButton(favoriteBtn, isFavorite);
            }
        });
    }
}

