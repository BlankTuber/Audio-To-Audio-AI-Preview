## Conversation Features

The bot is designed to behave as a natural conversation partner rather than an assistant:

### Natural Responses

-   Responds to statements without requiring direct addressing ("Hey AI")
-   Joins conversations naturally based on context
-   Chooses when to respond based on content (not just commands)
-   Remembers usernames and refers to them in responses

### User Awareness

-   Tracks who's speaking and includes usernames in context
-   Announces when users join or leave the voice channel
-   Maintains separate conversation history for better context
-   Preserves more conversation history (20 messages) for natural flow

### Response Behavior

-   Responds to most questions (prefixed with who, what, when, etc.)
-   Responds to about 80% of substantive statements
-   Randomly responds to about 40% of other statements
-   Ignores very short utterances and filler words
-   Adds personality and occasional questions to keep conversation flowing# Discord AI Voice Assistant Bot

A Discord bot that listens to voice channels, transcribes speech using Google's Speech-to-Text API, processes the transcriptions with Ollama LLM, and responds with voice using Google's Text-to-Speech API.

## Features

-   **Speech-to-Text**: Converts user voice input to text using Google Cloud Speech-to-Text
-   **Natural Language Processing**: Processes text with Ollama LLM (using the official Ollama npm package)
-   **Text-to-Speech**: Converts Ollama responses to speech using Google Cloud Text-to-Speech
-   **Voice Channel Integration**: Joins Discord voice channels to listen and respond
-   **Natural Conversation**: Responds naturally without requiring trigger phrases or direct addressing
-   **User Tracking**: Monitors users joining and leaving the channel and maintains conversation context
-   **Smart User Filtering**: Selectively listens to users (ignores bots and can be configured to ignore specific users)
-   **Slash Commands**: Easy-to-use commands for interacting with the bot
-   **Conversation Context**: Maintains context across multiple interactions with username awareness

## Requirements

-   Node.js v16.9.0 or higher
-   Discord Bot Token with proper permissions
-   Google Cloud project with Speech-to-Text and Text-to-Speech APIs enabled
-   Ollama running locally or on a server
-   FFmpeg installed on your system

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory with the following variables:

```
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_token
CLIENT_ID=your_client_id
GUILD_ID=your_guild_id

# Ollama Configuration
OLLAMA_API_HOST=http://localhost:11434
OLLAMA_DEFAULT_MODEL=mistral
OLLAMA_SYSTEM_PROMPT="You are an AI assistant in a Discord voice channel..."

# Google Cloud Configuration
GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json

# Optional Configurations
TTS_VOICE_NAME=en-US-Neural2-C
STT_LANGUAGE_CODE=en-US
DEBUG=false
```

### 3. Google Cloud Setup

1. Create a Google Cloud project
2. Enable the Speech-to-Text and Text-to-Speech APIs
3. Create a service account with the necessary permissions
4. Download the service account key JSON file
5. Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of this file

### Ollama Configuration

The bot uses Ollama for natural language processing. To set up Ollama:

1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Start the Ollama service:
    ```bash
    systemctl start ollama
    # or
    ollama serve
    ```
3. Pull your desired model:
    ```bash
    ollama pull mistral
    # or
    ollama pull gemma:2b
    # or any other model
    ```
4. Set the model name in your `.env` file:
    ```
    OLLAMA_DEFAULT_MODEL=mistral
    ```

#### Ollama Connection Issues

If the bot starts before Ollama is running, it will:

1. Try to connect to Ollama multiple times
2. Start anyway to allow Discord functionality
3. Periodically check for Ollama availability in the background
4. Automatically start using Ollama once it becomes available

You can check the status of Ollama with:

```bash
sudo systemctl status ollama
```

You can also use the `/status` command in Discord to check if the bot can connect to Ollama.

### 5. Start the Bot

```bash
npm start
```

## Bot Commands

The bot provides the following slash commands:

-   `/join` - Join your current voice channel
-   `/leave` - Leave the voice channel
-   `/ask <question>` - Ask a question via text (bot will respond in both text and voice)
-   `/say <message>` - Make the bot say something in the voice channel
-   `/status` - Check the status of bot services
-   `/reset` - Reset the conversation context

## Voice Interaction

The bot listens in voice channels and responds when:

1. You directly address it with phrases like "Hey AI" or "Hey Assistant"
2. You ask a question (sentences ending with ? or starting with what, how, why, etc.)

The bot is designed to be non-intrusive and only respond when it's clear you're talking to it.

## Customization

You can customize the bot's behavior by adjusting the environment variables:

-   Change the Ollama model by setting `OLLAMA_DEFAULT_MODEL`
-   Modify the AI's persona by adjusting `OLLAMA_SYSTEM_PROMPT`
-   Change the voice by setting `TTS_VOICE_NAME` and `TTS_LANGUAGE_CODE`
-   Adjust speech parameters with `TTS_SPEAKING_RATE` and `TTS_PITCH`

### User Filtering

The bot includes a smart system for filtering which users it listens to. By default, it ignores:

-   All bot users
-   Its own voice

You can extend this filtering by modifying the `_shouldListenToUser` method in `src/discord/voice.js`:

```javascript
_shouldListenToUser(user) {
  // Don't listen to bots
  if (user.bot) return false;

  // Don't listen to self
  if (this.client && user.id === this.client.user.id) return false;

  // Example: Ignore specific users by ID
  const ignoredUserIds = ['123456789012345678', '987654321098765432'];
  if (ignoredUserIds.includes(user.id)) return false;

  // Example: Only listen to users with specific roles
  if (this.client) {
    const guild = this.client.guilds.cache.get('YOUR_GUILD_ID');
    const member = guild?.members.cache.get(user.id);
    const allowedRoleId = 'ROLE_ID_TO_ALLOW';
    if (member && !member.roles.cache.has(allowedRoleId)) return false;
  }

  return true;
}

## Troubleshooting

- Make sure ffmpeg is installed and accessible in your PATH
- Check that Ollama is running and accessible
- Verify that your Google Cloud credentials are valid and have the necessary permissions
- Ensure the bot has the required Discord permissions (Send Messages, Connect, Speak)

### Common Errors

#### TypeError: Cannot read properties of undefined (reading 'client')

If you encounter this error, it means the bot is having trouble accessing the Discord client in the voice connection. This has been fixed in the latest version by:

1. Storing the client reference directly in the VoiceManager
2. Properly handling cases where user lookup might fail
3. Adding robust error handling throughout the audio processing pipeline

If you still encounter this error, try:
- Restarting the bot
- Making sure you're using Discord.js v14
- Checking that all dependencies are properly installed
- Ensuring your Discord bot token has the necessary permissions
```
