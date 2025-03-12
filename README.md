# 🎙️ Audio-To-Audio-AI-Preview 🤖

## 📋 Project Summary

This minimalist MVP implements a basic audio processing pipeline for Discord that connects speech-to-text, large language models, and text-to-speech technologies. The bot listens to voice channel input, transcribes it, processes the text through an LLM, and responds with generated speech - creating a simple audio-to-audio AI assistant experience. This version utilizes Google Cloud Speech-to-Text and Text-to-Speech APIs for improved cloud-based performance.

## 🛠️ Tech Stack

-   **Python 3.9+** - Core programming language
-   **Discord.py** - Discord bot framework with voice channel support
-   **Google Cloud Speech-to-Text API** - Cloud-based speech recognition for transcription
-   **Google Cloud Text-to-Speech API** - Cloud-based text-to-speech synthesis
-   **FFmpeg** - Audio processing dependency

## ⚙️ Setup & Installation

### Prerequisites

-   Python 3.9+ installed
-   FFmpeg installed
-   Discord Developer account with bot token
-   Google Cloud Platform project with billing enabled
-   Google Cloud SDK installed (optional, for local development)

### Installation Steps

1. **Clone the repository**

    ```py
    git clone https://github.com/BlankTuber/Audio-To-Audio-AI-Preview.git
    cd Audio-To-Audio-AI-Preview
    ```

2. **Create virtual environment**

    ```py
    python -m venv venv
    source venv/bin/activate
    ```

3. **Install dependencies**

    ```py
    pip install -r requirements.txt
    ```

4. **Configure Google Cloud Credentials**

    - **Set up Google Cloud Project:** You'll need a Google Cloud Platform project with billing enabled.
    - **Enable APIs:** Enable the "Cloud Speech-to-Text API" and "Cloud Text-to-Speech API" for your project in the [Google Cloud Console](https://console.cloud.google.com/).
    - **Create Service Account Credentials:** Create a service account with the necessary permissions and download the JSON key file.
    - **Set Environment Variable:** Create a `.env` file with:

        ```py
        DISCORD_TOKEN=
        CLIENT_ID=
        GUILD_ID=

        # Ollama Configuration
        OLLAMA_API_HOST=http://localhost:11434
        OLLAMA_DEFAULT_MODEL=mistral

        GOOGLE_APPLICATION_CREDENTIALS=path/to/your/service_account_key.json
        ```

## 🗺️ Implementation Roadmap

### Phase 1: 🏗️ Foundation (Days 1-2)

-   [x] Set up project structure and environment
-   [ ] Implement basic Discord bot with slash command handling
-   [ ] Add voice channel connection capabilities
-   [ ] Create configuration loading from .env

### Phase 2: 🎤 Speech-to-Text Integration (Days 3-5)

-   [ ] Integrate Google Cloud Speech-to-Text API for audio transcription
    -   Use `google-cloud-speech` library
    -   Implement basic audio recording and saving from Discord voice channel
    -   Send audio to Google Cloud Speech-to-Text API for transcription
-   [ ] Create audio capture pipeline and transcription process

### Phase 3: 🧠 LLM Processing (Days 6-8)

-   [ ] Set up Ollama client connection
    -   Use `ollama` package for API communication
    -   Create simple conversation context management
-   [ ] Design basic assistant prompt template
-   [ ] Implement minimal error handling

### Phase 4: 🔊 Text-to-Speech Generation (Days 9-11)

-   [ ] Implement Google Cloud Text-to-Speech API for speech synthesis
    -   Use `google-cloud-texttospeech` library
    -   Set up voice configuration using Google Cloud Text-to-Speech voices
    -   Create audio output mechanism to Discord voice channel
-   [ ] Build simple audio playback system to Discord

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
├── .env
├── .gitignore
├── README.md
├── main.py
├── requirements.txt
├── src/
│   ├── bot/
│   │   ├── __init__.py
│   │   ├── client.py
│   │   └── commands.py
│   ├── stt/
│   │   ├── __init__.py
│   │   └── google_stt_client.py
│   ├── llm/
│   │   ├── __init__.py
│   │   └── ollama_client.py
│   ├── tts/
│   │   ├── __init__.py
│   │   └── google_tts_engine.py
│   └── utils/
│       └── __init__.py
└── data/
    └── audio/
```

## 🔍 Future Enhancements

-   Port to Rust / Go
