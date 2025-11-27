// VOD Info Panel Component

import { escapeHtml } from '../utils/domHelpers.js';
import { logger } from '../utils/logger.js';

export class VodInfoPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentMovieInfo = null;
        this.onPlayMovie = null; // Callback for movie play
        this.onClose = null; // Callback for close
        this.favoritesService = null;
        this.onFavoriteToggle = null;
    }

    setOnPlayMovie(callback) {
        this.onPlayMovie = callback;
    }

    setOnClose(callback) {
        this.onClose = callback;
    }

    setFavoritesService(favoritesService) {
        this.favoritesService = favoritesService;
    }

    setOnFavoriteToggle(callback) {
        this.onFavoriteToggle = callback;
    }

    show() {
        this.container.style.display = 'flex';
    }

    hide() {
        this.container.style.display = 'none';
        this.currentMovieInfo = null;
    }

    render(movieInfo) {
        this.currentMovieInfo = movieInfo;
        
        const info = movieInfo.info || {};
        const movieData = movieInfo.movie_data || {};

        // Get backdrop image
        const backdropUrl = info.backdrop_path && info.backdrop_path.length > 0 
            ? info.backdrop_path[0] 
            : null;

        // Check if movie is favorited
        const movieId = movieData.stream_id || info.stream_id || info.id;
        const isFavorite = this.favoritesService && movieId ? this.favoritesService.isVodFavorite(movieId) : false;
        const starIcon = isFavorite ? '★' : '☆';
        const starClass = isFavorite ? 'favorited' : '';

        // Format release date
        const releaseDate = info.releasedate || info.releaseDate || '';
        const year = releaseDate ? releaseDate.substring(0, 4) : '';

        // Format duration
        const duration = info.duration ? `${info.duration} min` : '';

        // Format rating
        const rating = info.rating || info.rating_5based || '';

        let html = `
            <div class="vod-detail-header" ${backdropUrl ? `style="background-image: linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.9)), url('${escapeHtml(backdropUrl)}');"` : ''}>
                <div class="vod-detail-header-content">
                    <button class="vod-detail-close" id="vodDetailClose">&times;</button>
                    <div class="vod-detail-main">
                        <img src="${escapeHtml(info.cover_big || info.movie_image || info.cover || '')}" class="vod-detail-cover" alt="${escapeHtml(info.name || 'Movie cover')}">
                        <div class="vod-detail-info">
                            <h2 class="vod-detail-title">
                                ${escapeHtml(info.name || 'Unknown Movie')}
                                <button class="vod-detail-favorite ${starClass}" data-movie-id="${movieId}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                                    ${starIcon}
                                </button>
                            </h2>
                            ${info.genre ? `<div class="vod-detail-genre">${escapeHtml(info.genre)}</div>` : ''}
                            <div class="vod-detail-meta">
                                ${year ? `<span>${escapeHtml(year)}</span>` : ''}
                                ${rating ? `<span>⭐ ${escapeHtml(rating)}</span>` : ''}
                                ${duration ? `<span>${escapeHtml(duration)}</span>` : ''}
                            </div>
                            ${info.plot || info.description ? `<div class="vod-detail-plot">${escapeHtml(info.plot || info.description)}</div>` : ''}
                            ${info.cast || info.actors ? `<div class="vod-detail-cast"><strong>Cast:</strong> ${escapeHtml(info.cast || info.actors)}</div>` : ''}
                            ${info.director ? `<div class="vod-detail-director"><strong>Director:</strong> ${escapeHtml(info.director)}</div>` : ''}
                        </div>
                    </div>
                </div>
            </div>
            <div class="vod-detail-content">
                <div class="vod-play-section">
                    <button class="vod-play-button" id="vodPlayButton" data-stream-id="${movieId}" data-container-extension="${movieData.container_extension || 'mkv'}">
                        ▶ Play Movie
                    </button>
                </div>
            </div>
        `;

        this.container.innerHTML = html;

        // Add event listeners
        this.setupEventListeners();
        
        this.show();
    }

    setupEventListeners() {
        // Close button
        const closeBtn = this.container.querySelector('#vodDetailClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (this.onClose) {
                    this.onClose();
                }
            });
        }

        // Favorite button
        const favoriteBtn = this.container.querySelector('.vod-detail-favorite');
        if (favoriteBtn) {
            favoriteBtn.addEventListener('click', () => {
                this.handleFavoriteToggle(favoriteBtn.dataset.movieId, favoriteBtn);
            });
        }

        // Play button
        const playBtn = this.container.querySelector('#vodPlayButton');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                if (this.onPlayMovie) {
                    this.onPlayMovie(
                        playBtn.dataset.streamId,
                        playBtn.dataset.containerExtension
                    );
                }
            });
        }
    }

    async handleFavoriteToggle(movieId, buttonElement) {
        logger.log(`🌟 VOD DETAIL FAVORITE TOGGLE: MovieId=${movieId}`);
        
        if (!this.favoritesService || !movieId) {
            logger.warn('Favorites service not available or movie ID missing');
            return;
        }

        try {
            const isFavorite = await this.favoritesService.toggleVodFavorite(movieId);
            logger.log(`🌟 Movie favorite toggled: ${isFavorite}`);
            
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

    showLoading(message = 'Loading movie information...') {
        this.container.innerHTML = `<div class="loading">${message}</div>`;
        this.show();
    }

    showError(message) {
        this.container.innerHTML = `
            <div class="error">
                <p>${message}</p>
                <button id="vodDetailErrorClose">Close</button>
            </div>
        `;
        
        const closeBtn = this.container.querySelector('#vodDetailErrorClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (this.onClose) {
                    this.onClose();
                }
            });
        }
        
        this.show();
    }
}
