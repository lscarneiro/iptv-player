// Logger utility with configurable log levels

class Logger {
    constructor() {
        this.enabledLevels = {
            log: true,
            warn: true,
            error: true
        };
        // Store original console methods
        this.originalConsole = {
            log: console.log.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
            info: console.info.bind(console),
            debug: console.debug.bind(console)
        };
    }

    setEnabledLevels(levels) {
        this.enabledLevels = { ...levels };
    }

    getEnabledLevels() {
        return { ...this.enabledLevels };
    }

    log(...args) {
        if (this.enabledLevels.log) {
            this.originalConsole.log(...args);
        }
    }

    warn(...args) {
        if (this.enabledLevels.warn) {
            this.originalConsole.warn(...args);
        }
    }

    error(...args) {
        if (this.enabledLevels.error) {
            this.originalConsole.error(...args);
        }
    }

    info(...args) {
        if (this.enabledLevels.log) {
            this.originalConsole.info(...args);
        }
    }

    debug(...args) {
        if (this.enabledLevels.log) {
            this.originalConsole.debug(...args);
        }
    }
}

// Create and export singleton instance
export const logger = new Logger();
