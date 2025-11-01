// Category List Component

import { escapeHtml } from '../utils/domHelpers.js';

export class CategoryList {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentCategory = null;
        this.onCategorySelect = null;
    }

    setOnCategorySelect(callback) {
        this.onCategorySelect = callback;
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
        
        let html = `
            <div class="category-group">
                <div class="category-item special" data-category-id="all">
                    <span>All Channels</span>
                    <span class="category-count">(${allChannelsCount})</span>
                </div>
                <div class="category-item special favorites" data-category-id="favorites">
                    <span>⭐ Favorites</span>
                    <span class="category-count">(${favoritesCount})</span>
                </div>
            </div>
        `;
        
        sortedGroups.forEach(groupName => {
            const groupCategories = groups[groupName].sort((a, b) => 
                a.displayName.localeCompare(b.displayName)
            );
            
            html += `
                <div class="category-group-wrapper">
                    <div class="category-group">
                        <div class="group-header">${escapeHtml(groupName)}</div>
            `;
            
            groupCategories.forEach(category => {
                const streamCount = category.stream_count;
                const countHtml = streamCount !== null && streamCount !== undefined
                    ? `<span class="category-count">(${streamCount})</span>`
                    : '';
                html += `
                    <div class="category-item" data-category-id="${category.category_id}">
                        <span>${escapeHtml(category.displayName)}</span>
                        ${countHtml}
                    </div>
                `;
            });
            
            html += `
                    </div>
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
        const groups = this.container.querySelectorAll('.category-group');
        
        if (!searchTerm.trim()) {
            // Show all
            groups.forEach(group => group.style.display = 'block');
            items.forEach(item => item.style.display = 'block');
            return;
        }
        
        const term = searchTerm.toLowerCase();
        
        groups.forEach(group => {
            const groupItems = group.querySelectorAll('.category-item');
            let hasVisibleItems = false;
            
            groupItems.forEach(item => {
                const text = item.textContent.toLowerCase();
                if (text.includes(term)) {
                    item.style.display = 'block';
                    hasVisibleItems = true;
                } else {
                    item.style.display = 'none';
                }
            });
            
            group.style.display = hasVisibleItems ? 'block' : 'none';
        });
    }
}

