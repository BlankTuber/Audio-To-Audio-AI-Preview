const fs = require("fs");
const path = require("path");
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    entersState,
    VoiceConnectionStatus,
    AudioPlayerStatus,
} = require("@discordjs/voice");
const { setTimeout: wait } = require("timers/promises");
const { setTimeout: regularTimeout } = require("timers");

const speechToText = require("../services/speechToText");
const textToSpeech = require("../services/textToSpeech");
const ollama = require("../services/ollama");
const audioProcessor = require("../utils/audioProcessor");
const logger = require("../utils/logger");
const config = require("../config");

class VoiceManager {
    constructor() {
        this.connections = new Map();
        this.audioPlayers = new Map();
        this.processingUsers = new Set();
        this.isSpeaking = false;
        this.client = null;
        this.channelMembers = new Map(); // Track members in voice channels
        this.textChannels = new Map(); // Store text channels for each guild
        this.conversationContext = new Map(); // Store recent conversation context

        // Clean up temp files periodically
        setInterval(() => {
            audioProcessor.cleanupTempFiles();
            textToSpeech.cleanupTempFiles();
        }, 3600000); // Every hour

        logger.info("Voice manager initialized");
    }

    /**
     * Set the Discord client for user lookups
     * @param {Object} client - Discord.js client
     */
    setClient(client) {
        this.client = client;
        logger.info("Discord client set in voice manager");
    }

    /**
     * Join a voice channel
     * @param {Object} channel - Discord voice channel
     * @param {Object} textChannel - Discord text channel for feedback
     * @returns {Promise<Object>} - Voice connection
     */
    async joinChannel(channel, textChannel) {
        try {
            const guildId = channel.guild.id;

            // Check if already connected to this guild
            if (this.connections.has(guildId)) {
                const existingConnection = this.connections.get(guildId);
                logger.debug(
                    `Already connected to a voice channel in guild ${guildId}`,
                );
                return existingConnection;
            }

            logger.info(
                `Joining voice channel: ${channel.name} in guild ${guildId}`,
            );

            try {
                // Create a new connection
                const connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: channel.guild.id,
                    adapterCreator: channel.guild.voiceAdapterCreator,
                    selfDeaf: false, // We need to hear others
                    selfMute: false, // We need to speak
                });

                // Create an audio player for this connection
                const player = createAudioPlayer();
                connection.subscribe(player);

                // Store connection and player
                this.connections.set(guildId, connection);
                this.audioPlayers.set(guildId, player);

                // Store the text channel for this connection
                this.textChannels = this.textChannels || new Map();
                this.textChannels.set(guildId, textChannel);

                // Setup event listeners
                this._setupConnectionEvents(
                    connection,
                    channel,
                    textChannel,
                    guildId,
                );
                this._setupAudioPlayerEvents(player, guildId);

                // Wait for the connection to be ready
                try {
                    await entersState(
                        connection,
                        VoiceConnectionStatus.Ready,
                        30_000,
                    );
                    logger.info(
                        `Successfully connected to voice channel in guild ${guildId}`,
                    );
                } catch (error) {
                    logger.error(
                        `Failed to enter Ready state: ${error.message}`,
                    );
                    connection.destroy();
                    throw error;
                }

                // Start listening for voice
                this._startListening(connection, textChannel, guildId);

                // Track all current members in the voice channel
                this._trackChannelMembers(channel, guildId);

                // Set up channel state change tracking
                this._setupChannelStateTracking(channel, guildId);

                return connection;
            } catch (error) {
                logger.error(
                    `Error creating voice connection: ${error.message}`,
                );
                // Make sure we clean up any partial connections
                if (this.connections.has(guildId)) {
                    try {
                        this.connections.get(guildId).destroy();
                    } catch (e) {
                        logger.error(
                            `Error cleaning up failed connection: ${e.message}`,
                        );
                    }
                    this.connections.delete(guildId);
                    this.audioPlayers.delete(guildId);
                }
                throw error;
            }
        } catch (error) {
            logger.error(`Error joining voice channel: ${error.message}`);
            throw error;
        }
    }

    /**
     * Track the members in a voice channel
     * @param {Object} channel - Voice channel
     * @param {string} guildId - Guild ID
     * @private
     */
    _trackChannelMembers(channel, guildId) {
        // Initialize member tracking for this guild if not exists
        this.channelMembers = this.channelMembers || new Map();
        this.channelMembers.set(guildId, new Set());

        // Track all current members
        channel.members.forEach((member) => {
            if (!member.user.bot) {
                this.channelMembers.get(guildId).add(member.id);
                logger.info(
                    `Tracking voice channel member: ${member.user.username} (${member.id})`,
                );
            }
        });

        // Log the total number of tracked members
        logger.info(
            `Tracking ${
                this.channelMembers.get(guildId).size
            } members in voice channel ${channel.name}`,
        );
    }

    /**
     * Set up tracking for channel state changes (users joining/leaving)
     * @param {Object} channel - Voice channel
     * @param {string} guildId - Guild ID
     * @private
     */
    _setupChannelStateTracking(channel, guildId) {
        const guild = channel.guild;

        // Track users joining the voice channel
        guild.client.on("voiceStateUpdate", async (oldState, newState) => {
            // Skip bot users
            if (newState.member.user.bot) return;

            // Only care about our tracked channel
            if (
                newState.channel?.id !== channel.id &&
                oldState.channel?.id !== channel.id
            ) {
                return;
            }

            // User joined the channel
            if (!oldState.channel && newState.channel?.id === channel.id) {
                this.channelMembers.get(guildId).add(newState.member.id);
                logger.info(
                    `User joined voice channel: ${newState.member.user.username}`,
                );

                // Subscribe to the new user
                const connection = this.connections.get(guildId);
                const textChannel = this.textChannels.get(guildId);
                if (
                    connection &&
                    this._shouldListenToUser(newState.member.user)
                ) {
                    this._subscribeToUser(
                        newState.member.id,
                        connection,
                        textChannel,
                        guildId,
                    );

                    // Announce the user joining (with small delay to let them settle)
                    await wait(1000);
                    const response = await ollama.generateResponse(
                        `${newState.member.user.username} has joined the voice channel.`,
                    );
                    await this.speak(response, guildId);
                }
            }

            // User left the channel
            else if (oldState.channel?.id === channel.id && !newState.channel) {
                this.channelMembers.get(guildId).delete(oldState.member.id);
                logger.info(
                    `User left voice channel: ${oldState.member.user.username}`,
                );

                // Announce the user leaving
                const response = await ollama.generateResponse(
                    `${oldState.member.user.username} has left the voice channel.`,
                );
                await this.speak(response, guildId);
            }

            // User moved to another channel
            else if (
                oldState.channel?.id === channel.id &&
                newState.channel?.id !== channel.id
            ) {
                this.channelMembers.get(guildId).delete(oldState.member.id);
                logger.info(
                    `User moved to another channel: ${oldState.member.user.username}`,
                );
            }
        });
    }

    /**
     * Leave a voice channel
     * @param {string} guildId - Discord guild ID
     */
    leaveChannel(guildId) {
        try {
            const connection = this.connections.get(guildId);
            if (!connection) {
                logger.warn(`No voice connection found for guild ${guildId}`);
                return;
            }

            logger.info(`Leaving voice channel in guild ${guildId}`);

            try {
                // Destroy the connection
                connection.destroy();
            } catch (error) {
                logger.error(
                    `Error destroying voice connection: ${error.message}`,
                );
            }

            // Clean up regardless of errors
            this.connections.delete(guildId);
            this.audioPlayers.delete(guildId);

            // Reset Ollama conversation
            ollama.resetConversation();

            // Also clear any processing users
            this.processingUsers.clear();

            logger.info(`Successfully left voice channel in guild ${guildId}`);
        } catch (error) {
            logger.error(`Error leaving voice channel: ${error.message}`);
        }
    }

    /**
     * Play speech from text
     * @param {string} text - Text to convert to speech
     * @param {string} guildId - Discord guild ID
     * @returns {Promise<void>}
     */
    async speak(text, guildId) {
        let speechFile = null;

        try {
            const player = this.audioPlayers.get(guildId);
            if (!player) {
                logger.warn(`No audio player found for guild ${guildId}`);
                return;
            }

            const connection = this.connections.get(guildId);
            if (!connection) {
                logger.warn(`No voice connection found for guild ${guildId}`);
                return;
            }

            // Check connection state
            if (connection.state.status !== VoiceConnectionStatus.Ready) {
                logger.warn(
                    `Voice connection not in Ready state: ${connection.state.status}`,
                );
                return;
            }

            // Mark as speaking (to avoid processing our own speech)
            this.isSpeaking = true;

            // Trim text if it's too long
            const trimmedText =
                text.length > 1000 ? text.substring(0, 1000) + "..." : text;

            // Convert text to speech
            logger.debug(
                `Converting text to speech: "${trimmedText.substring(0, 100)}${
                    trimmedText.length > 100 ? "..." : ""
                }"`,
            );
            speechFile = await textToSpeech.synthesizeSpeech(trimmedText);

            // Create an audio resource from the speech file
            let resource;
            try {
                resource = createAudioResource(speechFile);
            } catch (error) {
                logger.error(`Error creating audio resource: ${error.message}`);
                this.isSpeaking = false;
                return;
            }

            // Play the audio
            try {
                player.play(resource);
            } catch (error) {
                logger.error(`Error playing audio: ${error.message}`);
                this.isSpeaking = false;
                return;
            }

            // Wait for playback to complete
            await new Promise((resolve) => {
                // Set a timeout in case the idle event doesn't fire
                const timeout = regularTimeout(() => {
                    logger.warn(
                        "Audio playback timed out waiting for Idle state",
                    );
                    this.isSpeaking = false;
                    resolve();
                }, 30000); // 30-second timeout

                player.once(AudioPlayerStatus.Idle, () => {
                    clearTimeout(timeout);
                    // Wait a short time after speech ends
                    regularTimeout(() => {
                        // No longer speaking
                        this.isSpeaking = false;
                        resolve();
                    }, 500);
                });

                player.once("error", (error) => {
                    clearTimeout(timeout);
                    logger.error(
                        `Error during audio playback: ${error.message}`,
                    );
                    this.isSpeaking = false;
                    resolve();
                });
            });

            logger.debug("Audio playback completed successfully");
        } catch (error) {
            logger.error(`Error speaking: ${error.message}`);
            this.isSpeaking = false;
        } finally {
            // Clean up the speech file
            if (speechFile && fs.existsSync(speechFile)) {
                try {
                    fs.unlinkSync(speechFile);
                } catch (error) {
                    logger.error(
                        `Error deleting speech file ${speechFile}: ${error.message}`,
                    );
                }
            }
        }
    }

    /**
     * Set up connection event listeners
     * @param {Object} connection - Voice connection
     * @param {Object} voiceChannel - Voice channel
     * @param {Object} textChannel - Text channel
     * @param {string} guildId - Guild ID
     * @private
     */
    _setupConnectionEvents(connection, voiceChannel, textChannel, guildId) {
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            logger.warn(`Voice disconnected in guild ${guildId}`);

            try {
                // Try to reconnect
                await Promise.race([
                    entersState(
                        connection,
                        VoiceConnectionStatus.Signalling,
                        5_000,
                    ),
                    entersState(
                        connection,
                        VoiceConnectionStatus.Connecting,
                        5_000,
                    ),
                ]);
            } catch (error) {
                logger.error(`Could not reconnect: ${error.message}`);
                // Destroy and clean up
                this.leaveChannel(guildId);
                if (textChannel) {
                    textChannel.send(
                        "Voice connection lost. Please use the join command again if you want me to rejoin.",
                    );
                }
            }
        });

        connection.on(VoiceConnectionStatus.Destroyed, () => {
            logger.info(`Voice connection destroyed in guild ${guildId}`);
            // Clean up
            this.connections.delete(guildId);
            this.audioPlayers.delete(guildId);
        });
    }

    /**
     * Set up audio player event listeners
     * @param {Object} player - Audio player
     * @param {string} guildId - Guild ID
     * @private
     */
    _setupAudioPlayerEvents(player, guildId) {
        player.on("error", (error) => {
            logger.error(
                `Error in audio player for guild ${guildId}: ${error.message}`,
            );
        });
    }

    /**
     * Start listening for voice
     * @param {Object} connection - Voice connection
     * @param {Object} textChannel - Text channel
     * @param {string} guildId - Guild ID
     * @private
     */
    _startListening(connection, textChannel, guildId) {
        logger.info(`Starting to listen in guild ${guildId}`);

        // Listen for speaking events - simpler approach like the GitHub example
        connection.receiver.speaking.on("start", async (userId) => {
            // Skip if we're currently speaking or already processing this user
            if (this.isSpeaking || this.processingUsers.has(userId)) {
                logger.debug(
                    `Skipping audio processing - already speaking or processing`,
                );
                return;
            }

            // Skip bot users or self
            if (this.client) {
                const user = this.client.users.cache.get(userId);
                if (user && user.bot) {
                    logger.debug(`Skipping bot user: ${user.tag}`);
                    return;
                }
            }

            // Add user to processing set
            this.processingUsers.add(userId);

            try {
                logger.info(
                    `User ${userId} is speaking - starting audio capture`,
                );

                // Create a PCM stream for the user's audio - similar to the GitHub example
                const audioStream = connection.receiver.subscribe(userId, {
                    end: {
                        behavior: "manual",
                    },
                });

                // Create a file path
                const tempFileName = path.join(
                    process.cwd(),
                    "temp",
                    `voice_${userId}_${Date.now()}.pcm`,
                );
                logger.debug(`Writing to ${tempFileName}`);

                // Create a write stream and pipe audio to it - similar to the GitHub example
                const fileStream = fs.createWriteStream(tempFileName);
                audioStream.pipe(fileStream);

                // Set a timeout to end recording - similar to how the GitHub example works
                setTimeout(async () => {
                    try {
                        // End the audio streams
                        audioStream.destroy();
                        fileStream.end();

                        // Wait a moment for file to be completely written
                        await new Promise((resolve) =>
                            setTimeout(resolve, 500),
                        );

                        // Get user information
                        const user = this.client
                            ? this.client.users.cache.get(userId)
                            : null;

                        // Process the audio file
                        if (fs.existsSync(tempFileName)) {
                            const stats = fs.statSync(tempFileName);
                            logger.debug(
                                `Audio file created: ${tempFileName}, size: ${stats.size} bytes`,
                            );

                            if (stats.size > 1000) {
                                await this._processAudioFile(
                                    tempFileName,
                                    user,
                                    textChannel,
                                    guildId,
                                );
                            } else {
                                logger.warn(
                                    `Audio file too small: ${tempFileName}`,
                                );
                            }
                        }
                    } catch (error) {
                        logger.error(
                            `Error processing audio: ${error.message}`,
                        );
                    } finally {
                        // Remove user from processing set
                        this.processingUsers.delete(userId);
                    }
                }, 5000); // 5 second recording - similar to the GitHub example
            } catch (error) {
                logger.error(`Error during audio capture: ${error.message}`);
                this.processingUsers.delete(userId);
            }
        });

        logger.info(`Now listening for speech events in guild ${guildId}`);
    }

    /**
     * Check all current channel members and subscribe to appropriate users
     * @param {Object} connection - Voice connection
     * @param {Object} textChannel - Text channel
     * @param {string} guildId - Guild ID
     * @private
     */
    _subscribeToChannelMembers(connection, textChannel, guildId) {
        try {
            const channel = connection.joinConfig.channelId;
            const guild = this.client?.guilds.cache.get(guildId);

            if (!guild) {
                logger.warn(`Could not find guild with ID ${guildId}`);
                return;
            }

            const voiceChannel = guild.channels.cache.get(channel);
            if (!voiceChannel) {
                logger.warn(`Could not find voice channel with ID ${channel}`);
                return;
            }

            // Subscribe to each appropriate member in the channel
            voiceChannel.members.forEach((member) => {
                if (this._shouldListenToUser(member.user)) {
                    this._subscribeToUser(
                        member.id,
                        connection,
                        textChannel,
                        guildId,
                    );
                }
            });

            logger.debug(
                `Subscribed to applicable users in channel ${voiceChannel.name}`,
            );
        } catch (error) {
            logger.error(
                `Error subscribing to channel members: ${error.message}`,
            );
        }
    }

    /**
     * Check if we should listen to a user and subscribe if appropriate
     * @param {string} userId - User ID
     * @param {Object} connection - Voice connection
     * @param {Object} textChannel - Text channel
     * @param {string} guildId - Guild ID
     * @private
     */
    _maybeSubscribeToUser(userId, connection, textChannel, guildId) {
        if (!this.client) {
            logger.warn("No Discord client available for user lookup");
            return;
        }

        const user = this.client.users.cache.get(userId);
        if (!user) {
            logger.warn(`Could not find user with ID ${userId}`);
            return;
        }

        if (this._shouldListenToUser(user)) {
            this._subscribeToUser(userId, connection, textChannel, guildId);
        }
    }

    /**
     * Determine if we should listen to a user
     * @param {Object} user - Discord user
     * @returns {boolean} - Whether we should listen to this user
     * @private
     */
    _shouldListenToUser(user) {
        // Don't listen to bots or self
        if (user.bot) {
            return false;
        }

        // Don't listen to self
        if (this.client && user.id === this.client.user.id) {
            return false;
        }

        // You could add additional filters here, like:
        // - Specific user IDs to ignore
        // - Users without certain roles
        // - etc.

        return true;
    }

    /**
     * Subscribe to a specific user's audio
     * @param {string} userId - User ID
     * @param {Object} connection - Voice connection
     * @param {Object} textChannel - Text channel
     * @param {string} guildId - Guild ID
     * @private
     */
    _subscribeToUser(userId, connection, textChannel, guildId) {
        // Skip if already processing this user
        if (this.processingUsers.has(userId)) {
            return;
        }

        logger.info(`Subscribing to user ${userId}`);
        this.processingUsers.add(userId);

        // Create subscription for this user
        const handleUserAudio = async () => {
            // Skip if we're currently speaking
            if (this.isSpeaking) {
                logger.debug(
                    `Skipping processing because we're currently speaking`,
                );
                return;
            }

            try {
                logger.info(
                    `User ${userId} is speaking - starting audio capture`,
                );

                // Create a unique identifier for this audio capture session
                const captureId = Date.now();
                const filePath = path.join(
                    process.cwd(),
                    "temp",
                    `voice_${userId}_${captureId}.pcm`,
                );

                // Create a PCM stream for the user's audio
                let audioStream;
                try {
                    // Use manual behavior for more control
                    audioStream = connection.receiver.subscribe(userId, {
                        end: {
                            behavior: "manual",
                        },
                    });
                    logger.debug(
                        `Audio stream created for user ${userId} with manual behavior`,
                    );
                } catch (err) {
                    logger.error(
                        `Failed to create audio stream for user ${userId}: ${err.message}`,
                    );
                    this.processingUsers.delete(userId);
                    return;
                }

                if (!audioStream) {
                    logger.error(
                        `Could not create audio stream for user ${userId}`,
                    );
                    this.processingUsers.delete(userId);
                    return;
                }

                // Create file write stream
                const fileStream = fs.createWriteStream(filePath);

                // Setup complete flag
                let setupComplete = false;

                // Set up error handlers
                audioStream.on("error", (error) => {
                    logger.error(
                        `Error in audio stream for user ${userId}: ${error.message}`,
                    );
                    fileStream.end();
                    if (!setupComplete) this.processingUsers.delete(userId);
                });

                fileStream.on("error", (error) => {
                    logger.error(
                        `Error in file stream for user ${userId}: ${error.message}`,
                    );
                    audioStream.destroy();
                    if (!setupComplete) this.processingUsers.delete(userId);
                });

                // Set up data event to log that data is flowing
                let dataReceived = false;
                let totalBytes = 0;
                let lastDataTime = Date.now();

                audioStream.on("data", (chunk) => {
                    totalBytes += chunk.length;
                    lastDataTime = Date.now();

                    if (!dataReceived) {
                        logger.debug(
                            `Receiving audio data from user ${userId}, first chunk size: ${chunk.length}`,
                        );
                        dataReceived = true;
                    }
                });

                // Pipe audio to file
                audioStream.pipe(fileStream);

                setupComplete = true;

                // Use an interval to check for speech completion (silence)
                const silenceInterval = setInterval(() => {
                    const timeSinceLastData = Date.now() - lastDataTime;

                    // If no data for 1 second, consider speech finished
                    if (dataReceived && timeSinceLastData > 1000) {
                        logger.debug(
                            `Detected silence after ${totalBytes} bytes of audio data`,
                        );
                        clearInterval(silenceInterval);

                        // End streams
                        audioStream.destroy();
                        fileStream.end();

                        // Process after a short delay to ensure file is fully written
                        setTimeout(async () => {
                            try {
                                // Verify the file was created and has content
                                if (fs.existsSync(filePath)) {
                                    const stats = fs.statSync(filePath);
                                    logger.debug(
                                        `Audio file created: ${filePath}, size: ${stats.size} bytes`,
                                    );

                                    if (stats.size > 1000) {
                                        // Only process if enough audio data
                                        const user = this.client
                                            ? this.client.users.cache.get(
                                                  userId,
                                              )
                                            : null;

                                        // Process the audio file
                                        await this._processAudioFile(
                                            filePath,
                                            user,
                                            textChannel,
                                            guildId,
                                        );
                                    } else {
                                        logger.warn(
                                            `Audio file too small to process: ${filePath}, size: ${stats.size} bytes`,
                                        );
                                    }
                                } else {
                                    logger.error(
                                        `Audio file was not created: ${filePath}`,
                                    );
                                }
                            } catch (err) {
                                logger.error(
                                    `Error processing audio: ${err.message}`,
                                );
                            } finally {
                                // Clean up
                                this.processingUsers.delete(userId);
                            }
                        }, 500);
                    }
                }, 100); // Check every 100ms

                // Set a safety timeout in case the silence detection fails
                setTimeout(() => {
                    if (this.processingUsers.has(userId)) {
                        logger.warn(
                            `Safety timeout reached for user ${userId}, cleaning up`,
                        );
                        clearInterval(silenceInterval);

                        if (audioStream) {
                            audioStream.destroy();
                        }
                        if (fileStream && fileStream.writable) {
                            fileStream.end();
                        }

                        // If we have enough audio data, try to process it
                        if (totalBytes > 1000) {
                            setTimeout(async () => {
                                try {
                                    // Only attempt to process if we got enough data
                                    if (fs.existsSync(filePath)) {
                                        const stats = fs.statSync(filePath);

                                        if (stats.size > 1000) {
                                            const user = this.client
                                                ? this.client.users.cache.get(
                                                      userId,
                                                  )
                                                : null;
                                            await this._processAudioFile(
                                                filePath,
                                                user,
                                                textChannel,
                                                guildId,
                                            );
                                        }
                                    }
                                } catch (err) {
                                    logger.error(
                                        `Error in safety timeout processing: ${err.message}`,
                                    );
                                } finally {
                                    this.processingUsers.delete(userId);
                                }
                            }, 500);
                        } else {
                            this.processingUsers.delete(userId);
                        }
                    }
                }, 10000); // 10 second safety timeout - shorter than before
            } catch (error) {
                logger.error(
                    `Error processing audio from user ${userId}: ${error.message}`,
                );
                logger.error(error.stack);
                this.processingUsers.delete(userId);
            }
        };

        // Listen for speaking events from this user
        connection.receiver.speaking.on("start", (speakingUserId) => {
            if (
                speakingUserId === userId &&
                !this.isSpeaking &&
                !this.processingUsers.has(userId)
            ) {
                logger.debug(`Speaking event triggered for user ${userId}`);
                handleUserAudio();
            }
        });

        logger.info(`Successfully subscribed to user ${userId}`);
    }

    /**
     * Process an audio file
     * @param {string} filePath - Path to the audio file
     * @param {Object} user - Discord user
     * @param {Object} textChannel - Text channel
     * @param {string} guildId - Guild ID
     * @returns {Promise<void>}
     * @private
     */
    async _processAudioFile(filePath, user, textChannel, guildId) {
        try {
            // Debug info before transcription
            logger.info(
                `Processing audio file: ${filePath} from user: ${
                    user ? user.username : "Unknown"
                }`,
            );

            // Verify file exists
            if (!fs.existsSync(filePath)) {
                logger.error(`Audio file does not exist: ${filePath}`);
                return;
            }

            // Log file size
            const stats = fs.statSync(filePath);
            logger.info(`Audio file size: ${stats.size} bytes`);

            // Skip processing if file is too small (likely silence)
            if (stats.size < 1000) {
                logger.debug(
                    `Audio file too small, likely silence: ${filePath}`,
                );
                return;
            }

            // Transcribe the audio with explicit debug
            logger.info(`Starting transcription for file: ${filePath}`);
            const transcription = await speechToText.transcribeFile(filePath);
            logger.info(`Transcription result: "${transcription}"`);

            // Check if transcription is empty
            if (!transcription || transcription.trim() === "") {
                logger.debug(`Empty transcription for audio file ${filePath}`);
                return;
            }

            const username = user ? user.username : "Unknown User";
            const userId = user ? user.id : "unknown";

            logger.info(`Transcription from ${username}: ${transcription}`);

            // Determine if the bot should respond - with debug
            const shouldRespond =
                this._shouldRespondToTranscription(transcription);
            logger.info(`Should respond: ${shouldRespond}`);

            if (shouldRespond) {
                // Format the message with the username
                const formattedMessage = `${username} says: ${transcription}`;
                logger.info(`Sending to Ollama: ${formattedMessage}`);

                // Generate response from Ollama
                const response = await ollama.generateResponse(
                    formattedMessage,
                );
                logger.info(`Ollama response: "${response}"`);

                // Convert response to speech and play it
                logger.info(`Speaking response: "${response}"`);
                await this.speak(response, guildId);

                // Optionally, also send the response to the text channel
                if (textChannel) {
                    logger.info(
                        `Sending response to text channel: "${response}"`,
                    );
                    textChannel.send(`**${response}**`);
                }
            }
        } catch (error) {
            logger.error(`Error processing audio file: ${error.message}`, {
                filePath,
            });
            logger.error(error.stack); // Log the full stack trace
        } finally {
            // Clean up the audio file
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (err) {
                logger.error(
                    `Error removing audio file ${filePath}: ${err.message}`,
                );
            }
        }
    }

    /**
     * Determine if the bot should respond to the transcription
     * @param {string} transcription - The transcribed text
     * @returns {boolean} - Whether the bot should respond
     * @private
     */
    _shouldRespondToTranscription(transcription) {
        // Respond to almost everything, except very short utterances and filler words
        const lowerText = transcription.toLowerCase().trim();

        // Log decision making
        logger.debug(`Deciding whether to respond to: "${lowerText}"`);

        // Don't respond to very short utterances (likely noise or filler)
        if (lowerText.length < 3) {
            logger.debug(
                `Not responding - too short: ${lowerText.length} chars`,
            );
            return false;
        }

        // Don't respond to common filler words/sounds when they're alone
        const fillerWords = [
            "um",
            "uh",
            "hmm",
            "ah",
            "oh",
            "eh",
            "mhm",
            "yeah",
            "yep",
            "nope",
            "ok",
            "okay",
            "like",
            "so",
            "well",
            "right",
            "alright",
            "cool",
        ];

        if (fillerWords.includes(lowerText)) {
            logger.debug(`Not responding - filler word: ${lowerText}`);
            return false;
        }

        // ALWAYS respond during testing phase - remove this later for production
        logger.debug(`RESPONDING - TESTING MODE ENABLED`);
        return true;

        // Respond to longer utterances that seem like actual content
        // Use a slightly randomized approach to seem more natural
        // Respond to about 80% of actual statements
        if (lowerText.length > 10 && Math.random() < 0.8) {
            logger.debug(`Responding - longer statement`);
            return true;
        }

        // Always respond to questions
        if (
            lowerText.includes("?") ||
            lowerText.startsWith("what") ||
            lowerText.startsWith("how") ||
            lowerText.startsWith("why") ||
            lowerText.startsWith("when") ||
            lowerText.startsWith("where") ||
            lowerText.startsWith("who") ||
            lowerText.startsWith("which") ||
            lowerText.startsWith("can") ||
            lowerText.startsWith("could") ||
            lowerText.startsWith("would") ||
            lowerText.startsWith("do you") ||
            lowerText.startsWith("are you")
        ) {
            logger.debug(`Responding - question detected`);
            return true;
        }

        // Respond to direct address, even if we don't require it
        const directAddressTerms = [
            "hey",
            "hi",
            "hello",
            "ai",
            "assistant",
            "bot",
        ];

        for (const term of directAddressTerms) {
            if (lowerText.includes(term)) {
                logger.debug(`Responding - direct address term: ${term}`);
                return true;
            }
        }

        // For other statements, respond randomly (about 40% of the time)
        // This makes the AI seem engaged but not overly talkative
        const shouldRespond = Math.random() < 0.4;
        logger.debug(`Random response decision: ${shouldRespond}`);
        return shouldRespond;
    }
}

module.exports = new VoiceManager();
