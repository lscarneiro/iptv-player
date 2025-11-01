// Settings Panel Component

export class SettingsPanel {
    constructor() {
        this.panel = document.getElementById('settingsPanel');
        this.onSubmit = null;
        this.onM3u8LoggingChange = null;
        this.onConsoleLogLevelChange = null;
        this.onQuickLogin = null;
        this.onLogout = null;
    }

    setOnSubmit(callback) {
        this.onSubmit = callback;
    }

    setOnM3u8LoggingChange(callback) {
        this.onM3u8LoggingChange = callback;
    }

    setOnConsoleLogLevelChange(callback) {
        this.onConsoleLogLevelChange = callback;
    }

    setOnQuickLogin(callback) {
        this.onQuickLogin = callback;
    }

    setOnLogout(callback) {
        this.onLogout = callback;
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

        // Console log level toggles
        document.getElementById('enableConsoleLog').addEventListener('change', (e) => {
            if (this.onConsoleLogLevelChange) {
                this.onConsoleLogLevelChange('log', e.target.checked);
            }
        });
        document.getElementById('enableConsoleWarn').addEventListener('change', (e) => {
            if (this.onConsoleLogLevelChange) {
                this.onConsoleLogLevelChange('warn', e.target.checked);
            }
        });
        document.getElementById('enableConsoleError').addEventListener('change', (e) => {
            if (this.onConsoleLogLevelChange) {
                this.onConsoleLogLevelChange('error', e.target.checked);
            }
        });

        // Quick login button
        document.getElementById('quickLoginBtn').addEventListener('click', () => {
            if (this.onQuickLogin) {
                const jsonString = document.getElementById('jsonLoginString').value.trim();
                this.onQuickLogin(jsonString);
            }
        });

        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            if (this.onLogout) {
                this.onLogout();
            }
        });
    }

    open() {
        // Close account panel if open
        const accountPanel = document.getElementById('accountPanel');
        if (accountPanel) {
            accountPanel.classList.remove('open');
        }
        
        // Update button visibility based on stored credentials
        this.updateButtonVisibility();
        
        this.panel.classList.add('open');
    }

    updateButtonVisibility() {
        const connectBtn = document.getElementById('connectBtn');
        const logoutButtonGroup = document.getElementById('logoutButtonGroup');
        const loginInputs = document.getElementById('loginInputs');
        const connectionStringGroup = document.getElementById('jsonLoginString')?.closest('.form-group');
        
        // Check if credentials are stored
        const hasCredentials = localStorage.getItem('iptv_credentials') !== null;
        
        if (connectBtn) {
            connectBtn.style.display = hasCredentials ? 'none' : 'block';
        }
        
        // Show/hide logout button group at the top
        if (logoutButtonGroup) {
            logoutButtonGroup.style.display = hasCredentials ? 'block' : 'none';
        }
        
        // Hide/show login input fields based on credentials
        if (loginInputs) {
            loginInputs.style.display = hasCredentials ? 'none' : 'block';
        }
        
        // Hide/show connection string input based on credentials
        if (connectionStringGroup) {
            connectionStringGroup.style.display = hasCredentials ? 'none' : 'block';
        }
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

    setConsoleLogLevels(levels) {
        document.getElementById('enableConsoleLog').checked = levels.log !== false;
        document.getElementById('enableConsoleWarn').checked = levels.warn !== false;
        document.getElementById('enableConsoleError').checked = levels.error !== false;
    }
}

