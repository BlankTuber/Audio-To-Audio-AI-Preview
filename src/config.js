require("dotenv").config();

// Validate required environment variables
const requiredEnvVars = [
    "DISCORD_TOKEN",
    "CLIENT_ID",
    "OLLAMA_API_HOST",
    "OLLAMA_DEFAULT_MODEL",
    "GOOGLE_APPLICATION_CREDENTIALS",
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

module.exports = {
    // Discord Configuration
    discord: {
        token: process.env.DISCORD_TOKEN,
        clientId: process.env.CLIENT_ID,
        guildId: process.env.GUILD_ID,
    },

    // Voice Configuration
    voice: {
        channelCooldown: parseInt(
            process.env.VOICE_CHANNEL_COOLDOWN_MS || "1000",
            10,
        ),
        recordingTimeout: parseInt(
            process.env.AUDIO_RECORDING_TIMEOUT_MS || "5000",
            10,
        ),
    },

    // Ollama Configuration
    ollama: {
        apiHost: process.env.OLLAMA_API_HOST,
        defaultModel: process.env.OLLAMA_DEFAULT_MODEL,
        systemPrompt:
            process.env.OLLAMA_SYSTEM_PROMPT ||
            "You are a friendly conversation partner in a Discord voice channel. Be natural, casual, and engaging. You're part of the conversation - not an assistant. Respond to everyone naturally without needing to be directly addressed. Keep responses brief and conversational. Occasionally ask questions to keep the conversation flowing. Include humor and personality. Remember usernames and refer to them when appropriate. You're just another person in the call hanging out with friends.",
    },

    // Google Cloud Speech-to-Text Configuration
    speechToText: {
        languageCode: process.env.STT_LANGUAGE_CODE || "en-US",
        encoding: process.env.STT_ENCODING || "LINEAR16",
        sampleRateHertz: parseInt(
            process.env.STT_SAMPLE_RATE_HERTZ || "48000",
            10,
        ),
        audioChannelCount: parseInt(
            process.env.STT_AUDIO_CHANNEL_COUNT || "2",
            10,
        ),
    },

    // Google Cloud Text-to-Speech Configuration
    textToSpeech: {
        voiceName: process.env.TTS_VOICE_NAME || "en-US-Neural2-C",
        languageCode: process.env.TTS_LANGUAGE_CODE || "en-US",
        speakingRate: parseFloat(process.env.TTS_SPEAKING_RATE || "1.0"),
        pitch: parseFloat(process.env.TTS_PITCH || "0.0"),
    },

    // Debug and Logging Configuration
    debug: process.env.DEBUG === "true",
    logLevel: process.env.LOG_LEVEL || "debug", // Changed from 'info' to 'debug'
};
