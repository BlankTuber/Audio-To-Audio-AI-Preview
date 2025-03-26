const winston = require("winston");
const config = require("../config");

const { format, createLogger, transports } = winston;
const { combine, timestamp, printf, colorize } = format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    // Add metadata if available
    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }

    return msg;
});

// Create the logger
const logger = createLogger({
    level: config.logLevel,
    format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), logFormat),
    transports: [
        new transports.Console({
            format: combine(
                colorize(),
                timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
                logFormat,
            ),
        }),
        new transports.File({
            filename: "error.log",
            level: "error",
        }),
        new transports.File({
            filename: "combined.log",
        }),
    ],
});

// Add debug logs only when debug is enabled
if (config.debug) {
    logger.debug = (message, meta = {}) => {
        console.debug(`[DEBUG] ${message}`, meta);
        return logger;
    };
}

module.exports = logger;
