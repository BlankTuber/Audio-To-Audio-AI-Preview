# Discord AI Voice Chat Bot

This project creates a Discord bot that can listen to voice chat, convert speech to text, process it with an AI, and respond with synthesized speech.

## Components

- Discord Bot (Python, Discord.py)
- API Server (Node.js, Express, Socket.IO)
- Speech Services (Python, Whisper, Yapper-TTS)
- AI Service (Python, Ollama)
- Web Dashboard (HTML, CSS, JavaScript)

## Setup Instructions

1. Install dependencies:
   - For Python components: `pip install -r requirements.txt` in each Python directory
   - For Node.js components: `npm install` in the api_server directory

2. Configure your .env file with appropriate tokens and settings

3. Start all services:
   ```
   ./scripts/start.sh
   ```

## Project Timeline

- Week 1: Planning and Discord bot setup
- Week 2: Discord bot and speech-to-text
- Week 3: AI integration and text-to-speech
- Week 4: Final integration and testing
