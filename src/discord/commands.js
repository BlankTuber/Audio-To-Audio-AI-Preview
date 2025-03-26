const { SlashCommandBuilder } = require("discord.js");
const voiceManager = require("./voice");
const ollama = require("../services/ollama");
const textToSpeech = require("../services/textToSpeech");
const logger = require("../utils/logger");

// Command to join a voice channel
const joinCommand = {
    data: new SlashCommandBuilder()
        .setName("join")
        .setDescription("Join your voice channel"),

    async execute(interaction) {
        try {
            // Check if user is in a voice channel
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                return interaction.reply({
                    content: "You need to be in a voice channel first!",
                    ephemeral: true,
                });
            }

            // Check for required permissions
            const permissions = voiceChannel.permissionsFor(
                interaction.client.user,
            );
            if (!permissions.has("Connect") || !permissions.has("Speak")) {
                return interaction.reply({
                    content:
                        "I need permission to join and speak in your voice channel!",
                    ephemeral: true,
                });
            }

            // Defer reply while joining
            await interaction.deferReply();

            // Join the voice channel
            await voiceManager.joinChannel(voiceChannel, interaction.channel);

            // Send welcome message
            await interaction.editReply(
                "Joined your voice channel! I'm listening and ready to chat.",
            );
        } catch (error) {
            logger.error(`Error executing join command: ${error.message}`);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(
                    "There was an error trying to join the voice channel!",
                );
            } else {
                await interaction.reply({
                    content:
                        "There was an error trying to join the voice channel!",
                    ephemeral: true,
                });
            }
        }
    },
};

// Command to leave the voice channel
const leaveCommand = {
    data: new SlashCommandBuilder()
        .setName("leave")
        .setDescription("Leave the voice channel"),

    async execute(interaction) {
        try {
            // Check if bot is in a voice channel
            const guildId = interaction.guildId;

            // Leave the voice channel
            voiceManager.leaveChannel(guildId);

            // Send confirmation
            await interaction.reply("Left the voice channel!");
        } catch (error) {
            logger.error(`Error executing leave command: ${error.message}`);
            await interaction.reply({
                content:
                    "There was an error trying to leave the voice channel!",
                ephemeral: true,
            });
        }
    },
};

// Command to ask a question directly via text
const askCommand = {
    data: new SlashCommandBuilder()
        .setName("ask")
        .setDescription("Ask me something via text")
        .addStringOption((option) =>
            option
                .setName("question")
                .setDescription("What would you like to ask?")
                .setRequired(true),
        ),

    async execute(interaction) {
        try {
            const question = interaction.options.getString("question");

            // Defer reply while processing
            await interaction.deferReply();

            // Format the message with the username for consistency with voice
            const formattedMessage = `${interaction.user.username} says: ${question}`;
            logger.debug(
                `Text input from ${interaction.user.username}: "${question}"`,
            );

            // Generate response from Ollama
            logger.debug(`Sending to Ollama: ${formattedMessage}`);
            const response = await ollama.generateResponse(formattedMessage);
            logger.debug(`Ollama response: "${response}"`);

            // Reply with the text response
            await interaction.editReply(`**${response}**`);

            // If bot is in a voice channel, also speak the response
            const guildId = interaction.guildId;
            if (voiceManager.connections.has(guildId)) {
                await voiceManager.speak(response, guildId);
            }
        } catch (error) {
            logger.error(`Error executing ask command: ${error.message}`);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(
                    "There was an error processing your question!",
                );
            } else {
                await interaction.reply({
                    content: "There was an error processing your question!",
                    ephemeral: true,
                });
            }
        }
    },
};

// Command to say something in the voice channel
const sayCommand = {
    data: new SlashCommandBuilder()
        .setName("say")
        .setDescription("Make me say something in the voice channel")
        .addStringOption((option) =>
            option
                .setName("message")
                .setDescription("What would you like me to say?")
                .setRequired(true),
        ),

    async execute(interaction) {
        try {
            const message = interaction.options.getString("message");
            const guildId = interaction.guildId;

            // Check if bot is in a voice channel
            if (!voiceManager.connections.has(guildId)) {
                return interaction.reply({
                    content: "I'm not in a voice channel! Use /join first.",
                    ephemeral: true,
                });
            }

            // Defer reply while processing
            await interaction.deferReply();

            // Say the message
            await voiceManager.speak(message, guildId);

            // Confirm message was spoken
            await interaction.editReply(`I said: "${message}"`);
        } catch (error) {
            logger.error(`Error executing say command: ${error.message}`);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(
                    "There was an error trying to say that message!",
                );
            } else {
                await interaction.reply({
                    content: "There was an error trying to say that message!",
                    ephemeral: true,
                });
            }
        }
    },
};

// Command to check status of services
const statusCommand = {
    data: new SlashCommandBuilder()
        .setName("status")
        .setDescription("Check the status of the bot services"),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            // Check Ollama availability
            const ollamaAvailable = await ollama.checkAvailability();
            let ollamaStatus = ollamaAvailable
                ? "✅ Connected"
                : "❌ Not available";

            // If Ollama is available, check the model
            let modelStatus = "";
            if (ollamaAvailable) {
                const models = await ollama.getAvailableModels();
                const configModel = ollama.defaultModel;

                if (models.includes(configModel)) {
                    modelStatus = `\n- Model ${configModel}: ✅ Available`;
                } else {
                    modelStatus = `\n- Model ${configModel}: ❌ Not found\n- Available models: ${models.join(
                        ", ",
                    )}`;
                }
            }

            // Check voice connections
            const guildId = interaction.guildId;
            const voiceStatus = voiceManager.connections.has(guildId)
                ? "✅ Connected"
                : "❌ Not connected";

            // Get connection details if connected
            let voiceDetails = "";
            if (voiceManager.connections.has(guildId)) {
                const connection = voiceManager.connections.get(guildId);
                const channelId = connection.joinConfig.channelId;
                const channel = interaction.guild.channels.cache.get(channelId);
                if (channel) {
                    voiceDetails = `\n- Connected to: ${channel.name}`;
                }
            }

            // Compile status information
            const statusMessage = `
**Bot Status:**
- Ollama API: ${ollamaStatus}${modelStatus}
- Voice Channel: ${voiceStatus}${voiceDetails}
- Speech-to-Text: ✅ Ready
- Text-to-Speech: ✅ Ready

**Bot Version:** 1.0.0
**Command Latency:** ${Date.now() - interaction.createdTimestamp}ms

${
    !ollamaAvailable
        ? "⚠️ **Warning:** Ollama is not available. Voice responses won't work until Ollama is running."
        : ""
}
`;

            await interaction.editReply(statusMessage);
        } catch (error) {
            logger.error(`Error executing status command: ${error.message}`);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(
                    "There was an error checking the status!",
                );
            } else {
                await interaction.reply({
                    content: "There was an error checking the status!",
                    ephemeral: true,
                });
            }
        }
    },
};

// Command to reset the conversation context
const resetCommand = {
    data: new SlashCommandBuilder()
        .setName("reset")
        .setDescription("Reset the conversation context"),

    async execute(interaction) {
        try {
            // Reset Ollama conversation context
            ollama.resetConversation();

            await interaction.reply("Conversation context has been reset!");
        } catch (error) {
            logger.error(`Error executing reset command: ${error.message}`);
            await interaction.reply({
                content: "There was an error resetting the conversation!",
                ephemeral: true,
            });
        }
    },
};

// Command to run audio test
const testCommand = {
    data: new SlashCommandBuilder()
        .setName("testaudio")
        .setDescription("Run a test of the audio transcription system"),

    async execute(interaction) {
        try {
            // Defer reply while processing
            await interaction.deferReply();

            // Import test function
            const { testAudioTranscription } = require("../utils/audioTester");

            // Run the test
            await interaction.editReply("Running audio transcription test...");

            const result = await testAudioTranscription();

            // Send the results
            await interaction.editReply(`**Audio Test Results:**\n${result}`);
        } catch (error) {
            logger.error(`Error executing test command: ${error.message}`);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(
                    "There was an error running the audio test!",
                );
            } else {
                await interaction.reply({
                    content: "There was an error running the audio test!",
                    ephemeral: true,
                });
            }
        }
    },
};

// Command to refresh slash commands
const refreshCommand = {
    data: new SlashCommandBuilder()
        .setName("refresh")
        .setDescription("Refresh the bot's slash commands")
        .addBooleanOption((option) =>
            option
                .setName("global")
                .setDescription(
                    "Whether to refresh global commands (takes up to an hour)",
                )
                .setRequired(false),
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const isGlobal = interaction.options.getBoolean("global") || false;

            const { REST, Routes } = require("discord.js");
            const config = require("../config");

            const commandsData = interaction.client.commands.map((command) =>
                typeof command.data.toJSON === "function"
                    ? command.data.toJSON()
                    : command.data,
            );

            const rest = new REST({ version: "10" }).setToken(
                config.discord.token,
            );

            if (isGlobal) {
                await rest.put(
                    Routes.applicationCommands(config.discord.clientId),
                    { body: commandsData },
                );
                await interaction.editReply(
                    "✅ Refreshed global slash commands! (May take up to an hour to propagate)",
                );
            } else {
                await rest.put(
                    Routes.applicationGuildCommands(
                        config.discord.clientId,
                        interaction.guildId,
                    ),
                    { body: commandsData },
                );
                await interaction.editReply(
                    "✅ Refreshed guild slash commands! (Should be available immediately)",
                );
            }
        } catch (error) {
            logger.error(`Error executing refresh command: ${error.message}`);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(
                    "⚠️ There was an error refreshing commands!",
                );
            } else {
                await interaction.reply({
                    content: "⚠️ There was an error refreshing commands!",
                    ephemeral: true,
                });
            }
        }
    },
};

module.exports = [
    joinCommand,
    leaveCommand,
    askCommand,
    sayCommand,
    statusCommand,
    resetCommand,
    testCommand,
    refreshCommand,
];
