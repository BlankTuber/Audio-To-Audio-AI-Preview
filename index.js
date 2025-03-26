require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const {
    joinVoiceChannel,
    createAudioPlayer,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    EndBehaviorType,
} = require("@discordjs/voice");
const { SpeechClient } = require("@google-cloud/speech");
const fs = require("fs");
const path = require("path");
const prism = require("prism-media");

// Environment variables
const TOKEN = process.env.DISCORD_TOKEN;
const VOICE_ID = process.env.VOICE_ID;
const IS_DEBUG = process.env.IS_DEBUG === "true";
const TRANSCRIPT_FILE = process.env.TRANSCRIPT_FILE || "./transcripts.txt";
const VAD_SILENCE_THRESHOLD = parseInt(
    process.env.VAD_SILENCE_THRESHOLD || "500",
); // ms of silence before stopping recording

const REQUEST_CONFIG = {
    encoding: "LINEAR16",
    sampleRateHertz: 48000,
    languageCode: process.env.LANGUAGE_CODE || "en-US",
    audioChannelCount: 2,
};

// Create client with required intents
const botClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

const speechClient = new SpeechClient();

// Track active streams and connections for graceful shutdown
let connection = null;
let voiceChannel = null;
const activeStreams = new Map();

// Ensure the directory exists for a given file path
const ensureDirectoryExists = (filePath) => {
    const directory = path.dirname(filePath);
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }
};

// Create temp directory if it doesn't exist
if (!fs.existsSync("./temp")) {
    fs.mkdirSync("./temp");
}

// Ensure transcript file directory exists
ensureDirectoryExists(TRANSCRIPT_FILE);

const getTranscription = async (tempFileName) => {
    try {
        const bytes = fs.readFileSync(tempFileName).toString("base64");
        const request = {
            audio: {
                content: bytes,
            },
            config: REQUEST_CONFIG,
        };

        const [response] = await speechClient.recognize(request);
        const transcription = response.results
            .map((result) => result.alternatives[0].transcript)
            .join("\n");

        if (IS_DEBUG) {
            console.log(`Transcription: ${transcription}`);
        }
        return transcription.toLowerCase();
    } catch (error) {
        console.error("Error getting transcription:", error);
        return null;
    }
};

const listen = (userId, speaking) => {
    if (!speaking) return;

    // Get the user
    const user = botClient.users.cache.get(userId);
    if (!user || user.bot) return;

    if (IS_DEBUG) {
        console.log(`${user.username} is talking`);
    }

    // Get audio stream with improved VAD settings
    const audioStream = connection.receiver.subscribe(userId, {
        end: {
            behavior: EndBehaviorType.AfterSilence,
            duration: VAD_SILENCE_THRESHOLD,
        },
    });

    const tempFileName = `./temp/voice_${userId}_${Date.now()}.pcm`;

    // Create writable stream
    const writeStream = fs.createWriteStream(tempFileName);

    // Process audio through a Opus decoder for better quality
    const opusDecoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
    });

    // Pipe through opus decoder to file
    audioStream.pipe(opusDecoder).pipe(writeStream);

    // Keep track of active streams for graceful shutdown
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

            // Make sure the file has actual content before processing
            const stats = fs.statSync(tempFileName);
            if (stats.size < 1000) {
                // Less than 1KB is probably too small
                if (IS_DEBUG) {
                    console.log(
                        `File too small (${stats.size} bytes), skipping: ${tempFileName}`,
                    );
                }
                fs.unlinkSync(tempFileName);
                return;
            }

            // Process the audio file
            const transcription = await getTranscription(tempFileName);

            if (transcription && transcription.trim().length > 0) {
                // Get member for display name
                const member = voiceChannel.guild.members.cache.get(userId);
                const displayName = member ? member.displayName : user.username;

                // Format transcription entry
                const timestamp = new Date().toISOString();
                const line = `[${timestamp}] ${displayName}: ${transcription}\n`;

                // Save to transcript file
                fs.appendFileSync(TRANSCRIPT_FILE, line);

                if (IS_DEBUG) {
                    console.log(
                        `Saved transcription for ${displayName}: ${transcription}`,
                    );
                }
            } else {
                if (IS_DEBUG) {
                    console.log(
                        `No valid transcription for file: ${tempFileName}`,
                    );
                }
            }
        } catch (error) {
            console.error("Error processing transcription:", error);
        } finally {
            // Clean up temporary file
            try {
                if (fs.existsSync(tempFileName)) {
                    fs.unlinkSync(tempFileName);
                }
            } catch (unlinkError) {
                console.error("Error deleting temporary file:", unlinkError);
            }
        }
    });

    // Handle errors on the stream
    audioStream.on("error", (error) => {
        console.error("Error in audio stream:", error);

        try {
            opusDecoder.end();
            writeStream.end();
            activeStreams.delete(tempFileName);

            if (fs.existsSync(tempFileName)) {
                fs.unlinkSync(tempFileName);
            }
        } catch (cleanupError) {
            console.error("Error during stream cleanup:", cleanupError);
        }
    });
};

const connectToVoice = async () => {
    try {
        // Find the voice channel
        const channel = await botClient.channels.fetch(VOICE_ID);

        if (!channel || channel.type !== 2) {
            // 2 is GUILD_VOICE
            console.error(`Could not find voice channel with ID ${VOICE_ID}`);
            return false;
        }

        voiceChannel = channel;
        console.log(`Connecting to voice channel: ${channel.name}`);

        // Join the voice channel using the new method
        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false, // Need to hear audio
        });

        // Set up speaking event (this is different in v14)
        connection.receiver.speaking.on("start", (userId) => {
            listen(userId, true);
        });

        // Handle connection ready
        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log("Connected to voice channel!");
        });

        // Handle disconnection
        connection.on(VoiceConnectionStatus.Disconnected, () => {
            console.log(
                "Disconnected from voice channel. Attempting to reconnect...",
            );
            setTimeout(() => connectToVoice(), 5000);
        });

        return true;
    } catch (error) {
        console.error("Error connecting to voice channel:", error);
        return false;
    }
};

// Initialize bot
botClient.once("ready", async () => {
    console.log(`Logged in as ${botClient.user.tag}`);

    // Connect to voice channel on startup
    if (VOICE_ID) {
        await connectToVoice();
    } else {
        console.warn(
            "No VOICE_ID provided in .env file. Bot will not automatically join a voice channel.",
        );
    }
});

// Handle errors
botClient.on("error", (error) => {
    console.error("Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
    console.error("Unhandled promise rejection:", error);
});

// Handle graceful shutdown
const shutdown = async (signal) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);

    // Close all active audio streams
    for (const [fileName, streamData] of activeStreams.entries()) {
        try {
            console.log(`Closing stream for ${streamData.userId}...`);

            // End all streams properly
            if (streamData.audioStream) streamData.audioStream.destroy();
            if (streamData.opusDecoder) streamData.opusDecoder.end();
            if (streamData.writeStream) streamData.writeStream.end();

            // Clean up temp file
            if (fs.existsSync(fileName)) {
                fs.unlinkSync(fileName);
            }
        } catch (error) {
            console.error(`Error closing stream for ${fileName}:`, error);
        }
    }

    // Disconnect from voice
    if (connection) {
        console.log("Disconnecting from voice channel...");
        connection.destroy();
    }

    // Log final message and exit
    console.log("Shutdown complete. Exiting.");
    process.exit(0);
};

// Listen for termination signals
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Login to Discord
botClient.login(TOKEN);
