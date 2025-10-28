// Stream List Component

import { escapeHtml, scrollToTop } from '../utils/domHelpers.js';

export class StreamList {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.allStreams = [];
        this.visibleStreams = 50;
        this.currentPlayingStreamId = null;
        this.filterMarkers = true;
        this.currentCategoryName = 'All Channels';
        this.isLoading = false;
        this.infiniteScrollEnabled = true;
        
        this.setupInfiniteScroll();
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
                // console.log('Scroll check:', { scrollTop, scrollHeight, clientHeight, threshold });
                
                if (scrollTop + clientHeight >= scrollHeight - threshold) {
                    this.loadMoreAutomatically();
                }
            }, 50); // Throttle to 50ms
        });
    }

    loadMoreAutomatically() {
        const filteredStreams = this.getFilteredStreams();
        const hasMore = filteredStreams.length > this.visibleStreams;
        
        if (hasMore && !this.isLoading) {
            this.isLoading = true;
            this.visibleStreams += 50;
            
            // Re-render with updated visibleStreams
            this.render(filteredStreams, this.currentCategoryName);
            
            // Reset loading state after a short delay
            setTimeout(() => {
                this.isLoading = false;
            }, 100);
        }
    }

    // Method to enable/disable infinite scroll
    setInfiniteScrollEnabled(enabled) {
        this.infiniteScrollEnabled = enabled;
    }

    setOnWatchStream(callback) {
        this.onWatchStream = callback;
    }

    setFilterMarkers(value) {
        this.filterMarkers = value;
    }

    getFilteredStreams() {
        return this.allStreams.filter(stream => {
            if (!this.filterMarkers) return true;
            const name = stream.name || '';
            return !name.trim().startsWith('###');
        });
    }

    render(streams, categoryName) {
        this.currentCategoryName = categoryName;
        
        // Apply marker filter
        const filteredStreams = this.filterMarkers
            ? streams.filter(stream => {
                const name = stream.name || '';
                return !name.trim().startsWith('###');
            })
            : streams;

        this.allStreams = filteredStreams;
        
        // Reset scroll position to top when rendering new streams (important for mobile)
        if (this.container) {
            // Use requestAnimationFrame to ensure DOM has been updated before scrolling
            requestAnimationFrame(() => {
                scrollToTop(this.container);
            });
        }
        
        // Update panel header with category name and count
        const panelTitle = document.querySelector('.right-panel .panel-title');
        if (panelTitle) {
            panelTitle.textContent = `Streams - ${categoryName} (${filteredStreams.length})`;
        }
        
        // Lazy load: only show first visibleStreams items
        const visibleItems = filteredStreams.slice(0, this.visibleStreams);
        const hasMore = filteredStreams.length > this.visibleStreams;
        
        let html = '';
        visibleItems.forEach(stream => {
            const iconHtml = stream.stream_icon ? 
                `<img src="${escapeHtml(stream.stream_icon)}" class="stream-icon" alt="Channel icon" onerror="this.style.display='none'">` : 
                '<div class="stream-icon" style="background-color: #404040;"></div>';
            
            // Add playing class if this is the currently playing stream
            const playingClass = this.currentPlayingStreamId === stream.stream_id ? 'playing' : '';
            
            html += `
                <div class="stream-item clickable-stream ${playingClass}" data-stream-id="${stream.stream_id}" data-stream-name="${escapeHtml(stream.name)}">
                    ${iconHtml}
                    <div class="stream-info">
                        <div class="stream-name">${escapeHtml(stream.name)}</div>
                        <div class="stream-id">ID: ${stream.stream_id}</div>
                    </div>
                    <button class="watch-btn" data-stream-id="${stream.stream_id}" data-stream-name="${escapeHtml(stream.name)}">
                        ${playingClass ? 'Now Playing' : 'Watch'}
                    </button>
                </div>
            `;
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
        
        // Add click listeners for entire stream rows
        this.container.querySelectorAll('.clickable-stream').forEach(item => {
            item.addEventListener('click', () => {
                if (this.onWatchStream) {
                    this.onWatchStream(item.dataset.streamId, item.dataset.streamName);
                }
            });
        });
        
        // Infinite scroll handles loading automatically - no manual button needed
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
        
        // Reset loading state when filtering
        this.isLoading = false;
        
        if (!term) {
            // Reset to initial state
            this.visibleStreams = 50;
            return;
        }
        
        // Filter based on search term
        const filtered = this.allStreams.filter(stream => {
            const name = stream.name ? stream.name.toLowerCase() : '';
            return name.includes(term);
        });
        
        // Show all filtered results when searching
        this.visibleStreams = Math.max(50, filtered.length);
        return filtered;
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
}

