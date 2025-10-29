// Main Application Entry Point - Simplified and clean
import { AppController } from './core/appController.js';

// Global app instance for backward compatibility
let app;

// Initialize the application
async function initializeApp() {
    try {
        app = new AppController();
        
        // Make app globally available for onclick handlers
        window.app = app;
        
        // Initialize the application
        await app.initialize();
        
        console.log('IPTV Player initialized successfully');
        
    } catch (error) {
        console.error('Failed to initialize IPTV Player:', error);
        
        // Show error to user
        const mainContainer = document.getElementById('mainContainer');
        if (mainContainer) {
            mainContainer.innerHTML = `
                <div class="error-container">
                    <div class="error-icon">⚠️</div>
                    <div class="error-content">
                        <h3 class="error-title">Application Error</h3>
                        <p class="error-message">
                            Failed to initialize the IPTV Player.<br>
                            Error: ${error.message}
                        </p>
                        <div class="error-actions">
                            <button class="error-btn retry-btn" onclick="window.location.reload()">
                                🔄 Reload Page
                            </button>
                        </div>
                    </div>
                </div>
            `;
            mainContainer.style.display = 'block';
        }
    }
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Export for module compatibility
export { app };