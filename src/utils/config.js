/**
 * Centralized configuration from environment variables
 */
require("dotenv").config();

const config = {
    // Discord Bot Configuration
    discord: {
        token: process.env.DISCORD_TOKEN,
        voiceChannelId: process.env.VOICE_ID,
    },

    // Google Cloud Configuration
    google: {
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        speechToText: {
            languageCode: process.env.LANGUAGE_CODE || "en-US",
            encoding: "LINEAR16",
            sampleRateHertz: 48000,
            audioChannelCount: 2,
        },
        textToSpeech: {
            voiceName: process.env.TTS_VOICE_NAME || "en-US-Standard-I",
            speakingRate: parseFloat(process.env.TTS_SPEAKING_RATE || "1.0"),
            pitch: parseFloat(process.env.TTS_PITCH || "0"),
        },
    },

    // Ollama Configuration
    ollama: {
        apiHost: process.env.OLLAMA_API_HOST || "http://localhost:11434",
        model: process.env.OLLAMA_DEFAULT_MODEL || "gemma3",
        systemPrompt:
            process.env.OLLAMA_SYSTEM_PROMPT ||
            "You are a friendly conversation partner in a Discord voice channel. " +
                "Be natural, casual, and engaging. You're part of the conversation - " +
                "not an assistant. Respond to everyone naturally without needing to " +
                "be directly addressed. Keep responses brief and conversational. " +
                "Occasionally ask questions to keep the conversation flowing. Include " +
                "humor and personality. Remember usernames and refer to them when " +
                "appropriate. You're just another person in the call hanging out with friends.",
    },

    // Application Configuration
    app: {
        debug: process.env.IS_DEBUG === "true",
        logLevel: process.env.LOG_LEVEL || "INFO",
        tempDir: process.env.TEMP_DIR || "./temp",
        vadSilenceThreshold: parseInt(
            process.env.VAD_SILENCE_THRESHOLD || "500",
        ),
    },
};

module.exports = config;
