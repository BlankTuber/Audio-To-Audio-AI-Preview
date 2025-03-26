const fs = require("fs");
const path = require("path");
const bot = require("./src/discord/bot");
const config = require("./src/config");
const logger = require("./src/utils/logger");
const ollama = require("./src/services/ollama");

// Ensure required directories exist
const tempDir = path.join(__dirname, "temp");
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Start function
async function start() {
    try {
        logger.info("Starting application");

        // Check dependencies
        logger.info("Checking Ollama availability...");

        // Try to connect to Ollama with retries
        let ollamaAvailable = false;
        const maxRetries = 5;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            logger.info(
                `Attempting to connect to Ollama (attempt ${attempt}/${maxRetries})...`,
            );
            ollamaAvailable = await ollama.checkAvailability();

            if (ollamaAvailable) {
                logger.info("Ollama API is available!");
                break;
            } else if (attempt < maxRetries) {
                logger.warn(
                    `Ollama API is not available. Retrying in 5 seconds...`,
                );
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }

        if (!ollamaAvailable) {
            logger.warn(
                "Ollama API is not available after multiple attempts. The bot will start anyway, but voice responses may not work until Ollama is running.",
            );
        }

        // Start the Discord bot
        await bot.start();

        // Handle graceful shutdown
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);

        logger.info("Application started successfully");

        // If Ollama wasn't available at startup, keep trying in the background
        if (!ollamaAvailable) {
            logger.info("Starting background Ollama connectivity check...");
            checkOllamaInBackground();
        }
    } catch (error) {
        logger.error(`Error starting application: ${error.message}`);
        process.exit(1);
    }
}

// Background Ollama check function
async function checkOllamaInBackground() {
    const checkInterval = 30000; // Check every 30 seconds

    // Don't block the main thread
    setTimeout(async function checkLoop() {
        try {
            const available = await ollama.checkAvailability();

            if (available) {
                const models = await ollama.getAvailableModels();
                logger.info(
                    `Ollama is now available! Models: ${models.join(", ")}`,
                );

                // Check if our configured model is available
                const configuredModel = config.ollama.defaultModel;
                if (!models.includes(configuredModel)) {
                    logger.warn(
                        `The configured model '${configuredModel}' is not available. Available models: ${models.join(
                            ", ",
                        )}`,
                    );
                }

                // Stop checking once available
                return;
            }

            // Continue checking if not available
            setTimeout(checkLoop, checkInterval);
        } catch (error) {
            logger.error(`Error in background Ollama check: ${error.message}`);
            setTimeout(checkLoop, checkInterval);
        }
    }, checkInterval);
}

// Shutdown function
async function shutdown() {
    try {
        logger.info("Shutting down application");

        // Stop the Discord bot
        await bot.stop();

        // Clean up temp files
        try {
            const files = fs.readdirSync(tempDir);
            for (const file of files) {
                fs.unlinkSync(path.join(tempDir, file));
            }
            logger.info("Cleaned up temporary files");
        } catch (error) {
            logger.error(`Error cleaning up temp files: ${error.message}`);
        }

        logger.info("Application shutdown complete");
        process.exit(0);
    } catch (error) {
        logger.error(`Error during shutdown: ${error.message}`);
        process.exit(1);
    }
}

// Start the application
start();
