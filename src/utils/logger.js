/**
 * Logger module for consistent logging across the application
 */
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
};

class Logger {
    constructor(module, level = "INFO") {
        this.module = module;
        this.level = LOG_LEVELS[level] || LOG_LEVELS.INFO;
    }

    formatMessage(level, message) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] [${this.module}] ${message}`;
    }

    error(message, error = null) {
        if (this.level >= LOG_LEVELS.ERROR) {
            console.error(this.formatMessage("ERROR", message));
            if (error) {
                console.error(error);
            }
        }
    }

    warn(message) {
        if (this.level >= LOG_LEVELS.WARN) {
            console.warn(this.formatMessage("WARN", message));
        }
    }

    info(message) {
        if (this.level >= LOG_LEVELS.INFO) {
            console.info(this.formatMessage("INFO", message));
        }
    }

    debug(message) {
        if (this.level >= LOG_LEVELS.DEBUG) {
            console.debug(this.formatMessage("DEBUG", message));
        }
    }
}

/**
 * Create a logger instance for a specific module
 * @param {string} module - The module name
 * @param {string} level - The log level (ERROR, WARN, INFO, DEBUG)
 * @returns {Logger} - Logger instance
 */
function createLogger(module, level = process.env.LOG_LEVEL || "INFO") {
    return new Logger(module, level);
}

module.exports = { createLogger, LOG_LEVELS };
