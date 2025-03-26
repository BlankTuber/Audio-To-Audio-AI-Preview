/**
 * Text-to-Speech module using Google Cloud TTS API with SSML support
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
 * Convert plain text to SSML format
 * @param {string} text - Plain text to convert to SSML
 * @returns {string} - Formatted SSML
 */
function textToSSML(text) {
    if (!text || text.trim() === "") {
        return "";
    }

    // Step 1: Remove or replace emojis with descriptive text
    // This regex matches most emoji characters
    text = text.replace(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
        "",
    );

    // Step 2: Replace common text emoji patterns
    text = text
        .replace(/:\)/g, " smiling ")
        .replace(/:\(/g, " sad ")
        .replace(/;\)/g, " winking ")
        .replace(/:\D/g, " surprised ")
        .replace(/\bxD\b/gi, " laughing ")
        .replace(/\blol\b/gi, " laughing ")
        .replace(/\blomao\b/gi, " laughing hard ")
        .replace(/\brofl\b/gi, " rolling on the floor laughing ");

    // Step 3: Handle special characters that might cause issues
    text = text
        .replace(/&/g, "and")
        .replace(/</g, "less than")
        .replace(/>/g, "greater than");

    // Step 4: Add pauses for better speech rhythm at punctuation
    text = text
        .replace(/\.\s+/g, '. <break time="500ms"/> ')
        .replace(/\!\s+/g, '! <break time="500ms"/> ')
        .replace(/\?\s+/g, '? <break time="500ms"/> ')
        .replace(/,\s+/g, ', <break time="300ms"/> ');

    // Step 5: Wrap in SSML tags
    return `<speak>${text}</speak>`;
}

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

        // Convert to SSML
        const ssml = textToSSML(text);
        logger.debug(`SSML generated: ${ssml}`);

        // Create request for Google Cloud TTS with SSML
        const request = {
            input: { ssml },
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
    textToSSML, // Export for testing
};
