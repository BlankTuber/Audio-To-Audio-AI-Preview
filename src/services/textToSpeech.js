const fs = require("fs");
const path = require("path");
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const config = require("../config");
const logger = require("../utils/logger");

class TextToSpeechService {
    constructor() {
        this.client = new TextToSpeechClient();
        this.config = {
            voice: {
                name: config.textToSpeech.voiceName || "en-US-Standard-C",
                languageCode: config.textToSpeech.languageCode || "en-US",
                ssmlGender: "FEMALE", // Added explicit gender
            },
            audioConfig: {
                audioEncoding: "MP3",
                speakingRate: config.textToSpeech.speakingRate || 1.0,
                pitch: config.textToSpeech.pitch || 0.0,
            },
        };

        // Create temp directory if it doesn't exist
        this.tempDir = path.join(process.cwd(), "temp");
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }

        logger.info("Text-to-Speech service initialized", {
            voice: this.config.voice,
        });
    }

    /**
     * Convert text to speech and save to a file
     * @param {string} text - The text to convert to speech
     * @returns {Promise<string>} - Path to the generated audio file
     */
    async synthesizeSpeech(text) {
        try {
            // Limit text length to avoid hitting API limits
            const trimmedText =
                text.length > 4000 ? text.substring(0, 4000) + "..." : text;

            logger.debug(
                `Synthesizing speech for text: "${trimmedText.substring(
                    0,
                    100,
                )}${trimmedText.length > 100 ? "..." : ""}"`,
            );

            // Configure the request
            const request = {
                input: { text: trimmedText },
                voice: this.config.voice,
                audioConfig: this.config.audioConfig,
            };

            // Generate the speech
            const [response] = await this.client.synthesizeSpeech(request);

            // Save to a temporary file
            const fileName = `tts_${Date.now()}.mp3`;
            const filePath = path.join(this.tempDir, fileName);

            fs.writeFileSync(filePath, response.audioContent, "binary");
            logger.debug(`Speech synthesized and saved to: ${filePath}`);

            return filePath;
        } catch (error) {
            logger.error("Error synthesizing speech:", error);
            throw error;
        }
    }

    /**
     * Clean up old temporary files
     * @param {number} maxAgeMs - Maximum age in milliseconds
     */
    cleanupTempFiles(maxAgeMs = 3600000) {
        // Default: 1 hour
        try {
            const now = Date.now();
            const files = fs.readdirSync(this.tempDir);

            for (const file of files) {
                if (file.startsWith("tts_")) {
                    const filePath = path.join(this.tempDir, file);
                    const stats = fs.statSync(filePath);
                    const fileAge = now - stats.mtimeMs;

                    if (fileAge > maxAgeMs) {
                        fs.unlinkSync(filePath);
                        logger.debug(`Deleted old TTS file: ${filePath}`);
                    }
                }
            }
        } catch (error) {
            logger.error("Error cleaning up temp files:", error);
        }
    }
}

module.exports = new TextToSpeechService();
