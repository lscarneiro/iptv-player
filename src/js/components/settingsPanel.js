// Settings Panel Component

export class SettingsPanel {
    constructor() {
        this.panel = document.getElementById('settingsPanel');
        this.onSubmit = null;
    }

    setOnSubmit(callback) {
        this.onSubmit = callback;
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
    }

    open() {
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
}

