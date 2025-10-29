// Settings Panel Component

export class SettingsPanel {
    constructor() {
        this.panel = document.getElementById('settingsPanel');
        this.onSubmit = null;
        this.onM3u8LoggingChange = null;
    }

    setOnSubmit(callback) {
        this.onSubmit = callback;
    }

    setOnM3u8LoggingChange(callback) {
        this.onM3u8LoggingChange = callback;
    }

    setupEventListeners() {
        document.getElementById('settingsToggle').addEventListener('click', () => {
            this.open();
        });

        document.getElementById('settingsClose').addEventListener('click', () => {
            this.close();
        });

        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            if (this.onSubmit) {
                const serverUrl = document.getElementById('serverUrl').value.trim();
                const username = document.getElementById('username').value.trim();
                const password = document.getElementById('password').value.trim();
                this.onSubmit(serverUrl, username, password);
            }
        });

        document.getElementById('enableM3u8Logging').addEventListener('change', (e) => {
            if (this.onM3u8LoggingChange) {
                this.onM3u8LoggingChange(e.target.checked);
            }
        });
    }

    open() {
        // Close account panel if open
        const accountPanel = document.getElementById('accountPanel');
        if (accountPanel) {
            accountPanel.classList.remove('open');
        }
        
        this.panel.classList.add('open');
    }

    close() {
        this.panel.classList.remove('open');
    }

    populateForm(serverUrl, username, password) {
        document.getElementById('serverUrl').value = serverUrl || '';
        document.getElementById('username').value = username || '';
        document.getElementById('password').value = password || '';
    }

    setM3u8LoggingState(enabled) {
        document.getElementById('enableM3u8Logging').checked = enabled;
    }
}

