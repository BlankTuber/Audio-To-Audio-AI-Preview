# Audio-To-Audio-AI-Preview
A preview of a STT-LLM-TTS pipeline made with python. Works as a discord bot.

discord-ai-bot/
│
├── .env                      # Environment variables (API keys, tokens)
├── .gitignore                # Git ignore file
├── README.md                 # Project documentation
│
├── discord_bot/              # Python Discord bot
│   ├── __init__.py
│   ├── bot.py                # Main Discord bot code
│   ├── config.py             # Bot configuration
│   ├── audio_handler.py      # Audio recording and streaming
│   ├── utils/
│   │   ├── __init__.py
│   │   └── helpers.py        # Helper functions
│   └── requirements.txt      # Python dependencies
│
├── api_server/               # Node.js Express API server
│   ├── package.json          # Node.js dependencies
│   ├── server.js             # Main server file
│   ├── routes/
│   │   ├── index.js          # Route definitions
│   │   └── api.js            # API endpoints
│   ├── controllers/
│   │   └── socket_controller.js  # Socket.IO handlers
│   ├── middleware/
│   │   └── auth.js           # Authentication middleware
│   └── utils/
│       └── helpers.js        # Utility functions
│
├── speech_services/          # Python speech processing services
│   ├── __init__.py
│   ├── app.py                # Flask application
│   ├── whisper_service.py    # Speech-to-text using Whisper
│   ├── tts_service.py        # Text-to-speech using Yapper-tts
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── audio_utils.py    # Audio processing utilities
│   │   └── ffmpeg_utils.py   # FFmpeg wrapper functions
│   └── requirements.txt      # Python dependencies
│
├── ai_service/               # AI service using Ollama
│   ├── __init__.py
│   ├── llm_service.py        # LLM integration with Ollama
│   ├── prompts/              # Prompt templates
│   │   └── base_prompt.txt   # Base conversation prompt
│   └── requirements.txt      # Python dependencies
│
├── web_dashboard/            # Optional web monitoring dashboard
│   ├── index.html            # Main dashboard page
│   ├── css/
│   │   └── styles.css        # Dashboard styles
│   ├── js/
│   │   ├── dashboard.js      # Dashboard functionality
│   │   └── socket-client.js  # Socket.IO client
│   └── assets/
│       └── img/              # Images and icons
│
└── scripts/                  # Utility scripts
    ├── install.sh            # Installation script
    ├── start.sh              # Start all services
    └── setup_ollama.sh       # Set up Ollama models