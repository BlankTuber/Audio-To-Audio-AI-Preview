const ollama = require("ollama");
const config = require("../config");
const logger = require("../utils/logger");

class OllamaService {
    constructor() {
        this.apiHost = config.ollama.apiHost;
        this.defaultModel = config.ollama.defaultModel;
        this.systemPrompt = config.ollama.systemPrompt;
        this.conversationHistory = [];

        // Configure Ollama client with proper host
        if (this.apiHost && this.apiHost !== "http://localhost:11434") {
            // Set the host based on package requirements
            ollama.host = this.apiHost;
        }

        logger.info("Ollama service initialized", {
            apiHost: this.apiHost,
            defaultModel: this.defaultModel,
        });
    }

    /**
     * Send a message to Ollama and get a response
     * @param {string} userMessage - The message from the user
     * @param {string} [model] - The model to use (optional, defaults to configured model)
     * @returns {Promise<string>} - The response from Ollama
     */
    async generateResponse(userMessage, model = this.defaultModel) {
        try {
            // First check if Ollama is available
            const isAvailable = await this.checkAvailability();
            if (!isAvailable) {
                return "I'm sorry, I can't connect to my language model right now. Please check if Ollama is running.";
            }

            // Check if the requested model is available
            const isModelAvailable = await this.isModelAvailable(model);
            if (!isModelAvailable) {
                const models = await this.getAvailableModels();
                if (models.length > 0) {
                    // Use the first available model as fallback
                    const fallbackModel = models[0];
                    logger.warn(
                        `Model ${model} not available. Falling back to ${fallbackModel}`,
                    );
                    model = fallbackModel;
                } else {
                    return "I'm sorry, the language model I need isn't available right now. Please check your Ollama installation.";
                }
            }

            logger.debug(`Generating response for: "${userMessage}"`, {
                model,
            });

            // Prepare the request
            const messages = [
                {
                    role: "system",
                    content: this.systemPrompt,
                },
            ];

            // Add previous conversation messages if available
            if (this.conversationHistory.length > 0) {
                messages.push(...this.conversationHistory);
            }

            // Add the current user message
            messages.push({
                role: "user",
                content: userMessage,
            });

            // Generate the response with timeout
            const chatPromise = new Promise((resolve, reject) => {
                ollama
                    .chat({
                        model: model,
                        messages: messages,
                        stream: false,
                    })
                    .then(resolve)
                    .catch(reject);
            });

            // Add a timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(
                    () =>
                        reject(
                            new Error(
                                "Ollama request timed out after 30 seconds",
                            ),
                        ),
                    30000,
                );
            });

            // Race the response against the timeout
            const response = await Promise.race([chatPromise, timeoutPromise]);

            // Extract the response text
            const responseText = response.message.content;

            // Store the conversation history
            this.conversationHistory = [
                ...messages.slice(1), // Skip the system message
                {
                    role: "assistant",
                    content: responseText,
                },
            ];

            // Limit history length but keep enough for good context
            // For a natural conversation, we want to maintain more context
            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(
                    this.conversationHistory.length - 20,
                );
            }

            logger.debug(
                `Response generated: "${responseText.substring(0, 100)}${
                    responseText.length > 100 ? "..." : ""
                }"`,
            );
            return responseText;
        } catch (error) {
            logger.error(
                "Error generating response from Ollama:",
                error.message,
            );

            // Provide specific error messages based on the error type
            if (error.code === "ECONNREFUSED") {
                return "I'm sorry, I can't reach my language model right now. Please check if Ollama is running.";
            } else if (error.message.includes("timed out")) {
                return "I'm sorry, my language model is taking too long to respond. It might be busy with other tasks.";
            } else if (error.response && error.response.status === 404) {
                return "I'm sorry, the language model I'm trying to use isn't available. Please check your Ollama configuration.";
            } else if (error.response && error.response.status === 400) {
                return "I'm sorry, there was an issue with my request to the language model. This might be a configuration problem.";
            }

            // Generic fallback message
            return "I'm sorry, I'm having trouble processing your request right now. Could you try again in a moment?";
        }
    }

    /**
     * Reset the conversation history
     */
    resetConversation() {
        logger.debug("Resetting conversation history");
        this.conversationHistory = [];
    }

    /**
     * Check if Ollama service is available
     * @returns {Promise<boolean>} - True if Ollama is available
     */
    async checkAvailability() {
        try {
            // Use a simple model list request to check availability
            const response = await fetch(`${this.apiHost}/api/tags`);
            if (!response.ok) {
                throw new Error(
                    `Failed to get models: ${response.status} ${response.statusText}`,
                );
            }

            const data = await response.json();
            const models = data.models || [];
            logger.debug(
                `Ollama is available. Models: ${models
                    .map((m) => m.name)
                    .join(", ")}`,
            );
            return true;
        } catch (error) {
            // Provide more detailed error information for debugging
            if (error.code === "ECONNREFUSED") {
                logger.error(
                    `Ollama connection refused at ${this.apiHost}. Is Ollama running?`,
                );
            } else if (error.code === "ENOTFOUND") {
                logger.error(
                    `Ollama host not found at ${this.apiHost}. Check your network or host configuration.`,
                );
            } else {
                logger.error(`Ollama service error: ${error.message}`);
            }
            return false;
        }
    }

    /**
     * Get a list of available models
     * @returns {Promise<Array>} - List of available models
     */
    async getAvailableModels() {
        try {
            const response = await fetch(`${this.apiHost}/api/tags`);
            if (!response.ok) {
                throw new Error(
                    `Failed to get models: ${response.status} ${response.statusText}`,
                );
            }

            const data = await response.json();
            const models = (data.models || []).map((model) => model.name);
            logger.debug(`Available Ollama models: ${models.join(", ")}`);
            return models;
        } catch (error) {
            logger.error(`Error getting available models: ${error.message}`);
            return [];
        }
    }

    /**
     * Verify if a specific model is available
     * @param {string} modelName - The model to check
     * @returns {Promise<boolean>} - True if the model is available
     */
    async isModelAvailable(modelName) {
        try {
            const models = await this.getAvailableModels();
            return models.includes(modelName);
        } catch (error) {
            logger.error(`Error checking model availability: ${error.message}`);
            return false;
        }
    }
}

module.exports = new OllamaService();
