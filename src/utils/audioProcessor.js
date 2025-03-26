const fs = require("fs");
const path = require("path");
const { Transform } = require("stream");
const logger = require("./logger");

/**
 * Utility class for handling audio processing operations
 */
class AudioProcessor {
    constructor() {
        // Create temp directory if it doesn't exist
        this.tempDir = path.join(process.cwd(), "temp");
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }

        logger.info("Audio processor initialized");
    }

    /**
     * Create a writable file stream for saving audio
     * @param {string} userId - The user ID for identifying the audio file
     * @returns {Object} - Object containing the file stream and path
     */
    createAudioFileStream(userId) {
        const fileName = `voice_${userId}_${Date.now()}.pcm`;
        const filePath = path.join(this.tempDir, fileName);

        logger.debug(`Creating audio file stream: ${filePath}`);

        // Make sure the directory exists
        if (!fs.existsSync(this.tempDir)) {
            logger.debug(`Creating temp directory: ${this.tempDir}`);
            fs.mkdirSync(this.tempDir, { recursive: true });
        }

        const fileStream = fs.createWriteStream(filePath);

        // Add event listeners for debugging
        fileStream.on("open", () => {
            logger.debug(`Audio file stream opened: ${filePath}`);
        });

        fileStream.on("error", (error) => {
            logger.error(
                `Error with audio file stream ${filePath}: ${error.message}`,
            );
        });

        fileStream.on("finish", () => {
            // Check if the file was actually written
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                logger.debug(
                    `Audio file stream finished: ${filePath}, size: ${stats.size} bytes`,
                );
            } else {
                logger.error(
                    `Audio file not created after stream finish: ${filePath}`,
                );
            }
        });

        return {
            stream: fileStream,
            path: filePath,
        };
    }

    /**
     * Create a transform stream that monitors audio for silence
     * @param {number} silenceThreshold - The threshold for detecting silence
     * @param {number} silenceDuration - The duration of silence to trigger end (ms)
     * @returns {Transform} - A transform stream
     */
    createSilenceDetectionStream(
        silenceThreshold = 500,
        silenceDuration = 1000,
    ) {
        let silenceStart = null;
        let isSilent = false;

        const transform = new Transform({
            transform(chunk, encoding, callback) {
                // Simple silence detection by checking if sample values are below threshold
                const buffer = Buffer.from(chunk);
                const isSilentNow = this._isSilentBuffer(
                    buffer,
                    silenceThreshold,
                );

                // Pass through the audio data
                this.push(chunk);

                // Handle silence detection
                if (isSilentNow && !isSilent) {
                    // Silence just started
                    silenceStart = Date.now();
                    isSilent = true;
                } else if (!isSilentNow && isSilent) {
                    // Silence just ended
                    silenceStart = null;
                    isSilent = false;
                } else if (isSilentNow && isSilent) {
                    // Check if silence duration threshold is reached
                    const currentSilenceDuration = Date.now() - silenceStart;
                    if (currentSilenceDuration >= silenceDuration) {
                        // Emit event for silence detected
                        this.emit("silence-detected", currentSilenceDuration);
                    }
                }

                callback();
            },

            // Helper method to detect silence in buffer
            _isSilentBuffer(buffer, threshold) {
                // For 16-bit PCM audio
                for (let i = 0; i < buffer.length; i += 2) {
                    const sample = buffer.readInt16LE(i);
                    if (Math.abs(sample) > threshold) {
                        return false;
                    }
                }
                return true;
            },
        });

        return transform;
    }

    /**
     * Clean up temporary audio files
     * @param {number} maxAgeMs - Maximum age in milliseconds
     */
    cleanupTempFiles(maxAgeMs = 3600000) {
        // Default: 1 hour
        try {
            const now = Date.now();
            const files = fs.readdirSync(this.tempDir);

            for (const file of files) {
                if (file.startsWith("voice_")) {
                    const filePath = path.join(this.tempDir, file);
                    const stats = fs.statSync(filePath);
                    const fileAge = now - stats.mtimeMs;

                    if (fileAge > maxAgeMs) {
                        fs.unlinkSync(filePath);
                        logger.debug(`Deleted old audio file: ${filePath}`);
                    }
                }
            }
        } catch (error) {
            logger.error("Error cleaning up temp files:", error);
        }
    }
}

module.exports = new AudioProcessor();
