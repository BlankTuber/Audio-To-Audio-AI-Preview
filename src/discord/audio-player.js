/**
 * Discord Audio Player module
 */
const fs = require("fs");
const {
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
} = require("@discordjs/voice");
const { createLogger } = require("../utils/logger");
const config = require("../utils/config");
const tempFileManager = require("../utils/temp-file-manager");

const logger = createLogger("DiscordAudioPlayer");

// Create a single audio player for the bot
const player = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
    },
});

// Track if the bot is currently speaking
let isSpeaking = false;

// Set up event listeners
player.on(AudioPlayerStatus.Playing, () => {
    logger.debug("Audio player is playing");
    isSpeaking = true;
});

player.on(AudioPlayerStatus.Idle, () => {
    logger.debug("Audio player is idle");
    isSpeaking = false;
});

player.on("error", (error) => {
    logger.error("Error in audio player:", error);
    isSpeaking = false;
});

/**
 * Play an audio file in the voice channel
 * @param {string} audioFilePath - Path to the audio file to play
 * @param {object} connection - Discord voice connection
 * @returns {Promise<boolean>} - Whether the playback was successful
 */
async function playAudio(audioFilePath, connection) {
    return new Promise((resolve) => {
        try {
            logger.debug(`Playing audio file: ${audioFilePath}`);

            // Check if file exists
            if (!fs.existsSync(audioFilePath)) {
                logger.error(`Audio file not found: ${audioFilePath}`);
                resolve(false);
                return;
            }

            // Create audio resource
            const resource = createAudioResource(audioFilePath);

            // Subscribe connection to player
            connection.subscribe(player);

            // Play the audio
            player.play(resource);

            // Listen for completion
            const onIdle = () => {
                player.removeListener(AudioPlayerStatus.Idle, onIdle);

                // Remove audio file after playing
                setTimeout(() => {
                    tempFileManager.deleteTempFile(audioFilePath);
                }, 500);

                resolve(true);
            };

            player.on(AudioPlayerStatus.Idle, onIdle);
        } catch (error) {
            logger.error("Error playing audio:", error);
            resolve(false);
        }
    });
}

/**
 * Check if the bot is currently speaking
 * @returns {boolean} - Whether the bot is speaking
 */
function isCurrentlySpeaking() {
    return isSpeaking || player.state.status === AudioPlayerStatus.Playing;
}

/**
 * Stop any current playback
 */
function stopPlayback() {
    player.stop();
    isSpeaking = false;
}

module.exports = {
    playAudio,
    isCurrentlySpeaking,
    stopPlayback,
};
