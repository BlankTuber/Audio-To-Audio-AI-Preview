const fs = require("fs");
const path = require("path");
const { SpeechClient } = require("@google-cloud/speech");
const config = require("../config");
const logger = require("../utils/logger");

class SpeechToTextService {
    constructor() {
        this.client = new SpeechClient();

        // Use the exact same config as in the GitHub example
        this.config = {
            encoding: "LINEAR16",
            sampleRateHertz: 48000,
            languageCode: "en-US",
            audioChannelCount: 2,
        };

        logger.info("Speech-to-Text service initialized", {
            config: this.config,
        });
    }

    /**
     * Transcribe audio from a file - using conversion first
     * @param {string} filePath - Path to the audio file
     * @returns {Promise<string>} - The transcribed text
     */
    async transcribeFile(filePath) {
        try {
            logger.info(`Transcribing file: ${filePath}`);

            // Verify file exists
            if (!fs.existsSync(filePath)) {
                throw new Error(`File does not exist: ${filePath}`);
            }

            // Log file size
            const stats = fs.statSync(filePath);
            logger.info(`Audio file size: ${stats.size} bytes`);

            // Skip tiny files
            if (stats.size < 1000) {
                logger.warn(`File too small to process: ${filePath}`);
                return "";
            }

            // Try to use ffmpeg for conversion first (if available)
            try {
                const { execSync } = require("child_process");

                // Check if ffmpeg is available
                try {
                    execSync("ffmpeg -version", { stdio: "ignore" });
                    logger.debug("ffmpeg is available - using conversion");

                    // Convert PCM to WAV with different parameters
                    const wavFilePath = filePath.replace(".pcm", ".wav");
                    execSync(
                        `ffmpeg -f s16le -ar 48000 -ac 2 -i "${filePath}" -ar 16000 -ac 1 "${wavFilePath}" -y`,
                    );
                    logger.debug(`Converted PCM to WAV: ${wavFilePath}`);

                    // Try to transcribe the WAV file
                    if (fs.existsSync(wavFilePath)) {
                        const content = fs
                            .readFileSync(wavFilePath)
                            .toString("base64");

                        // Use modified config for WAV
                        const wavConfig = {
                            encoding: "LINEAR16",
                            sampleRateHertz: 16000,
                            languageCode: "en-US",
                            audioChannelCount: 1,
                        };

                        const request = {
                            audio: { content },
                            config: wavConfig,
                        };

                        logger.debug(
                            `Sending converted WAV to Google (${content.length} bytes)`,
                        );
                        const [response] = await this.client.recognize(request);

                        if (response.results && response.results.length > 0) {
                            const transcription = response.results
                                .map(
                                    (result) =>
                                        result.alternatives[0].transcript,
                                )
                                .join("\n");
                            logger.info(
                                `WAV transcription successful: "${transcription}"`,
                            );
                            return transcription.toLowerCase();
                        }

                        logger.warn(
                            "WAV transcription returned empty result - falling back to PCM",
                        );
                    }
                } catch (err) {
                    logger.warn(
                        `ffmpeg not available or conversion failed: ${err.message}`,
                    );
                }
            } catch (err) {
                logger.warn(`Conversion error: ${err.message}`);
            }

            // Fall back to direct PCM transcription
            logger.debug("Falling back to direct PCM transcription");
            const bytes = fs.readFileSync(filePath).toString("base64");

            const request = {
                audio: { content: bytes },
                config: this.config,
            };

            logger.debug(`Sending PCM to Google (${bytes.length} bytes)`);
            const [response] = await this.client.recognize(request);

            const transcription =
                response.results
                    ?.map((result) => result.alternatives[0].transcript)
                    .join("\n") || "";

            logger.info(`Transcription complete: "${transcription}"`);
            return transcription.toLowerCase();
        } catch (error) {
            logger.error(`Error transcribing audio:`, error);
            return "";
        }
    }
}

module.exports = new SpeechToTextService();
