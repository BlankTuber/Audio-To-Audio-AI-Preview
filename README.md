# 🎙️ Audio-To-Audio-AI-Preview 🤖

## 📋 Project Summary

This minimalist MVP implements a basic audio processing pipeline for Discord that connects speech-to-text, large language models, and text-to-speech technologies. The bot listens to voice channel input, transcribes it, processes the text through an LLM, and responds with generated speech - creating a simple audio-to-audio AI assistant experience.

## 🛠️ Tech Stack

-   **Python 3.9+** - Core programming language
-   **Discord.py** - Discord bot framework with voice channel support
-   **Whisper** - OpenAI's speech recognition model for transcription
-   **WebRTC VAD** - Voice activity detection to identify speech
-   **Ollama** - Local LLM hosting for text processing
-   **Mozilla TTS** - High-quality text-to-speech synthesis
-   **FFmpeg** - Audio processing dependency

## ⚙️ Setup & Installation

### Prerequisites

-   Python 3.9+ installed
-   FFmpeg installed
-   Discord Developer account with bot token
-   Sufficient hardware for running Ollama models locally

### Installation Steps

1. **Clone the repository**

    ```bash
    git clone https://github.com/yourusername/Audio-To-Audio-AI-Preview.git
    cd Audio-To-Audio-AI-Preview
    ```

2. **Create virtual environment**

    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

3. **Install dependencies**

    ```bash
    pip install -r requirements.txt
    ```

4. **Configure environment variables**

    - Create a `.env` file with:

        ```py
        # Discord Bot Configuration
        DISCORD_TOKEN=
        CLIENT_ID=
        GUILD_ID=

        # Ollama Configuration
        OLLAMA_API_HOST=http://localhost:11434
        OLLAMA_DEFAULT_MODEL=mistral
        ```

5. **Initialize Ollama**

    ```bash
    ollama pull mistral
    ```

## 🗺️ Implementation Roadmap

### Phase 1: 🏗️ Foundation (Days 1-2)

-   [x] Set up project structure and environment
-   [ ] Implement basic Discord bot with slash command handling
-   [ ] Add voice channel connection capabilities
-   [ ] Create simple configuration loading from .env

### Phase 2: 🎤 Speech-to-Text Integration (Days 3-5)

-   [ ] Integrate Whisper model for audio transcription
    -   Use `openai-whisper` package for processing
    -   Implement basic audio recording and saving
-   [ ] Implement WebRTC VAD for voice activity detection
-   [ ] Create audio capture pipeline with VAD triggers

### Phase 3: 🧠 LLM Processing (Days 6-8)

-   [ ] Set up Ollama client connection
    -   Use `ollama` package for API communication
    -   Create simple conversation context management
-   [ ] Design basic assistant prompt template
-   [ ] Implement minimal error handling

### Phase 4: 🔊 Text-to-Speech Generation (Days 9-11)

-   [ ] Implement Mozilla TTS for speech synthesis
    -   Set up with default voice model
    -   Create basic audio output mechanism
-   [ ] Build simple audio playback system

### Phase 5: 🔄 Pipeline Integration (Days 12-14)

-   [ ] Connect all components into a functional pipeline
-   [ ] Implement basic slash commands:
    -   `/join` - Join voice channel
    -   `/leave` - Leave voice channel
    -   `/listen` - Toggle listening mode
-   [ ] Test end-to-end conversation flow

## 📁 Project Structure

```py
Audio-To-Audio-AI-Preview/
├── .env                        # Environment variables
├── .gitignore                  # Git ignore file
├── README.md                   # Project documentation
├── main.py                     # Entry point for the application
├── requirements.txt            # Python dependencies
├── src/                        # Source code
│   ├── bot/                    # Discord bot functionality
│   │   ├── __init__.py
│   │   ├── client.py           # Discord client setup
│   │   └── commands.py         # Slash commands
│   ├── stt/                    # Speech-to-text components
│   │   ├── __init__.py
│   │   ├── whisper_client.py   # Whisper integration
│   │   └── vad.py              # Voice activity detection
│   ├── llm/                    # LLM processing
│   │   ├── __init__.py
│   │   └── ollama_client.py    # Ollama integration
│   ├── tts/                    # Text-to-speech components
│   │   ├── __init__.py
│   │   └── tts_engine.py       # TTS integration
│   └── utils/                  # Utility functions
│       └── __init__.py
└── data/                       # Data storage
    └── audio/                  # Temporary audio files
```

## 📊 Performance Considerations

-   Basic latency management for acceptable response times
-   Memory usage for running alongside Ollama
-   Single voice channel support
-   VAD aggressiveness tuning for optimal speech detection

## 🔍 Future Enhancements

-   Port to Rust / Go
