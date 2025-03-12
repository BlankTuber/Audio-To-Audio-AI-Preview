# Audio-To-Audio-AI-Preview

A preview of a STT-LLM-TTS pipeline made with python. Works as a discord bot.

```md
discord_bot/
├── .env # Environment variables (API keys, tokens, etc.)
├── .gitignore # Files to be ignored by Git
├── package.json # Your project dependencies
├── package-lock.json # Dependency lock file
├── README.md # Project documentation
├── main.js # Entry point for your application
│
├── src/ # Source code
│ ├── commands/ # Bot commands
│ │ ├── general/ # General purpose commands
│ │ │ ├── help.js
│ │ │ ├── ping.js
│ │ │ └── info.js
│ │ ├── voice/ # Voice-related commands
│ │ │ ├── join.js
│ │ │ ├── leave.js
│ │ │ └── speak.js
│ │ └── ai/ # AI-related commands
│ │ ├── chat.js
│ │ └── transcribe.js
│ │
│ ├── events/ # Discord.js event handlers
│ │ ├── interactionCreate.js
│ │ ├── messageCreate.js
│ │ ├── ready.js
│ │ └── voiceStateUpdate.js
│ │
│ ├── services/ # External services integration
│ │ ├── ai/
│ │ │ ├── ollama.js # Ollama API integration
│ │ │ └── whisper.js # Whisper API integration
│ │ └── voice/
│ │ ├── speechSynth.js # Text-to-speech service
│ │ └── audioHandler.js # Audio processing utilities
│ │
│ ├── utils/ # Utility functions
│ │ ├── logger.js # Logging utility
│ │ ├── config.js # Configuration loader
│ │ └── helpers.js # General helper functions
│ │
│ └── handlers/ # Command and event handlers
│ ├── commandHandler.js # Loads and registers commands
│ └── eventHandler.js # Loads and registers events
│
├── assets/ # Static assets
│ ├── audio/ # Audio files
│ └── images/ # Image files
│
├── config/ # Configuration files
│ └── bot-config.js # Bot configuration
│
└── temp/ # Temporary files (voice recordings, etc.)
└── .gitkeep # Keep the folder in git but ignore contents
```
