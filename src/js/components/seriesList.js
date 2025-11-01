// Series List Component

import { escapeHtml } from '../utils/domHelpers.js';
import { logger } from '../utils/logger.js';

export class SeriesList {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.allSeries = []; // Original unfiltered series
        this.filteredSeries = []; // Currently filtered series
        this.visibleSeries = 30;
        this.currentCategoryName = 'All Series';
        this.isLoading = false;
        this.infiniteScrollEnabled = true;
        this.currentSearchTerm = ''; // Track current search
        this.renderRequestId = 0; // Prevent race conditions
        this.isDestroyed = false; // Track component lifecycle
        this.favoritesService = null; // Will be set by app
        this.onSeriesClick = null; // Callback for series click
        this.onFavoriteToggle = null; // Callback for favorite toggle
        
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
        
        // Use the current filtered series, not recalculated ones
        const hasMore = this.filteredSeries.length > this.visibleSeries;
        
        if (hasMore) {
            this.isLoading = true;
            const previousVisible = this.visibleSeries;
            this.visibleSeries += 30;
            
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
        this.visibleSeries = 30;
        this.isLoading = false;
    }

    clear() {
        this.container.innerHTML = '';
        this.allSeries = [];
        this.filteredSeries = [];
        this.visibleSeries = 30;
        this.currentSearchTerm = '';
        this.isLoading = false;
    }

    // Cleanup method
    destroy() {
        this.isDestroyed = true;
        this.isLoading = false;
    }

    setOnSeriesClick(callback) {
        this.onSeriesClick = callback;
    }

    setFavoritesService(favoritesService) {
        this.favoritesService = favoritesService;
        logger.log('SeriesList: Favorites service set:', !!favoritesService);
    }

    setOnFavoriteToggle(callback) {
        this.onFavoriteToggle = callback;
    }

    render(series, categoryName) {
        // Generate unique request ID to prevent race conditions
        const requestId = ++this.renderRequestId;
        
        this.currentCategoryName = categoryName;
        
        // Store original series
        this.allSeries = series || [];
        this.filteredSeries = series || [];

        // Apply search filter if there's an active search
        if (this.currentSearchTerm) {
            this.filteredSeries = this.filteredSeries.filter(s => {
                const name = s.name ? s.name.toLowerCase() : '';
                return name.includes(this.currentSearchTerm.toLowerCase());
            });
        }
        
        // Reset scroll position to top when rendering new series
        if (this.container) {
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
        const panelTitle = document.querySelector('.series-right-panel .panel-title');
        if (panelTitle) {
            const displayText = this.currentSearchTerm 
                ? `Series - ${categoryName} (${this.filteredSeries.length} filtered)`
                : `Series - ${categoryName} (${this.filteredSeries.length})`;
            panelTitle.textContent = displayText;
        }
        
        // Lazy load: only show first visibleSeries items
        const visibleItems = this.filteredSeries.slice(0, this.visibleSeries);
        const hasMore = this.filteredSeries.length > this.visibleSeries;
        
        let html = '<div class="series-grid">';
        visibleItems.forEach(s => {
            const coverUrl = s.cover || s.cover_big || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect fill="%23404040" width="200" height="300"/%3E%3C/svg%3E';
            const rating = s.rating || s.rating_5based || 'N/A';
            const year = s.releaseDate ? s.releaseDate.substring(0, 4) : '';
            
            // Check if series is favorited
            const isFavorite = this.favoritesService ? this.favoritesService.isSeriesFavorite(s.series_id) : false;
            const starClass = isFavorite ? 'series-favorite-star favorited' : 'series-favorite-star';
            const starIcon = isFavorite ? '★' : '☆';
            
            html += `
                <div class="series-card" data-series-id="${s.series_id}">
                    <div class="series-cover-container">
                        <img src="${escapeHtml(coverUrl)}" class="series-cover" alt="${escapeHtml(s.name)}" loading="lazy">
                        <button class="${starClass}" data-series-id="${s.series_id}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                            ${starIcon}
                        </button>
                    </div>
                    <div class="series-info">
                        <div class="series-name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>
                        <div class="series-meta">
                            <span class="series-year">${year}</span>
                            ${rating !== 'N/A' ? `<span class="series-rating">⭐ ${rating}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        // Add loading indicator if there are more items and we're loading
        if (hasMore && this.isLoading) {
            html += `
                <div class="load-more-container">
                    <div class="loading">Loading more series...</div>
                </div>
            `;
        }
        
        this.container.innerHTML = html;
        
        // Add click listeners for series cards
        this.container.querySelectorAll('.series-card').forEach(card => {
            // Click on card itself (not on favorite star)
            card.addEventListener('click', (e) => {
                // Don't trigger if clicking on favorite star
                if (e.target.closest('.series-favorite-star')) return;
                
                if (this.onSeriesClick) {
                    this.onSeriesClick(card.dataset.seriesId);
                }
            });
        });

        // Add click listeners for favorite stars
        this.container.querySelectorAll('.series-favorite-star').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleFavoriteToggle(btn.dataset.seriesId, btn);
            });
        });
    }

    renderAdditionalItems(startIndex) {
        // Safety check
        if (this.isDestroyed || !this.container) return;
        
        // Render additional items for infinite scroll without full re-render
        const endIndex = Math.min(this.visibleSeries, this.filteredSeries.length);
        const additionalItems = this.filteredSeries.slice(startIndex, endIndex);
        
        if (additionalItems.length === 0) return;
        
        let html = '';
        additionalItems.forEach(s => {
            const coverUrl = s.cover || s.cover_big || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect fill="%23404040" width="200" height="300"/%3E%3C/svg%3E';
            const rating = s.rating || s.rating_5based || 'N/A';
            const year = s.releaseDate ? s.releaseDate.substring(0, 4) : '';
            
            // Check if series is favorited
            const isFavorite = this.favoritesService ? this.favoritesService.isSeriesFavorite(s.series_id) : false;
            const starClass = isFavorite ? 'series-favorite-star favorited' : 'series-favorite-star';
            const starIcon = isFavorite ? '★' : '☆';
            
            html += `
                <div class="series-card" data-series-id="${s.series_id}">
                    <div class="series-cover-container">
                        <img src="${escapeHtml(coverUrl)}" class="series-cover" alt="${escapeHtml(s.name)}" loading="lazy">
                        <button class="${starClass}" data-series-id="${s.series_id}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                            ${starIcon}
                        </button>
                    </div>
                    <div class="series-info">
                        <div class="series-name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>
                        <div class="series-meta">
                            <span class="series-year">${year}</span>
                            ${rating !== 'N/A' ? `<span class="series-rating">⭐ ${rating}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        
        // Remove any existing loading indicator
        const loadingContainer = this.container.querySelector('.load-more-container');
        if (loadingContainer) {
            loadingContainer.remove();
        }
        
        // Find the series-grid container and append new items
        const gridContainer = this.container.querySelector('.series-grid');
        if (gridContainer) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            while (tempDiv.firstChild) {
                gridContainer.appendChild(tempDiv.firstChild);
            }
        }
        
        // Add event listeners to new items
        const newCards = this.container.querySelectorAll('.series-card:not([data-listeners-added])');
        newCards.forEach(card => {
            card.setAttribute('data-listeners-added', 'true');
            
            card.addEventListener('click', (e) => {
                // Don't trigger if clicking on favorite star
                if (e.target.closest('.series-favorite-star')) return;
                
                if (this.onSeriesClick) {
                    this.onSeriesClick(card.dataset.seriesId);
                }
            });

            const favoriteBtn = card.querySelector('.series-favorite-star');
            if (favoriteBtn) {
                favoriteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleFavoriteToggle(favoriteBtn.dataset.seriesId, favoriteBtn);
                });
            }
        });
        
        // Add loading indicator if there are still more items
        const hasMore = this.filteredSeries.length > this.visibleSeries;
        if (hasMore && this.isLoading) {
            const loadingHtml = `
                <div class="load-more-container">
                    <div class="loading">Loading more series...</div>
                </div>
            `;
            this.container.insertAdjacentHTML('beforeend', loadingHtml);
        }
    }

    renderCurrentState() {
        // Re-render with current filtered series and visible count
        const visibleItems = this.filteredSeries.slice(0, this.visibleSeries);
        const hasMore = this.filteredSeries.length > this.visibleSeries;
        
        // Reset scroll position to top
        if (this.container) {
            requestAnimationFrame(() => {
                this.container.scrollTop = 0;
            });
        }
        
        let html = '<div class="series-grid">';
        visibleItems.forEach(s => {
            const coverUrl = s.cover || s.cover_big || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect fill="%23404040" width="200" height="300"/%3E%3C/svg%3E';
            const rating = s.rating || s.rating_5based || 'N/A';
            const year = s.releaseDate ? s.releaseDate.substring(0, 4) : '';
            
            // Check if series is favorited
            const isFavorite = this.favoritesService ? this.favoritesService.isSeriesFavorite(s.series_id) : false;
            const starClass = isFavorite ? 'series-favorite-star favorited' : 'series-favorite-star';
            const starIcon = isFavorite ? '★' : '☆';
            
            html += `
                <div class="series-card" data-series-id="${s.series_id}">
                    <div class="series-cover-container">
                        <img src="${escapeHtml(coverUrl)}" class="series-cover" alt="${escapeHtml(s.name)}" loading="lazy">
                        <button class="${starClass}" data-series-id="${s.series_id}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                            ${starIcon}
                        </button>
                    </div>
                    <div class="series-info">
                        <div class="series-name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>
                        <div class="series-meta">
                            <span class="series-year">${year}</span>
                            ${rating !== 'N/A' ? `<span class="series-rating">⭐ ${rating}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        // Add loading indicator if there are more items and we're loading
        if (hasMore && this.isLoading) {
            html += `
                <div class="load-more-container">
                    <div class="loading">Loading more series...</div>
                </div>
            `;
        }
        
        this.container.innerHTML = html;
        
        // Add click listeners
        this.container.querySelectorAll('.series-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.series-favorite-star')) return;
                
                if (this.onSeriesClick) {
                    this.onSeriesClick(card.dataset.seriesId);
                }
            });
        });

        this.container.querySelectorAll('.series-favorite-star').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleFavoriteToggle(btn.dataset.seriesId, btn);
            });
        });
        
        // Update panel header
        const panelTitle = document.querySelector('.series-right-panel .panel-title');
        if (panelTitle) {
            const displayText = this.currentSearchTerm 
                ? `Series - ${this.currentCategoryName} (${this.filteredSeries.length} filtered)`
                : `Series - ${this.currentCategoryName} (${this.filteredSeries.length})`;
            panelTitle.textContent = displayText;
        }
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
        this.visibleSeries = 30;
        
        // Apply search filter to original series
        if (!term) {
            // No search term - show all series
            this.filteredSeries = this.allSeries;
        } else {
            // Apply search filter
            this.filteredSeries = this.allSeries.filter(s => {
                const name = s.name ? s.name.toLowerCase() : '';
                return name.includes(term);
            });
        }
        
        // Re-render with filtered results
        this.renderCurrentState();
        
        return this.filteredSeries;
    }

    async handleFavoriteToggle(seriesId, buttonElement) {
        logger.log(`🌟 SERIES FAVORITE TOGGLE: SeriesId=${seriesId} (${typeof seriesId}), Service=${!!this.favoritesService}`);
        
        if (!this.favoritesService) {
            logger.warn('Favorites service not available');
            return;
        }

        try {
            const beforeState = this.favoritesService.isSeriesFavorite(seriesId);
            logger.log(`🌟 Before toggle: ${beforeState}`);
            
            const isFavorite = await this.favoritesService.toggleSeriesFavorite(seriesId);
            logger.log(`🌟 After toggle: ${isFavorite}`);
            logger.log(`🌟 All series favorites now:`, this.favoritesService.getSeriesFavorites());
            
            this.updateFavoriteButton(buttonElement, isFavorite);
            
            // Notify app about favorite change
            if (this.onFavoriteToggle) {
                this.onFavoriteToggle(seriesId, isFavorite);
            }
        } catch (error) {
            logger.error('Failed to toggle series favorite:', error);
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

    // Update all favorite stars for a specific series
    updateSeriesFavoriteStatus(seriesId, isFavorite) {
        const seriesCards = this.container.querySelectorAll(`[data-series-id="${seriesId}"]`);
        seriesCards.forEach(card => {
            const favoriteBtn = card.querySelector('.series-favorite-star');
            if (favoriteBtn) {
                this.updateFavoriteButton(favoriteBtn, isFavorite);
            }
        });
    }
}
