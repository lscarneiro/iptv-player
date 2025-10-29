// UI Helpers - Common UI operations and utilities
export class UIHelpers {
    static updateElementText(id, text) {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
    }

    static updateElementsText(updates) {
        Object.entries(updates).forEach(([id, text]) => {
            UIHelpers.updateElementText(id, text);
        });
    }

    static updateElementAttribute(id, attribute, value) {
        const element = document.getElementById(id);
        if (element) element[attribute] = value;
    }

    static updateElementsAttribute(attribute, updates) {
        Object.entries(updates).forEach(([id, value]) => {
            UIHelpers.updateElementAttribute(id, attribute, value);
        });
    }

    static showElement(id) {
        const element = document.getElementById(id);
        if (element) element.style.display = 'block';
    }

    static hideElement(id) {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
    }

    static toggleElementVisibility(id, show) {
        if (show) {
            UIHelpers.showElement(id);
        } else {
            UIHelpers.hideElement(id);
        }
    }

    static addClassToElement(id, className) {
        const element = document.getElementById(id);
        if (element) element.classList.add(className);
    }

    static removeClassFromElement(id, className) {
        const element = document.getElementById(id);
        if (element) element.classList.remove(className);
    }

    static toggleElementClass(id, className, add) {
        if (add) {
            UIHelpers.addClassToElement(id, className);
        } else {
            UIHelpers.removeClassFromElement(id, className);
        }
    }

    static createLoadingHTML(title = 'Loading', message = 'Please wait...') {
        return `
            <div class="error-container loading-state">
                <div class="error-icon">⏳</div>
                <div class="error-content">
                    <h3 class="error-title">${title}</h3>
                    <p class="error-message">${message}</p>
                    <div class="loading-spinner"></div>
                </div>
            </div>
        `;
    }

    static createErrorHTML(title, message, actions = []) {
        const actionButtons = actions.map(action => 
            `<button class="error-btn ${action.class}" onclick="${action.onclick}">
                ${action.icon} ${action.text}
            </button>`
        ).join('');

        return `
            <div class="error-container">
                <div class="error-icon">⚠️</div>
                <div class="error-content">
                    <h3 class="error-title">${title}</h3>
                    <p class="error-message">${message}</p>
                    <div class="error-actions">${actionButtons}</div>
                </div>
            </div>
        `;
    }

    static validateUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    static validateCredentials(credentials) {
        const { serverUrl, username, password } = credentials;
        
        if (!serverUrl || !username || !password) {
            return { valid: false, message: 'Please fill in all fields' };
        }

        if (!UIHelpers.validateUrl(serverUrl)) {
            return { valid: false, message: 'Please enter a valid server URL' };
        }

        return { valid: true };
    }

    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static formatStreamCount(count) {
        if (count === undefined || count === null) return '';
        return count === 1 ? '(1 stream)' : `(${count} streams)`;
    }

    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}