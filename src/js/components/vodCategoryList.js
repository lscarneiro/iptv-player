// VOD Category List Component

import { escapeHtml } from '../utils/domHelpers.js';

export class VodCategoryList {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentCategory = null;
        this.onCategorySelect = null;
    }

    setOnCategorySelect(callback) {
        this.onCategorySelect = callback;
    }

    render(categories, allMoviesCount = 0, favoritesCount = 0, resumeWatchingCount = 0) {
        // Sort categories alphabetically
        const sortedCategories = [...categories].sort((a, b) => 
            a.category_name.localeCompare(b.category_name)
        );
        
        let html = `
            <div class="category-group">
                <div class="category-item special" data-category-id="all">
                    <span>All Movies</span>
                    <span class="category-count">(${allMoviesCount})</span>
                </div>
                ${resumeWatchingCount > 0 ? `
                    <div class="category-item special resume-watching" data-category-id="resume">
                        <span>▶ Resume Watching</span>
                        <span class="category-count">(${resumeWatchingCount})</span>
                    </div>
                ` : ''}
                <div class="category-item special favorites" data-category-id="favorites">
                    <span>⭐ Favorites</span>
                    <span class="category-count">(${favoritesCount})</span>
                </div>
            </div>
        `;
        
        // Add all categories as a flat list
        sortedCategories.forEach(category => {
            html += `
                <div class="category-item" data-category-id="${category.category_id}">
                    <span>${escapeHtml(category.category_name)}</span>
                </div>
            `;
        });
        
        this.container.innerHTML = html;
        
        // Add click listeners
        this.container.querySelectorAll('.category-item').forEach(item => {
            item.addEventListener('click', () => {
                const categoryId = item.dataset.categoryId;
                this.selectCategory(categoryId);
                if (this.onCategorySelect) {
                    this.onCategorySelect(categoryId);
                }
            });
        });
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
        
        if (!searchTerm.trim()) {
            // Show all
            items.forEach(item => item.style.display = 'block');
            return;
        }
        
        const term = searchTerm.toLowerCase();
        
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            if (text.includes(term)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }
}
