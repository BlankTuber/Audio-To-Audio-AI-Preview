/**
 * LLM Client module for interacting with Ollama API
 */
const axios = require("axios");
const { createLogger } = require("../utils/logger");
const config = require("../utils/config");

const logger = createLogger("LLMClient");

// Initialize conversation history to maintain context
let conversationHistory = [];

/**
 * Initialize the conversation with a system prompt
 */
function initializeConversation() {
    conversationHistory = [
        { role: "system", content: config.ollama.systemPrompt },
    ];
    logger.info("Conversation initialized with system prompt");
}

/**
 * Add a user message to the conversation
 * @param {string} username - The username of the speaker
 * @param {string} message - The transcribed message
 */
function addUserMessage(username, message) {
    if (!message || message.trim() === "") {
        return;
    }

    const formattedMessage = `${username}: ${message}`;
    conversationHistory.push({
        role: "user",
        content: formattedMessage,
    });

    // Keep conversation history at a reasonable size (last 10 messages)
    if (conversationHistory.length > 11) {
        // 1 system + 10 messages
        conversationHistory = [
            conversationHistory[0], // Keep system prompt
            ...conversationHistory.slice(-10), // Keep last 10 messages
        ];
    }
}

/**
 * Generate a response from the LLM
 * @returns {Promise<string|null>} - The generated response or null if error
 */
async function generateResponse() {
    try {
        logger.debug("Generating response from Ollama");

        // Prepare request to Ollama API
        const response = await axios.post(`${config.ollama.apiHost}/api/chat`, {
            model: config.ollama.model,
            messages: conversationHistory,
            stream: false,
        });

        // Extract response
        const aiResponse = response.data.message.content;

        // Add AI response to conversation history
        conversationHistory.push({
            role: "assistant",
            content: aiResponse,
        });

        logger.debug(`AI response: ${aiResponse}`);
        return aiResponse;
    } catch (error) {
        logger.error("Error generating response from Ollama:", error);
        return null;
    }
}

// Initialize conversation on module load
initializeConversation();

module.exports = {
    addUserMessage,
    generateResponse,
    initializeConversation,
};
