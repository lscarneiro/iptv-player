// Category List Component

import { escapeHtml } from '../utils/domHelpers.js';

export class CategoryList {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentCategory = null;
        this.onCategorySelect = null;
        this.favoritesService = null;
        this.onCategoryFavoriteToggle = null;
        this.accordionExpanded = this.loadAccordionState();
    }

    setOnCategorySelect(callback) {
        this.onCategorySelect = callback;
    }

    setFavoritesService(favoritesService) {
        this.favoritesService = favoritesService;
    }

    setOnCategoryFavoriteToggle(callback) {
        this.onCategoryFavoriteToggle = callback;
    }

    loadAccordionState() {
        try {
            const saved = localStorage.getItem('category_accordion_expanded');
            return saved !== null ? saved === 'true' : true; // Default to expanded
        } catch (e) {
            return true;
        }
    }

    saveAccordionState(expanded) {
        try {
            localStorage.setItem('category_accordion_expanded', String(expanded));
        } catch (e) {
            // Ignore localStorage errors
        }
    }

    render(categories, allChannelsCount = 0, favoritesCount = 0) {
        // Group categories by prefix (before |)
        const groups = {};
        categories.forEach(category => {
            const parts = category.category_name.split('|');
            const prefix = parts[0].trim();
            const name = parts[1] ? parts[1].trim() : category.category_name;
            
            if (!groups[prefix]) {
                groups[prefix] = [];
            }
            
            groups[prefix].push({
                ...category,
                displayName: name,
                count: category.stream_count || null
            });
        });
        
        // Sort groups and categories within groups
        const sortedGroups = Object.keys(groups).sort();
        
        // Get favorite categories and process them to include displayName
        let favoriteCategories = this.favoritesService 
            ? this.favoritesService.filterFavoriteCategories(categories)
            : [];
        
        // Process favorite categories to add displayName (same logic as groups)
        favoriteCategories = favoriteCategories.map(category => {
            const parts = category.category_name.split('|');
            const name = parts[1] ? parts[1].trim() : category.category_name;
            return {
                ...category,
                displayName: name,
                count: category.stream_count || null
            };
        });
        
        const favoriteCategoryIds = new Set(favoriteCategories.map(c => String(c.category_id)));
        
        // Build category items with star buttons
        const buildCategoryItemHtml = (category) => {
            const streamCount = category.stream_count;
            const countHtml = streamCount !== null && streamCount !== undefined
                ? `<span class="category-count">(${streamCount})</span>`
                : '';
            const isFavorite = this.favoritesService && this.favoritesService.isCategoryFavorite(category.category_id);
            const starClass = isFavorite ? 'category-favorite-star favorited' : 'category-favorite-star';
            const starIcon = isFavorite ? '★' : '☆';
            
            return `
                <div class="category-item" data-category-id="${category.category_id}">
                    <button class="${starClass}" data-category-id="${category.category_id}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                        ${starIcon}
                    </button>
                    <span>${escapeHtml(category.displayName)}</span>
                    ${countHtml}
                </div>
            `;
        };
        
        let html = `
            <div class="category-group">
                <div class="category-item special" data-category-id="all">
                    <span>All Channels</span>
                    <span class="category-count">(${allChannelsCount})</span>
                </div>
                <div class="category-item special favorites" data-category-id="favorites">
                    <span>⭐ Favorite channels</span>
                    <span class="category-count">(${favoritesCount})</span>
                </div>
            </div>
        `;
        
        // Add Favorite Categories section
        if (favoriteCategories.length > 0) {
            html += `
                <div class="category-group-wrapper">
                    <div class="category-group">
                        <div class="group-header">Favorite Categories</div>
            `;
            
            favoriteCategories.forEach(category => {
                html += buildCategoryItemHtml(category);
            });
            
            html += `
                    </div>
                </div>
            `;
        }
        
        // Add All categories accordion section
        if (sortedGroups.length > 0) {
            const accordionIcon = this.accordionExpanded ? '▼' : '▶';
            html += `
                <div class="category-group-wrapper">
                    <div class="category-group">
                        <div class="group-header accordion-header" data-accordion="all-categories">
                            <span class="accordion-icon">${accordionIcon}</span>
                            <span>All categories</span>
                        </div>
                        <div class="accordion-content" style="display: ${this.accordionExpanded ? 'block' : 'none'}">
            `;
            
            sortedGroups.forEach(groupName => {
                const groupCategories = groups[groupName].sort((a, b) => 
                    a.displayName.localeCompare(b.displayName)
                );
                
                html += `
                    <div class="category-subgroup">
                        <div class="subgroup-header">${escapeHtml(groupName)}</div>
                `;
                
                groupCategories.forEach(category => {
                    html += buildCategoryItemHtml(category);
                });
                
                html += `
                    </div>
                `;
            });
            
            html += `
                        </div>
                    </div>
                </div>
            `;
        }
        
        this.container.innerHTML = html;
        
        // Add click listeners for category items (excluding star buttons)
        this.container.querySelectorAll('.category-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't trigger category selection if clicking the star button
                if (e.target.classList.contains('category-favorite-star') || 
                    e.target.closest('.category-favorite-star')) {
                    return;
                }
                const categoryId = item.dataset.categoryId;
                this.selectCategory(categoryId);
                if (this.onCategorySelect) {
                    this.onCategorySelect(categoryId);
                }
            });
        });
        
        // Add click listeners for star buttons
        this.container.querySelectorAll('.category-favorite-star').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const categoryId = btn.dataset.categoryId;
                this.handleFavoriteToggle(categoryId, btn);
            });
        });
        
        // Add accordion toggle listener
        const accordionHeader = this.container.querySelector('[data-accordion="all-categories"]');
        if (accordionHeader) {
            accordionHeader.addEventListener('click', () => {
                this.toggleAccordion();
            });
        }
    }
    
    async handleFavoriteToggle(categoryId, buttonElement) {
        if (!this.favoritesService) {
            return;
        }
        
        try {
            const isFavorite = await this.favoritesService.toggleCategoryFavorite(categoryId);
            this.updateFavoriteButton(buttonElement, isFavorite);
            
            // Notify app about favorite change
            if (this.onCategoryFavoriteToggle) {
                this.onCategoryFavoriteToggle(categoryId, isFavorite);
            }
        } catch (error) {
            console.error('Failed to toggle category favorite:', error);
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
    
    toggleAccordion() {
        this.accordionExpanded = !this.accordionExpanded;
        this.saveAccordionState(this.accordionExpanded);
        
        const accordionHeader = this.container.querySelector('[data-accordion="all-categories"]');
        const accordionContent = this.container.querySelector('.accordion-content');
        
        if (accordionHeader && accordionContent) {
            const icon = accordionHeader.querySelector('.accordion-icon');
            if (icon) {
                icon.textContent = this.accordionExpanded ? '▼' : '▶';
            }
            accordionContent.style.display = this.accordionExpanded ? 'block' : 'none';
        }
    }

    selectCategory(categoryId) {
        // Update UI
        this.container.querySelectorAll('.category-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const selected = this.container.querySelector(`[data-category-id="${categoryId}"]`);
        if (selected) {
            selected.classList.add('selected');
        }
        
        this.currentCategory = categoryId;
    }

    showLoading(message) {
        this.container.innerHTML = `<div class="loading">${message}</div>`;
    }

    showError(message) {
        this.container.innerHTML = `<div class="error">${message}</div>`;
    }

    clear() {
        this.container.innerHTML = '';
        this.currentCategory = null;
    }

    filter(searchTerm) {
        const items = this.container.querySelectorAll('.category-item');
        const groups = this.container.querySelectorAll('.category-group');
        const subgroups = this.container.querySelectorAll('.category-subgroup');
        const accordionContent = this.container.querySelector('.accordion-content');
        
        if (!searchTerm.trim()) {
            // Show all - remove inline display styles to restore CSS flex layout
            groups.forEach(group => group.style.display = '');
            subgroups.forEach(subgroup => subgroup.style.display = '');
            items.forEach(item => item.style.display = '');
            if (accordionContent) {
                accordionContent.style.display = this.accordionExpanded ? 'block' : 'none';
            }
            return;
        }
        
        const term = searchTerm.toLowerCase();
        
        // Expand accordion when searching
        if (accordionContent && !this.accordionExpanded) {
            this.accordionExpanded = true;
            this.saveAccordionState(true);
            accordionContent.style.display = 'block';
            const accordionHeader = this.container.querySelector('[data-accordion="all-categories"]');
            if (accordionHeader) {
                const icon = accordionHeader.querySelector('.accordion-icon');
                if (icon) {
                    icon.textContent = '▼';
                }
            }
        }
        
        groups.forEach(group => {
            const groupItems = group.querySelectorAll('.category-item');
            let hasVisibleItems = false;
            
            groupItems.forEach(item => {
                const text = item.textContent.toLowerCase();
                if (text.includes(term)) {
                    item.style.display = 'flex'; // Use 'flex' to maintain flexbox layout
                    hasVisibleItems = true;
                } else {
                    item.style.display = 'none';
                }
            });
            
            group.style.display = hasVisibleItems ? 'block' : 'none';
        });
        
        // Also filter subgroups within accordion
        subgroups.forEach(subgroup => {
            const subgroupItems = subgroup.querySelectorAll('.category-item');
            let hasVisibleItems = false;
            
            subgroupItems.forEach(item => {
                const text = item.textContent.toLowerCase();
                if (text.includes(term)) {
                    item.style.display = 'flex';
                    hasVisibleItems = true;
                } else {
                    item.style.display = 'none';
                }
            });
            
            subgroup.style.display = hasVisibleItems ? 'block' : 'none';
        });
    }
}

