// User Info Component

import { escapeHtml } from '../utils/domHelpers.js';

export class UserInfo {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
    }

    render(userInfo) {
        const rightPanelHeader = document.querySelector('.right-panel .panel-header');
        
        // Hide the right panel header when showing user info
        if (rightPanelHeader) {
            rightPanelHeader.classList.add('hidden');
        }
        
        if (!userInfo || !userInfo.user_info || !userInfo.server_info) {
            this.container.innerHTML = '<div class="error">Invalid user info received</div>';
            return;
        }

        const user = userInfo.user_info;
        const server = userInfo.server_info;
        
        // Format expiration date
        const expDate = user.exp_date ? new Date(user.exp_date * 1000).toLocaleDateString() : 'Unknown';
        
        // Format allowed formats
        const allowedFormats = user.allowed_output_formats ? user.allowed_output_formats.join(', ') : 'Unknown';
        
        this.container.innerHTML = `
            <div class="user-info-panel">
                <h3>Account Information</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <strong>Username:</strong> ${escapeHtml(user.username)}
                    </div>
                    <div class="info-item">
                        <strong>Status:</strong> 
                        <span class="status-${user.status.toLowerCase()}">${escapeHtml(user.status)}</span>
                    </div>
                    <div class="info-item">
                        <strong>Expires:</strong> ${expDate}
                    </div>
                    <div class="info-item">
                        <strong>Trial:</strong> ${user.is_trial === '1' ? 'Yes' : 'No'}
                    </div>
                    <div class="info-item">
                        <strong>Active Connections:</strong> ${user.active_cons}/${user.max_connections}
                    </div>
                    <div class="info-item">
                        <strong>Allowed Formats:</strong> ${allowedFormats}
                    </div>
                </div>
                
                <h3>Server Information</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <strong>Server URL:</strong> ${escapeHtml(server.url)}
                    </div>
                    <div class="info-item">
                        <strong>Protocol:</strong> ${escapeHtml(server.server_protocol)}
                    </div>
                    <div class="info-item">
                        <strong>Port:</strong> ${server.port}
                    </div>
                    <div class="info-item">
                        <strong>HTTPS Port:</strong> ${server.https_port}
                    </div>
                    <div class="info-item">
                        <strong>RTMP Port:</strong> ${server.rtmp_port}
                    </div>
                    <div class="info-item">
                        <strong>Timezone:</strong> ${escapeHtml(server.timezone)}
                    </div>
                    <div class="info-item">
                        <strong>Server Time:</strong> ${escapeHtml(server.time_now)}
                    </div>
                </div>
                
                <div class="info-note">
                    <em>Select a category from the left panel to view available streams.</em>
                </div>
            </div>
        `;
    }

    clear() {
        this.container.innerHTML = '';
    }
}

