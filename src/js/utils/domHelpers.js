// DOM helper utilities

import { logger } from './logger.js';

export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function toggleClearButton(buttonId, value) {
    const clearBtn = document.getElementById(buttonId);
    if (!clearBtn) return;
    
    if (value && value.trim() !== '') {
        clearBtn.classList.remove('hidden');
    } else {
        clearBtn.classList.add('hidden');
    }
}

// Utility function to reliably scroll an element to the top
export function scrollToTop(element) {
    if (!element) {
        logger.warn('scrollToTop: element is null or undefined');
        return;
    }
    
    // Check if element is actually scrollable
    if (typeof element.scrollTop === 'undefined') {
        logger.warn('scrollToTop: element is not scrollable');
        return;
    }
    
    // Try multiple methods to ensure cross-browser compatibility
    try {
        // Method 1: Direct scrollTop assignment
        element.scrollTop = 0;
        
        // Method 2: Use scrollTo if available (more reliable on some mobile browsers)
        if (typeof element.scrollTo === 'function') {
            element.scrollTo(0, 0);
        }
        
        // Method 3: Use scrollIntoView as fallback for stubborn cases
        const firstChild = element.firstElementChild;
        if (firstChild && typeof firstChild.scrollIntoView === 'function') {
            firstChild.scrollIntoView({ block: 'start', inline: 'nearest' });
        }
    } catch (error) {
        logger.warn('Error scrolling to top:', error);
    }
}

// Format stream name by replacing ◉ with red circle emoji (but not if it's at the beginning)
export function formatStreamName(name) {
    if (!name) return '';
    // If it starts with ◉, keep it and only replace the rest
    if (name.startsWith('◉')) {
        return '◉' + name.slice(1).replace(/◉/g, '🔴');
    }
    // Otherwise replace all occurrences
    return name.replace(/◉/g, '🔴');
}

