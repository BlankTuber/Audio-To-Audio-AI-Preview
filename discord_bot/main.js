require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { joinVoiceChannel, entersState, VoiceConnectionStatus, EndBehaviorType } = require("@discordjs/voice");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const ffmpeg = require("ffmpeg-static");

// Create a new client instance with necessary intents
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates],
});

// Map to store active recording connections
const connections = new Map();

// Ensure we have a recordings directory
const recordingsPath = path.join(__dirname, "recordings");
if (!fs.existsSync(recordingsPath)) {
    fs.mkdirSync(recordingsPath);
}

// Ensure we have a temp directory for PCM files
const tempPath = path.join(__dirname, "temp");
if (!fs.existsSync(tempPath)) {
    fs.mkdirSync(tempPath);
}

client.once("ready", async () => {
    console.log(`Bot is online! Logged in as ${client.user.tag}`);

    try {
        // Get guild and voice channel from environment variables
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) throw new Error("Guild not found");

        const channel = guild.channels.cache.get(process.env.CHANNEL_ID);
        if (!channel) throw new Error("Channel not found");
        if (!channel.isVoiceBased()) throw new Error("Channel is not a voice channel");

        console.log(`Attempting to join voice channel: ${channel.name}`);

        // Join the voice channel on startup
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false, // We need to hear audio to record it
            selfMute: true, // Bot doesn't need to speak
        });

        // Wait for the connection to be ready
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        console.log(`Successfully joined voice channel: ${channel.name}`);

        // Store the connection for later use
        connections.set(guild.id, {
            connection,
            receivers: new Map(),
        });
    } catch (error) {
        console.error("Error joining voice channel:", error);
    }
});

// Handle voice state updates (users joining/leaving voice channels)
client.on("voiceStateUpdate", (oldState, newState) => {
    // Ignore bot's own voice state changes
    if (newState.member.user.bot) return;

    const guildId = newState.guild.id;
    const guildData = connections.get(guildId);

    if (!guildData) return;

    // User joined the specified voice channel
    if ((!oldState.channelId || oldState.channelId !== process.env.CHANNEL_ID) && newState.channelId === process.env.CHANNEL_ID) {
        console.log(`User ${newState.member.user.tag} joined voice channel, starting recording`);
        startRecording(newState);
    }

    // User left the specified voice channel
    if (oldState.channelId === process.env.CHANNEL_ID && (!newState.channelId || newState.channelId !== process.env.CHANNEL_ID)) {
        console.log(`User ${oldState.member.user.tag} left voice channel, stopping recording`);
        stopRecording(oldState);
    }
});

function startRecording(voiceState) {
    const guildId = voiceState.guild.id;
    const userId = voiceState.member.user.id;
    const guildData = connections.get(guildId);

    if (!guildData || guildData.receivers.has(userId)) return;

    // Create an audio receiver
    const receiver = guildData.connection.receiver;

    // Start listening to the user's audio stream
    const audioStream = receiver.subscribe(userId, {
        end: {
            behavior: EndBehaviorType.AfterSilence,
            duration: 100,
        },
    });

    // Create a filename with timestamp for the temporary PCM file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const tempFileName = path.join(tempPath, `${userId}_${timestamp}.pcm`);
    const fileStream = fs.createWriteStream(tempFileName);

    // Log when data is being written to help debug
    let bytesWritten = 0;
    audioStream.on("data", (chunk) => {
        bytesWritten += chunk.length;
        if (bytesWritten % (1024 * 100) === 0) {
            // Log every ~100KB
            console.log(`Recording ${userId}: ${bytesWritten} bytes written`);
        }
    });

    // Handle stream errors
    audioStream.on("error", (error) => {
        console.error(`Error in audio stream: ${error}`);
    });

    fileStream.on("error", (error) => {
        console.error(`Error in file stream: ${error}`);
    });

    // Pipe the audio to the temporary PCM file
    audioStream.pipe(fileStream);

    // Store the streams and filenames for later cleanup and conversion
    guildData.receivers.set(userId, {
        audioStream,
        fileStream,
        tempFileName,
        timestamp,
        userId,
        bytesWritten: 0,
    });

    console.log(`Started recording for user ${userId} to temporary file ${tempFileName}`);
}

function stopRecording(voiceState) {
    const guildId = voiceState.guild.id;
    const userId = voiceState.member.user.id;
    const guildData = connections.get(guildId);

    if (!guildData || !guildData.receivers.has(userId)) return;

    const receiverData = guildData.receivers.get(userId);

    // End the streams
    receiverData.audioStream.unpipe(receiverData.fileStream);
    receiverData.fileStream.end();

    console.log(`Stopped PCM recording for user ${userId}, checking file size...`);

    // Wait a moment to ensure the file is fully written
    setTimeout(() => {
        // Check if we actually recorded any meaningful data
        let fileStats;
        try {
            fileStats = fs.statSync(receiverData.tempFileName);
            console.log(`Temporary file size: ${fileStats.size} bytes`);

            // If file is too small, likely no audio was recorded
            if (fileStats.size < 1000) {
                // Less than 1KB
                console.warn(`Recording for user ${userId} contains very little data (${fileStats.size} bytes), skipping conversion`);
                fs.unlinkSync(receiverData.tempFileName);
                return;
            }
        } catch (err) {
            console.error(`Error checking file stats: ${err}`);
            return;
        }

        const mp3FileName = path.join(recordingsPath, `${userId}_${receiverData.timestamp}.mp3`);

        console.log(`Converting ${receiverData.tempFileName} (${fileStats.size} bytes) to ${mp3FileName}...`);

        // Use FFmpeg to convert PCM to MP3 with explicit format parameters
        const ffmpegProcess = spawn(ffmpeg, [
            "-f",
            "s16le", // Force input format as signed 16-bit little-endian
            "-ar",
            "48000", // Sample rate
            "-ac",
            "2", // Channels (stereo)
            "-i",
            receiverData.tempFileName, // Input file
            "-c:a",
            "libmp3lame", // MP3 codec
            "-b:a",
            "128k", // Bitrate
            "-y", // Overwrite output file
            mp3FileName, // Output file
        ]);

        // Capture and log all FFmpeg output for debugging
        ffmpegProcess.stderr.on("data", (data) => {
            console.log(`FFmpeg: ${data}`);
        });

        // Handle conversion completion
        ffmpegProcess.on("close", (code) => {
            if (code === 0) {
                console.log(`Successfully converted recording to ${mp3FileName}`);

                try {
                    // Check the size of the resulting MP3
                    const mp3Stats = fs.statSync(mp3FileName);
                    console.log(`MP3 file size: ${mp3Stats.size} bytes`);

                    // Delete the temporary PCM file
                    fs.unlinkSync(receiverData.tempFileName);
                    console.log(`Deleted temporary file ${receiverData.tempFileName}`);
                } catch (err) {
                    console.error(`Error in post-conversion handling: ${err}`);
                }
            } else {
                console.error(`FFmpeg process exited with code ${code}`);

                // Keep the PCM file for debugging if conversion failed
                console.log(`Keeping temporary PCM file for debugging: ${receiverData.tempFileName}`);
            }
        });
    }, 2000); // Wait 2 seconds to ensure file is completely written

    // Remove from the map
    guildData.receivers.delete(userId);
}

// Error handling for the connection
client.on("error", (error) => {
    console.error("Discord client error:", error);
});

// Login to Discord
client
    .login(process.env.DISCORD_TOKEN)
    .then(() => console.log("Discord bot is connecting..."))
    .catch((error) => {
        console.error("Failed to log in to Discord:", error);
        process.exit(1);
    });

// Error handling for the connection
client.on("error", (error) => {
    console.error("Discord client error:", error);
});

// Login to Discord
client
    .login(process.env.DISCORD_TOKEN)
    .then(() => console.log("Discord bot is connecting..."))
    .catch((error) => {
        console.error("Failed to log in to Discord:", error);
        process.exit(1);
    });
