/**
 * Speech-to-Text module using Google Cloud Speech API
 */
const fs = require("fs");
const { SpeechClient } = require("@google-cloud/speech");
const { createLogger } = require("../utils/logger");
const config = require("../utils/config");

const logger = createLogger("SpeechToText");
const speechClient = new SpeechClient();

// Configuration for Google Cloud Speech API requests
const REQUEST_CONFIG = config.google.speechToText;

/**
 * Transcribe audio file to text
 * @param {string} audioFilePath - Path to the audio file
 * @returns {Promise<string|null>} - Transcription text or null if error
 */
async function transcribeAudio(audioFilePath) {
    try {
        logger.debug(`Transcribing audio file: ${audioFilePath}`);

        // Check if file exists and has content
        const stats = fs.statSync(audioFilePath);
        if (stats.size < 1000) {
            logger.debug(
                `File too small (${stats.size} bytes), skipping transcription`,
            );
            return null;
        }

        // Read file and convert to base64
        const audioBytes = fs.readFileSync(audioFilePath).toString("base64");

        // Create request to Google Cloud Speech API
        const request = {
            audio: {
                content: audioBytes,
            },
            config: REQUEST_CONFIG,
        };

        // Send request to Google Cloud Speech API
        const [response] = await speechClient.recognize(request);

        // Process response
        const transcription = response.results
            .map((result) => result.alternatives[0].transcript)
            .join("\n");

        // Log transcription if debug is enabled
        if (config.app.debug) {
            logger.debug(`Transcription result: ${transcription}`);
        }

        return transcription.toLowerCase();
    } catch (error) {
        logger.error("Error transcribing audio:", error);
        return null;
    }
}

module.exports = {
    transcribeAudio,
};
