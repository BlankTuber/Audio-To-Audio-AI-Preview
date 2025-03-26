const {
    Client,
    Events,
    GatewayIntentBits,
    Collection,
    REST,
    Routes,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("../config");
const logger = require("../utils/logger");
const commands = require("./commands");

class DiscordBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.MessageContent,
            ],
        });

        this.commands = new Collection();

        // Register commands
        for (const command of commands) {
            this.commands.set(command.data.name, command);
        }

        // Set up event listeners
        this._setupEventListeners();

        logger.info("Discord bot initialized");
    }

    /**
     * Start the Discord bot
     * @returns {Promise<void>}
     */
    async start() {
        try {
            logger.info("Starting Discord bot");

            // Log in to Discord
            await this.client.login(config.discord.token);

            // Register slash commands
            await this._registerCommands();

            // Set the client in the voice manager
            const voiceManager = require("./voice");
            voiceManager.setClient(this.client);

            logger.info(`Bot logged in as ${this.client.user.tag}`);
        } catch (error) {
            logger.error(`Error starting Discord bot: ${error.message}`);
            throw error;
        }
    }

    /**
     * Stop the Discord bot
     * @returns {Promise<void>}
     */
    async stop() {
        try {
            logger.info("Stopping Discord bot");

            // Destroy the client
            this.client.destroy();

            logger.info("Discord bot stopped");
        } catch (error) {
            logger.error(`Error stopping Discord bot: ${error.message}`);
        }
    }

    /**
     * Set up event listeners
     * @private
     */
    _setupEventListeners() {
        this.client.once(Events.ClientReady, () => {
            logger.info("Discord client ready");
        });

        this.client.on(Events.InteractionCreate, async (interaction) => {
            if (!interaction.isCommand()) return;

            const command = this.commands.get(interaction.commandName);

            if (!command) {
                logger.warn(
                    `No command matching ${interaction.commandName} was found`,
                );
                return;
            }

            try {
                logger.debug(`Executing command: ${interaction.commandName}`);
                await command.execute(interaction);
            } catch (error) {
                logger.error(
                    `Error executing command ${interaction.commandName}: ${error.message}`,
                );

                const replyContent = {
                    content: "There was an error while executing this command!",
                    ephemeral: true,
                };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(replyContent);
                } else {
                    await interaction.reply(replyContent);
                }
            }
        });

        // Handle error events
        this.client.on(Events.Error, (error) => {
            logger.error(`Discord client error: ${error.message}`);
        });

        // Handle warning events
        this.client.on(Events.Warn, (warning) => {
            logger.warn(`Discord client warning: ${warning}`);
        });
    }

    /**
     * Register slash commands
     * @returns {Promise<void>}
     * @private
     */
    async _registerCommands() {
        try {
            logger.info("Registering slash commands");

            const commandsData = commands.map((command) =>
                command.data.toJSON(),
            );

            const rest = new REST({ version: "10" }).setToken(
                config.discord.token,
            );

            // Force update commands on each launch
            logger.info("Force-updating application commands...");

            // If a guild ID is provided, register commands for that guild only (faster updates during development)
            if (config.discord.guildId) {
                await rest.put(
                    Routes.applicationGuildCommands(
                        config.discord.clientId,
                        config.discord.guildId,
                    ),
                    { body: commandsData },
                );
                logger.info(
                    `Registered ${commandsData.length} guild commands for guild ${config.discord.guildId}`,
                );
            } else {
                // Otherwise, register global commands (takes up to an hour to propagate)
                await rest.put(
                    Routes.applicationCommands(config.discord.clientId),
                    { body: commandsData },
                );
                logger.info(
                    `Registered ${commandsData.length} global commands`,
                );
            }
        } catch (error) {
            logger.error(`Error registering slash commands: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new DiscordBot();
