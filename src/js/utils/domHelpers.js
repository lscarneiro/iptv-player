// DOM helper utilities

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
    if (!element) return;
    
    // Try multiple methods to ensure cross-browser compatibility
    try {
        // Method 1: Direct scrollTop assignment
        element.scrollTop = 0;
        
        // Method 2: Use scrollTo if available (more reliable on some mobile browsers)
        if (element.scrollTo) {
            element.scrollTo(0, 0);
        }
        
        // Method 3: Use scrollIntoView as fallback for stubborn cases
        const firstChild = element.firstElementChild;
        if (firstChild && firstChild.scrollIntoView) {
            firstChild.scrollIntoView({ block: 'start', inline: 'nearest' });
        }
    } catch (error) {
        console.warn('Error scrolling to top:', error);
    }
}

