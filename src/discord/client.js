/**
 * Discord Client module
 */
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits } = require("discord.js");
const {
    joinVoiceChannel,
    VoiceConnectionStatus,
    EndBehaviorType,
} = require("@discordjs/voice");
const prism = require("prism-media");
const { createLogger } = require("../utils/logger");
const config = require("../utils/config");
const tempFileManager = require("../utils/temp-file-manager");
const speechToText = require("../ai/speech-to-text");
const llmClient = require("../ai/llm-client");
const textToSpeech = require("../ai/text-to-speech");
const audioPlayer = require("./audio-player");

const logger = createLogger("DiscordClient");

// Initialize Discord client with required intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

// State management
let connection = null;
let voiceChannel = null;
const activeStreams = new Map();

// Flag to prevent processing when bot is speaking
let isProcessing = false;

/**
 * Process the audio recorded from a user
 * @param {string} userId - Discord user ID
 * @param {string} tempFileName - Path to the temporary audio file
 */
async function processUserAudio(userId, tempFileName) {
    try {
        // Get user information
        const user = client.users.cache.get(userId);
        if (!user || user.bot) return;

        // Get member for display name
        const member = voiceChannel.guild.members.cache.get(userId);
        const displayName = member ? member.displayName : user.username;

        // Don't process if the bot is already speaking or processing another request
        if (audioPlayer.isCurrentlySpeaking() || isProcessing) {
            logger.debug(`Bot is busy, skipping processing for ${displayName}`);
            return;
        }

        isProcessing = true;

        // 1. Transcribe audio to text
        const transcription = await speechToText.transcribeAudio(tempFileName);

        // Skip if no transcription
        if (!transcription || transcription.trim() === "") {
            logger.debug(`No valid transcription for ${displayName}`);
            isProcessing = false;
            return;
        }

        logger.info(`Transcription from ${displayName}: ${transcription}`);

        // 2. Add user message to LLM conversation history
        llmClient.addUserMessage(displayName, transcription);

        // 3. Generate response from LLM
        const aiResponse = await llmClient.generateResponse();

        // Skip if no response
        if (!aiResponse) {
            logger.warn("No response from LLM");
            isProcessing = false;
            return;
        }

        logger.info(`AI response: ${aiResponse}`);

        // 4. Generate speech from response
        const speechFilePath = await textToSpeech.generateSpeech(aiResponse);

        // Skip if no speech generated
        if (!speechFilePath) {
            logger.warn("Failed to generate speech");
            isProcessing = false;
            return;
        }

        // 5. Play audio in voice channel
        await audioPlayer.playAudio(speechFilePath, connection);

        isProcessing = false;
    } catch (error) {
        logger.error("Error processing user audio:", error);
        isProcessing = false;
    }
}

/**
 * Listen to a user speaking in the voice channel
 * @param {string} userId - Discord user ID
 * @param {boolean} speaking - Whether the user is speaking
 */
function listenToUser(userId, speaking) {
    if (!speaking) return;

    // Get the user
    const user = client.users.cache.get(userId);
    if (!user || user.bot) return;

    // Get member for display name
    const member = voiceChannel.guild.members.cache.get(userId);
    const displayName = member ? member.displayName : user.username;

    logger.debug(`${displayName} is speaking`);

    // Skip if bot is speaking or processing
    if (audioPlayer.isCurrentlySpeaking() || isProcessing) {
        logger.debug(`Bot is busy, skipping listen for ${displayName}`);
        return;
    }

    // Get audio stream with voice activity detection
    const audioStream = connection.receiver.subscribe(userId, {
        end: {
            behavior: EndBehaviorType.AfterSilence,
            duration: config.app.vadSilenceThreshold,
        },
    });

    // Create temp file for audio
    const { filePath: tempFileName, writeStream } =
        tempFileManager.createTempFileStream(`voice_${userId}`, "pcm");

    // Create Opus decoder for better quality
    const opusDecoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
    });

    // Pipe through opus decoder to file
    audioStream.pipe(opusDecoder).pipe(writeStream);

    // Track active stream
    activeStreams.set(tempFileName, {
        audioStream,
        writeStream,
        opusDecoder,
        userId,
        startTime: Date.now(),
    });

    // When the user stops speaking (silence detected)
    audioStream.on("end", async () => {
        try {
            // Close the streams properly
            opusDecoder.end();
            writeStream.end();

            // Remove from active streams
            activeStreams.delete(tempFileName);

            // Process the audio file
            await processUserAudio(userId, tempFileName);
        } catch (error) {
            logger.error("Error handling audio end:", error);
        } finally {
            // Clean up temporary file after processing
            setTimeout(() => {
                tempFileManager.deleteTempFile(tempFileName);
            }, 1000);
        }
    });

    // Handle errors on the stream
    audioStream.on("error", (error) => {
        logger.error("Error in audio stream:", error);

        try {
            opusDecoder.end();
            writeStream.end();
            activeStreams.delete(tempFileName);
            tempFileManager.deleteTempFile(tempFileName);
        } catch (cleanupError) {
            logger.error("Error during stream cleanup:", cleanupError);
        }
    });
}

/**
 * Connect to a Discord voice channel
 * @returns {Promise<boolean>} - Whether the connection was successful
 */
async function connectToVoice() {
    try {
        // Find the voice channel
        const channel = await client.channels.fetch(
            config.discord.voiceChannelId,
        );

        if (!channel || channel.type !== 2) {
            // 2 is GUILD_VOICE
            logger.error(
                `Could not find voice channel with ID ${config.discord.voiceChannelId}`,
            );
            return false;
        }

        voiceChannel = channel;
        logger.info(`Connecting to voice channel: ${channel.name}`);

        // Join the voice channel
        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false, // Need to hear audio
        });

        // Set up speaking event
        connection.receiver.speaking.on("start", (userId) => {
            listenToUser(userId, true);
        });

        // Handle connection ready
        connection.on(VoiceConnectionStatus.Ready, () => {
            logger.info("Connected to voice channel!");
        });

        // Handle disconnection
        connection.on(VoiceConnectionStatus.Disconnected, () => {
            logger.warn(
                "Disconnected from voice channel. Attempting to reconnect...",
            );
            setTimeout(() => connectToVoice(), 5000);
        });

        return true;
    } catch (error) {
        logger.error("Error connecting to voice channel:", error);
        return false;
    }
}

/**
 * Disconnect from the voice channel
 */
function disconnect() {
    if (connection) {
        logger.info("Disconnecting from voice channel...");
        audioPlayer.stopPlayback();
        connection.destroy();
        connection = null;
        voiceChannel = null;
    }
}

/**
 * Initialize the Discord client
 * @returns {Promise<void>}
 */
async function initialize() {
    // Set up event handlers
    client.once("ready", async () => {
        logger.info(`Logged in as ${client.user.tag}`);

        // Connect to voice channel on startup
        if (config.discord.voiceChannelId) {
            await connectToVoice();
        } else {
            logger.warn(
                "No voice channel ID provided. Bot will not automatically join a voice channel.",
            );
        }
    });

    // Handle errors
    client.on("error", (error) => {
        logger.error("Discord client error:", error);
    });

    // Login to Discord
    await client.login(config.discord.token);
}

/**
 * Shutdown the Discord client
 */
async function shutdown() {
    logger.info("Shutting down Discord client...");

    // Close all active audio streams
    for (const [fileName, streamData] of activeStreams.entries()) {
        try {
            logger.debug(`Closing stream for ${streamData.userId}...`);

            // End all streams properly
            if (streamData.audioStream) streamData.audioStream.destroy();
            if (streamData.opusDecoder) streamData.opusDecoder.end();
            if (streamData.writeStream) streamData.writeStream.end();

            // Clean up temp file
            tempFileManager.deleteTempFile(fileName);
        } catch (error) {
            logger.error(`Error closing stream for ${fileName}:`, error);
        }
    }

    // Clear active streams
    activeStreams.clear();

    // Disconnect from voice
    disconnect();

    // Destroy client
    if (client) {
        await client.destroy();
    }
}

module.exports = {
    initialize,
    shutdown,
    client,
};
