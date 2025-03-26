/**
 * LLM Client module for interacting with Ollama API
 */
const axios = require("axios");
const { createLogger } = require("../utils/logger");
const config = require("../utils/config");

const logger = createLogger("LLMClient");

// Enhanced system prompt to instruct the model about TTS-friendly responses
const TTS_FRIENDLY_PROMPT = `You are a friendly conversation partner in a Discord voice channel. 
Be natural, casual, and engaging. You're part of the conversation - not an assistant. 
Respond to everyone naturally without needing to be directly addressed.
Keep responses brief and conversational. Occasionally ask questions to keep the conversation flowing.
Include humor and personality. Remember usernames and refer to them when appropriate.

IMPORTANT FORMATTING INSTRUCTIONS:
1. Your responses will be converted to speech, so do NOT use any emojis or special characters.
2. Express emotions using natural language (say "that's funny" instead of using a laughing emoji).
3. Use natural pauses and emphasis instead of special formatting.
4. Keep sentences shorter for better speech flow.
5. Avoid text-only conventions like asterisks for emphasis or actions.
6. Spell out abbreviations when possible for better speech synthesis.
7. Use punctuation naturally to help with speech pacing.

You're just another person in the call hanging out with friends.`;

// Initialize conversation history to maintain context
let conversationHistory = [];

/**
 * Initialize the conversation with a system prompt
 */
function initializeConversation() {
    // Use the TTS-friendly prompt if one isn't specified in config, otherwise use the one from config
    const systemPrompt = config.ollama.systemPrompt || TTS_FRIENDLY_PROMPT;

    conversationHistory = [{ role: "system", content: systemPrompt }];
    logger.info("Conversation initialized with TTS-friendly system prompt");
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
 * Process LLM response to ensure it's TTS-friendly
 * @param {string} response - The raw LLM response
 * @returns {string} - Processed TTS-friendly response
 */
function processTTSFriendlyResponse(response) {
    if (!response) return response;

    // Remove any remaining emojis
    response = response.replace(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
        "",
    );

    // Remove markdown or other text styling that won't work in speech
    response = response
        .replace(/\*\*(.*?)\*\*/g, "$1") // Bold
        .replace(/\*(.*?)\*/g, "$1") // Italic
        .replace(/__(.*?)__/g, "$1") // Underline
        .replace(/~~(.*?)~~/g, "$1") // Strikethrough
        .replace(/```(.*?)```/gs, "$1") // Code blocks
        .replace(/`(.*?)`/g, "$1"); // Inline code

    // Replace text emojis
    response = response
        .replace(/:\)/g, "")
        .replace(/:\(/g, "")
        .replace(/;\)/g, "")
        .replace(/:\D/g, "")
        .replace(/\bxD\b/gi, "")
        .replace(/<3/g, "");

    return response;
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

        // Extract and process response
        let aiResponse = response.data.message.content;
        aiResponse = processTTSFriendlyResponse(aiResponse);

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
