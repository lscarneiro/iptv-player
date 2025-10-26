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

