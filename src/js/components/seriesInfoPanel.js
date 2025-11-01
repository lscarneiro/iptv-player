// Series Info Panel Component

import { escapeHtml } from '../utils/domHelpers.js';
import { logger } from '../utils/logger.js';

export class SeriesInfoPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentSeriesInfo = null;
        this.onPlayEpisode = null; // Callback for episode play
        this.onClose = null; // Callback for close
        this.favoritesService = null;
        this.onFavoriteToggle = null;
    }

    setOnPlayEpisode(callback) {
        this.onPlayEpisode = callback;
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
        this.currentSeriesInfo = null;
    }

    render(seriesInfo) {
        this.currentSeriesInfo = seriesInfo;
        
        const info = seriesInfo.info || {};
        const seasons = seriesInfo.seasons || [];
        const episodes = seriesInfo.episodes || {};

        // Get backdrop image
        const backdropUrl = info.backdrop_path && info.backdrop_path.length > 0 
            ? info.backdrop_path[0] 
            : null;

        // Check if series is favorited
        const seriesId = info.series_id || info.id;
        const isFavorite = this.favoritesService && seriesId ? this.favoritesService.isSeriesFavorite(seriesId) : false;
        const starIcon = isFavorite ? '★' : '☆';
        const starClass = isFavorite ? 'favorited' : '';

        let html = `
            <div class="series-detail-header" ${backdropUrl ? `style="background-image: linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.9)), url('${escapeHtml(backdropUrl)}');"` : ''}>
                <div class="series-detail-header-content">
                    <button class="series-detail-close" id="seriesDetailClose">&times;</button>
                    <div class="series-detail-main">
                        <img src="${escapeHtml(info.cover || '')}" class="series-detail-cover" alt="${escapeHtml(info.name || 'Series cover')}">
                        <div class="series-detail-info">
                            <h2 class="series-detail-title">
                                ${escapeHtml(info.name || 'Unknown Series')}
                                <button class="series-detail-favorite ${starClass}" data-series-id="${seriesId}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                                    ${starIcon}
                                </button>
                            </h2>
                            ${info.genre ? `<div class="series-detail-genre">${escapeHtml(info.genre)}</div>` : ''}
                            <div class="series-detail-meta">
                                ${info.releaseDate ? `<span>${escapeHtml(info.releaseDate)}</span>` : ''}
                                ${info.rating ? `<span>⭐ ${escapeHtml(info.rating)}</span>` : ''}
                                ${info.episode_run_time && info.episode_run_time !== '0' ? `<span>~${info.episode_run_time} min/ep</span>` : ''}
                            </div>
                            ${info.plot ? `<div class="series-detail-plot">${escapeHtml(info.plot)}</div>` : ''}
                            ${info.cast ? `<div class="series-detail-cast"><strong>Cast:</strong> ${escapeHtml(info.cast)}</div>` : ''}
                            ${info.director ? `<div class="series-detail-director"><strong>Director:</strong> ${escapeHtml(info.director)}</div>` : ''}
                        </div>
                    </div>
                </div>
            </div>
            <div class="series-detail-content">
        `;

        // Sort seasons by season number
        const sortedSeasons = [...seasons].sort((a, b) => 
            (a.season_number || 0) - (b.season_number || 0)
        );

        // Render seasons and episodes
        sortedSeasons.forEach(season => {
            const seasonNumber = season.season_number || 0;
            const seasonEpisodes = episodes[seasonNumber] || [];
            const episodeCount = seasonEpisodes.length;

            html += `
                <div class="season-section">
                    <div class="season-header" data-season="${seasonNumber}">
                        <span class="season-title">
                            <span class="season-toggle">▼</span>
                            ${escapeHtml(season.name || `Season ${seasonNumber}`)} (${episodeCount} episodes)
                        </span>
                    </div>
                    <div class="season-episodes" data-season="${seasonNumber}">
            `;

            // Sort episodes by episode number
            const sortedEpisodes = [...seasonEpisodes].sort((a, b) => 
                (a.episode_num || 0) - (b.episode_num || 0)
            );

            sortedEpisodes.forEach(episode => {
                const episodeInfo = episode.info || {};
                const episodeTitle = episode.title || `Episode ${episode.episode_num}`;
                const duration = episodeInfo.duration || 'Unknown duration';
                const rating = episodeInfo.rating || '';
                const airDate = episodeInfo.air_date || '';
                const thumbnail = episodeInfo.movie_image || season.cover_tmdb || info.cover || '';

                html += `
                    <div class="episode-item" data-episode-id="${episode.id}">
                        <div class="episode-thumbnail-container">
                            ${thumbnail ? `<img src="${escapeHtml(thumbnail)}" class="episode-thumbnail" alt="Episode thumbnail" loading="lazy">` : '<div class="episode-thumbnail-placeholder"></div>'}
                            <button class="episode-play-overlay" data-episode-id="${episode.id}" data-episode-title="${escapeHtml(episodeTitle)}" data-container-extension="${episode.container_extension || 'mkv'}">
                                ▶
                            </button>
                        </div>
                        <div class="episode-info">
                            <div class="episode-title">${escapeHtml(episodeTitle)}</div>
                            <div class="episode-meta">
                                ${duration ? `<span>${duration}</span>` : ''}
                                ${airDate ? `<span>${airDate}</span>` : ''}
                                ${rating ? `<span>⭐ ${rating}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += `</div>`;

        this.container.innerHTML = html;

        // Add event listeners
        this.setupEventListeners();
        
        this.show();
    }

    setupEventListeners() {
        // Close button
        const closeBtn = this.container.querySelector('#seriesDetailClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (this.onClose) {
                    this.onClose();
                }
            });
        }

        // Favorite button
        const favoriteBtn = this.container.querySelector('.series-detail-favorite');
        if (favoriteBtn) {
            favoriteBtn.addEventListener('click', () => {
                this.handleFavoriteToggle(favoriteBtn.dataset.seriesId, favoriteBtn);
            });
        }

        // Season toggle
        this.container.querySelectorAll('.season-header').forEach(header => {
            header.addEventListener('click', () => {
                const seasonNumber = header.dataset.season;
                const episodesContainer = this.container.querySelector(`.season-episodes[data-season="${seasonNumber}"]`);
                const toggle = header.querySelector('.season-toggle');
                
                if (episodesContainer) {
                    episodesContainer.classList.toggle('collapsed');
                    if (toggle) {
                        toggle.textContent = episodesContainer.classList.contains('collapsed') ? '▶' : '▼';
                    }
                }
            });
        });

        // Episode play buttons
        this.container.querySelectorAll('.episode-play-overlay').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.onPlayEpisode) {
                    this.onPlayEpisode(
                        btn.dataset.episodeId,
                        btn.dataset.episodeTitle,
                        btn.dataset.containerExtension
                    );
                }
            });
        });

        // Episode item click (alternative to play button)
        this.container.querySelectorAll('.episode-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't trigger if clicking the play button directly
                if (e.target.closest('.episode-play-overlay')) return;
                
                const playBtn = item.querySelector('.episode-play-overlay');
                if (playBtn && this.onPlayEpisode) {
                    this.onPlayEpisode(
                        playBtn.dataset.episodeId,
                        playBtn.dataset.episodeTitle,
                        playBtn.dataset.containerExtension
                    );
                }
            });
        });
    }

    async handleFavoriteToggle(seriesId, buttonElement) {
        logger.log(`🌟 SERIES DETAIL FAVORITE TOGGLE: SeriesId=${seriesId}`);
        
        if (!this.favoritesService || !seriesId) {
            logger.warn('Favorites service not available or series ID missing');
            return;
        }

        try {
            const isFavorite = await this.favoritesService.toggleSeriesFavorite(seriesId);
            logger.log(`🌟 Series favorite toggled: ${isFavorite}`);
            
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

    showLoading(message = 'Loading series information...') {
        this.container.innerHTML = `<div class="loading">${message}</div>`;
        this.show();
    }

    showError(message) {
        this.container.innerHTML = `
            <div class="error">
                <p>${message}</p>
                <button id="seriesDetailErrorClose">Close</button>
            </div>
        `;
        
        const closeBtn = this.container.querySelector('#seriesDetailErrorClose');
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
