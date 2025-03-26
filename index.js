/**
 * Discord Voice Bot - Audio-to-Audio Loop with Ollama
 * Main entry point
 */
const { createLogger } = require("./src/utils/logger");
const config = require("./src/utils/config");
const tempFileManager = require("./src/utils/temp-file-manager");
const discordClient = require("./src/discord/client");

const logger = createLogger("Main");

// Handle uncaught errors
process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (error) => {
    logger.error("Unhandled promise rejection:", error);
});

/**
 * Graceful shutdown handler
 * @param {string} signal - The signal that triggered the shutdown
 */
async function shutdown(signal) {
    logger.info(`Received ${signal}. Shutting down gracefully...`);

    try {
        // Shutdown Discord client
        await discordClient.shutdown();

        // Clean up all temporary files
        tempFileManager.cleanupAllTempFiles();

        logger.info("Shutdown complete. Exiting.");
        process.exit(0);
    } catch (error) {
        logger.error("Error during shutdown:", error);
        process.exit(1);
    }
}

/**
 * Main function
 */
async function main() {
    logger.info("Starting Discord Voice Bot...");

    // Display configuration
    if (config.app.debug) {
        logger.debug("Configuration loaded:");
        logger.debug(
            `- Discord Voice Channel: ${config.discord.voiceChannelId}`,
        );
        logger.debug(`- Language: ${config.google.speechToText.languageCode}`);
        logger.debug(`- Ollama Model: ${config.ollama.model}`);
        logger.debug(`- TTS Voice: ${config.google.textToSpeech.voiceName}`);
        logger.debug(
            `- VAD Silence Threshold: ${config.app.vadSilenceThreshold}ms`,
        );
    }

    // Initialize Discord client
    await discordClient.initialize();

    logger.info("Bot initialization complete");
}

// Listen for termination signals
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Start the bot
main().catch((error) => {
    logger.error("Failed to start the bot:", error);
    process.exit(1);
});
