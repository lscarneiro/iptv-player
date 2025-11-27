// VOD List Component

import { escapeHtml } from '../utils/domHelpers.js';
import { logger } from '../utils/logger.js';

export class VodList {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.allMovies = []; // Original unfiltered movies
        this.filteredMovies = []; // Currently filtered movies
        this.visibleMovies = 30;
        this.currentCategoryName = 'All Movies';
        this.isLoading = false;
        this.infiniteScrollEnabled = true;
        this.currentSearchTerm = ''; // Track current search
        this.renderRequestId = 0; // Prevent race conditions
        this.isDestroyed = false; // Track component lifecycle
        this.favoritesService = null; // Will be set by app
        this.onMovieClick = null; // Callback for movie click
        this.onFavoriteToggle = null; // Callback for favorite toggle
        this.onRemoveFromResume = null; // Callback for removing from resume watching
        
        this.setupInfiniteScroll();
    }

    setupInfiniteScroll() {
        const contentArea = this.container;
        if (!contentArea) return;

        let scrollTimeout;
        contentArea.addEventListener('scroll', () => {
            if (scrollTimeout) return;
            
            scrollTimeout = setTimeout(() => {
                scrollTimeout = null;
                
                if (this.isLoading || !this.infiniteScrollEnabled) return;
                
                const { scrollTop, scrollHeight, clientHeight } = contentArea;
                const threshold = 200;
                
                if (scrollTop + clientHeight >= scrollHeight - threshold) {
                    this.loadMoreAutomatically();
                }
            }, 50);
        });
    }

    loadMoreAutomatically() {
        if (this.isDestroyed || this.isLoading || !this.infiniteScrollEnabled) {
            return;
        }
        
        const hasMore = this.filteredMovies.length > this.visibleMovies;
        
        if (hasMore) {
            this.isLoading = true;
            const previousVisible = this.visibleMovies;
            this.visibleMovies += 30;
            
            this.renderAdditionalItems(previousVisible);
            
            setTimeout(() => {
                if (!this.isDestroyed) {
                    this.isLoading = false;
                }
            }, 100);
        }
    }

    setInfiniteScrollEnabled(enabled) {
        this.infiniteScrollEnabled = enabled;
    }

    shouldContinueOperation(requestId = null) {
        if (this.isDestroyed) return false;
        if (requestId !== null && requestId !== this.renderRequestId) return false;
        return true;
    }

    resetSearch() {
        this.currentSearchTerm = '';
        this.visibleMovies = 30;
        this.isLoading = false;
    }

    clear() {
        this.container.innerHTML = '';
        this.allMovies = [];
        this.filteredMovies = [];
        this.visibleMovies = 30;
        this.currentSearchTerm = '';
        this.isLoading = false;
    }

    destroy() {
        this.isDestroyed = true;
        this.isLoading = false;
    }

    setOnMovieClick(callback) {
        this.onMovieClick = callback;
    }

    setFavoritesService(favoritesService) {
        this.favoritesService = favoritesService;
        logger.log('VodList: Favorites service set:', !!favoritesService);
    }

    setOnFavoriteToggle(callback) {
        this.onFavoriteToggle = callback;
    }

    render(movies, categoryName) {
        const requestId = ++this.renderRequestId;
        
        this.currentCategoryName = categoryName;
        
        this.allMovies = movies || [];
        this.filteredMovies = movies || [];

        if (this.currentSearchTerm) {
            this.filteredMovies = this.filteredMovies.filter(m => {
                const name = m.name ? m.name.toLowerCase() : '';
                return name.includes(this.currentSearchTerm.toLowerCase());
            });
        }
        
        if (this.container) {
            requestAnimationFrame(() => {
                this.container.scrollTop = 0;
            });
        }
        
        if (!this.shouldContinueOperation(requestId)) {
            logger.log('Render request outdated or component destroyed, skipping');
            return;
        }
        
        const panelTitle = document.querySelector('.vod-right-panel .panel-title');
        if (panelTitle) {
            const displayText = this.currentSearchTerm 
                ? `Movies - ${categoryName} (${this.filteredMovies.length} filtered)`
                : `Movies - ${categoryName} (${this.filteredMovies.length})`;
            panelTitle.textContent = displayText;
        }
        
        const visibleItems = this.filteredMovies.slice(0, this.visibleMovies);
        const hasMore = this.filteredMovies.length > this.visibleMovies;
        
        let html = '<div class="vod-grid">';
        visibleItems.forEach(m => {
            const coverUrl = m.stream_icon || m.cover || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect fill="%23404040" width="200" height="300"/%3E%3C/svg%3E';
            const rating = m.rating || m.rating_5based || 'N/A';
            const year = m.releaseDate ? m.releaseDate.substring(0, 4) : '';
            
            const isFavorite = this.favoritesService ? this.favoritesService.isVodFavorite(m.stream_id) : false;
            const starClass = isFavorite ? 'vod-favorite-star favorited' : 'vod-favorite-star';
            const starIcon = isFavorite ? '★' : '☆';
            
            html += `
                <div class="vod-card" data-movie-id="${m.stream_id}">
                    <div class="vod-cover-container">
                        <img src="${escapeHtml(coverUrl)}" class="vod-cover" alt="${escapeHtml(m.name)}" loading="lazy">
                        <button class="${starClass}" data-movie-id="${m.stream_id}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                            ${starIcon}
                        </button>
                    </div>
                    <div class="vod-info">
                        <div class="vod-name" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</div>
                        <div class="vod-meta">
                            <span class="vod-year">${year}</span>
                            ${rating !== 'N/A' ? `<span class="vod-rating">⭐ ${rating}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        if (hasMore && this.isLoading) {
            html += `
                <div class="load-more-container">
                    <div class="loading">Loading more movies...</div>
                </div>
            `;
        }
        
        this.container.innerHTML = html;
        
        this.container.querySelectorAll('.vod-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.vod-favorite-star')) return;
                
                if (this.onMovieClick) {
                    this.onMovieClick(card.dataset.movieId);
                }
            });
        });

        this.container.querySelectorAll('.vod-favorite-star').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleFavoriteToggle(btn.dataset.movieId, btn);
            });
        });
    }

    renderAdditionalItems(startIndex) {
        if (this.isDestroyed || !this.container) return;
        
        const endIndex = Math.min(this.visibleMovies, this.filteredMovies.length);
        const additionalItems = this.filteredMovies.slice(startIndex, endIndex);
        
        if (additionalItems.length === 0) return;
        
        let html = '';
        additionalItems.forEach(m => {
            const coverUrl = m.stream_icon || m.cover || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect fill="%23404040" width="200" height="300"/%3E%3C/svg%3E';
            const rating = m.rating || m.rating_5based || 'N/A';
            const year = m.releaseDate ? m.releaseDate.substring(0, 4) : '';
            
            const isFavorite = this.favoritesService ? this.favoritesService.isVodFavorite(m.stream_id) : false;
            const starClass = isFavorite ? 'vod-favorite-star favorited' : 'vod-favorite-star';
            const starIcon = isFavorite ? '★' : '☆';
            
            html += `
                <div class="vod-card" data-movie-id="${m.stream_id}">
                    <div class="vod-cover-container">
                        <img src="${escapeHtml(coverUrl)}" class="vod-cover" alt="${escapeHtml(m.name)}" loading="lazy">
                        <button class="${starClass}" data-movie-id="${m.stream_id}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                            ${starIcon}
                        </button>
                    </div>
                    <div class="vod-info">
                        <div class="vod-name" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</div>
                        <div class="vod-meta">
                            <span class="vod-year">${year}</span>
                            ${rating !== 'N/A' ? `<span class="vod-rating">⭐ ${rating}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        
        const loadingContainer = this.container.querySelector('.load-more-container');
        if (loadingContainer) {
            loadingContainer.remove();
        }
        
        const gridContainer = this.container.querySelector('.vod-grid');
        if (gridContainer) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            while (tempDiv.firstChild) {
                gridContainer.appendChild(tempDiv.firstChild);
            }
        }
        
        const newCards = this.container.querySelectorAll('.vod-card:not([data-listeners-added])');
        newCards.forEach(card => {
            card.setAttribute('data-listeners-added', 'true');
            
            card.addEventListener('click', (e) => {
                if (e.target.closest('.vod-favorite-star')) return;
                
                if (this.onMovieClick) {
                    this.onMovieClick(card.dataset.movieId);
                }
            });

            const favoriteBtn = card.querySelector('.vod-favorite-star');
            if (favoriteBtn) {
                favoriteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleFavoriteToggle(favoriteBtn.dataset.movieId, favoriteBtn);
                });
            }
        });
        
        const hasMore = this.filteredMovies.length > this.visibleMovies;
        if (hasMore && this.isLoading) {
            const loadingHtml = `
                <div class="load-more-container">
                    <div class="loading">Loading more movies...</div>
                </div>
            `;
            this.container.insertAdjacentHTML('beforeend', loadingHtml);
        }
    }

    renderCurrentState() {
        const visibleItems = this.filteredMovies.slice(0, this.visibleMovies);
        const hasMore = this.filteredMovies.length > this.visibleMovies;
        
        if (this.container) {
            requestAnimationFrame(() => {
                this.container.scrollTop = 0;
            });
        }
        
        let html = '<div class="vod-grid">';
        visibleItems.forEach(m => {
            const coverUrl = m.stream_icon || m.cover || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect fill="%23404040" width="200" height="300"/%3E%3C/svg%3E';
            const rating = m.rating || m.rating_5based || 'N/A';
            const year = m.releaseDate ? m.releaseDate.substring(0, 4) : '';
            
            const isFavorite = this.favoritesService ? this.favoritesService.isVodFavorite(m.stream_id) : false;
            const starClass = isFavorite ? 'vod-favorite-star favorited' : 'vod-favorite-star';
            const starIcon = isFavorite ? '★' : '☆';
            
            html += `
                <div class="vod-card" data-movie-id="${m.stream_id}">
                    <div class="vod-cover-container">
                        <img src="${escapeHtml(coverUrl)}" class="vod-cover" alt="${escapeHtml(m.name)}" loading="lazy">
                        <button class="${starClass}" data-movie-id="${m.stream_id}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                            ${starIcon}
                        </button>
                    </div>
                    <div class="vod-info">
                        <div class="vod-name" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</div>
                        <div class="vod-meta">
                            <span class="vod-year">${year}</span>
                            ${rating !== 'N/A' ? `<span class="vod-rating">⭐ ${rating}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        
        if (hasMore && this.isLoading) {
            html += `
                <div class="load-more-container">
                    <div class="loading">Loading more movies...</div>
                </div>
            `;
        }
        
        this.container.innerHTML = html;
        
        this.container.querySelectorAll('.vod-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.vod-favorite-star')) return;
                
                if (this.onMovieClick) {
                    this.onMovieClick(card.dataset.movieId);
                }
            });
        });

        this.container.querySelectorAll('.vod-favorite-star').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleFavoriteToggle(btn.dataset.movieId, btn);
            });
        });
        
        const panelTitle = document.querySelector('.vod-right-panel .panel-title');
        if (panelTitle) {
            const displayText = this.currentSearchTerm 
                ? `Movies - ${this.currentCategoryName} (${this.filteredMovies.length} filtered)`
                : `Movies - ${this.currentCategoryName} (${this.filteredMovies.length})`;
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
        
        this.isLoading = false;
        this.visibleMovies = 30;
        
        if (!term) {
            this.filteredMovies = this.allMovies;
        } else {
            this.filteredMovies = this.allMovies.filter(m => {
                const name = m.name ? m.name.toLowerCase() : '';
                return name.includes(term);
            });
        }
        
        this.renderCurrentState();
        
        return this.filteredMovies;
    }

    async handleFavoriteToggle(movieId, buttonElement) {
        logger.log(`🌟 VOD FAVORITE TOGGLE: MovieId=${movieId} (${typeof movieId}), Service=${!!this.favoritesService}`);
        
        if (!this.favoritesService) {
            logger.warn('Favorites service not available');
            return;
        }

        try {
            const beforeState = this.favoritesService.isVodFavorite(movieId);
            logger.log(`🌟 Before toggle: ${beforeState}`);
            
            const isFavorite = await this.favoritesService.toggleVodFavorite(movieId);
            logger.log(`🌟 After toggle: ${isFavorite}`);
            
            this.updateFavoriteButton(buttonElement, isFavorite);
            
            if (this.onFavoriteToggle) {
                this.onFavoriteToggle(movieId, isFavorite);
            }
        } catch (error) {
            logger.error('Failed to toggle VOD favorite:', error);
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

    updateMovieFavoriteStatus(movieId, isFavorite) {
        const movieCards = this.container.querySelectorAll(`[data-movie-id="${movieId}"]`);
        movieCards.forEach(card => {
            const favoriteBtn = card.querySelector('.vod-favorite-star');
            if (favoriteBtn) {
                this.updateFavoriteButton(favoriteBtn, isFavorite);
            }
        });
    }

    setOnRemoveFromResume(callback) {
        this.onRemoveFromResume = callback;
    }

    renderResumeWatching(resumeItems) {
        this.currentCategoryName = 'Resume Watching';
        
        // Filter out invalid items - ensure we only show items with valid playhead data
        const validResumeItems = resumeItems.filter(item => {
            // Must have movieId
            if (!item.movieId) return false;
            
            // Must have valid position and duration
            if (!item.position || !item.duration || 
                typeof item.position !== 'number' || 
                typeof item.duration !== 'number' ||
                isNaN(item.position) || isNaN(item.duration)) {
                return false;
            }
            
            // Position must be > 30 seconds and < 95% of duration
            const percentWatched = item.duration > 0 ? (item.position / item.duration) * 100 : 0;
            if (item.position <= 30 || percentWatched >= 95) {
                return false;
            }
            
            // Must have movieData with a name
            if (!item.movieData || !item.movieData.name || item.movieData.name === 'Unknown') {
                return false;
            }
            
            return true;
        });
        
        // Update panel header
        const panelTitle = document.querySelector('.vod-right-panel .panel-title');
        if (panelTitle) {
            panelTitle.textContent = `Movies - Resume Watching (${validResumeItems.length})`;
        }
        
        // Reset scroll position
        if (this.container) {
            requestAnimationFrame(() => {
                this.container.scrollTop = 0;
            });
        }
        
        let html = '<div class="vod-grid">';
        
        validResumeItems.forEach(item => {
            const movieData = item.movieData;
            const percentWatched = item.duration > 0 ? Math.round((item.position / item.duration) * 100) : 0;
            const formattedPosition = this.formatTime(item.position);
            const coverUrl = movieData.cover || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300"%3E%3Crect fill="%23404040" width="200" height="300"/%3E%3C/svg%3E';
            
            html += `
                <div class="vod-card resume-card" data-movie-id="${item.movieId}">
                    <div class="vod-cover-container">
                        <img src="${escapeHtml(coverUrl)}" class="vod-cover" alt="${escapeHtml(movieData.name || 'Movie')}" loading="lazy">
                        <div class="vod-progress-bar">
                            <div class="vod-progress-fill" style="width: ${percentWatched}%"></div>
                        </div>
                        <button class="vod-remove-resume" data-movie-id="${item.movieId}" title="Remove from Resume Watching">
                            ✕
                        </button>
                    </div>
                    <div class="vod-info">
                        <div class="vod-name" title="${escapeHtml(movieData.name)}">${escapeHtml(movieData.name)}</div>
                        <div class="vod-meta">
                            <span class="vod-resume-time">${percentWatched}% • ${formattedPosition}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        
        if (validResumeItems.length === 0) {
            html = '<div class="empty-state">No movies in progress. Start watching to see them here.</div>';
        }
        
        this.container.innerHTML = html;
        
        // Add click listeners
        this.container.querySelectorAll('.vod-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't trigger if clicking remove button
                if (e.target.closest('.vod-remove-resume')) return;
                
                if (this.onMovieClick) {
                    this.onMovieClick(card.dataset.movieId);
                }
            });
        });
        
        // Add remove button listeners
        this.container.querySelectorAll('.vod-remove-resume').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onRemoveFromResume) {
                    this.onRemoveFromResume(btn.dataset.movieId);
                }
            });
        });
    }

    formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}
