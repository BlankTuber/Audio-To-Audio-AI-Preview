/**
 * Text-to-Speech module using Google Cloud TTS API
 */
const fs = require("fs");
const util = require("util");
const textToSpeech = require("@google-cloud/text-to-speech");
const { createLogger } = require("../utils/logger");
const config = require("../utils/config");
const tempFileManager = require("../utils/temp-file-manager");

const logger = createLogger("TextToSpeech");
const ttsClient = new textToSpeech.TextToSpeechClient();
const writeFile = util.promisify(fs.writeFile);

/**
 * Generate speech from text
 * @param {string} text - The text to convert to speech
 * @returns {Promise<string|null>} - Path to the audio file or null if error
 */
async function generateSpeech(text) {
    try {
        if (!text || text.trim() === "") {
            logger.warn("Empty text provided for speech generation");
            return null;
        }

        logger.debug(`Generating speech for text: ${text}`);

        // Create request for Google Cloud TTS
        const request = {
            input: { text },
            voice: {
                languageCode: config.google.speechToText.languageCode,
                name: config.google.textToSpeech.voiceName,
            },
            audioConfig: {
                audioEncoding: "MP3",
                speakingRate: config.google.textToSpeech.speakingRate,
                pitch: config.google.textToSpeech.pitch,
            },
        };

        // Call Google Cloud TTS API
        const [response] = await ttsClient.synthesizeSpeech(request);

        // Create output file path
        const outputFilePath = tempFileManager.createTempFilePath(
            "tts-output",
            "mp3",
        );

        // Write audio content to file
        await writeFile(outputFilePath, response.audioContent, "binary");

        // Register the file for cleanup
        tempFileManager.registerTempFile(outputFilePath);

        logger.debug(`Speech generated successfully: ${outputFilePath}`);
        return outputFilePath;
    } catch (error) {
        logger.error("Error generating speech:", error);
        return null;
    }
}

module.exports = {
    generateSpeech,
};
