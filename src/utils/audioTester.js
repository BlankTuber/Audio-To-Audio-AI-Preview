const fs = require("fs");
const path = require("path");
const { SpeechClient } = require("@google-cloud/speech");
const { execSync } = require("child_process");
const logger = require("./logger");
const textToSpeech = require("../services/textToSpeech");

// Create a separate speech client for testing
const speechClient = new SpeechClient();

/**
 * Test audio transcription with different formats and configurations
 * @returns {Promise<string>} Test results message
 */
async function testAudioTranscription() {
    try {
        const tempDir = path.join(process.cwd(), "temp");
        const results = [];

        results.push("🔍 Starting audio transcription test...");

        // Step 1: Generate test audio using TTS
        results.push("\n📢 Testing TTS-generated audio:");

        // Generate test phrase with TTS
        const testPhrase =
            "This is a test of the speech recognition system. Can you hear me clearly?";
        let ttsFilePath = null;

        try {
            // Use the TTS service to generate audio
            ttsFilePath = await textToSpeech.synthesizeSpeech(testPhrase);
            results.push(`✅ Generated TTS audio: ${ttsFilePath}`);

            // Verify the file was created properly
            if (fs.existsSync(ttsFilePath)) {
                const stats = fs.statSync(ttsFilePath);
                results.push(`   File size: ${stats.size} bytes`);
            } else {
                results.push("❌ TTS file was not created properly");
            }
        } catch (err) {
            results.push(`❌ Failed to generate TTS audio: ${err.message}`);
            console.error("TTS error details:", err);
        }

        // Step 2: Try to transcribe the TTS-generated audio
        if (ttsFilePath && fs.existsSync(ttsFilePath)) {
            try {
                // TTS typically outputs MP3, so we need to handle it differently
                const transcription = await transcribeMp3File(ttsFilePath);

                if (transcription) {
                    results.push(
                        `✅ TTS audio transcription: "${transcription}"`,
                    );
                    results.push(`   Original phrase: "${testPhrase}"`);

                    // Calculate simple match percentage
                    const matchScore = calculateMatchScore(
                        testPhrase,
                        transcription,
                    );
                    results.push(`   Match score: ${matchScore}%`);
                } else {
                    results.push(
                        "❌ TTS audio transcription returned empty result",
                    );
                }
            } catch (err) {
                results.push(`❌ Error transcribing TTS audio: ${err.message}`);
            }
        }

        // Step 3: Check if ffmpeg is available for advanced tests
        results.push("\n🔧 Testing ffmpeg availability:");
        let ffmpegAvailable = false;

        try {
            execSync("ffmpeg -version", { stdio: "ignore" });
            ffmpegAvailable = true;
            results.push("✅ ffmpeg is available for audio processing");
        } catch (err) {
            results.push(
                "❌ ffmpeg is NOT available - some tests will be skipped",
            );
        }

        // Step 4: Try to find and transcribe Discord PCM files
        results.push("\n🎙️ Testing Discord voice audio:");
        const discordFiles = fs
            .readdirSync(tempDir)
            .filter((f) => f.startsWith("voice_") && f.endsWith(".pcm"));

        if (discordFiles.length > 0) {
            results.push(`Found ${discordFiles.length} Discord audio files`);

            // Get the latest Discord PCM file
            const latestFile = discordFiles
                .map((f) => ({
                    name: f,
                    time: fs.statSync(path.join(tempDir, f)).mtime.getTime(),
                }))
                .sort((a, b) => b.time - a.time)[0].name;

            const discordFilePath = path.join(tempDir, latestFile);
            results.push(`Testing latest Discord audio: ${latestFile}`);

            // Try to transcribe the PCM file directly
            try {
                const directResult = await transcribePcmFile(
                    discordFilePath,
                    "48000",
                    2,
                );
                if (directResult) {
                    results.push(
                        `✅ Direct PCM transcription: "${directResult}"`,
                    );
                } else {
                    results.push(
                        "❌ Direct PCM transcription returned empty result",
                    );
                }
            } catch (err) {
                results.push(
                    `❌ Direct PCM transcription error: ${err.message}`,
                );
            }

            // Try to convert and transcribe if ffmpeg is available
            if (ffmpegAvailable) {
                try {
                    // Convert Discord PCM to different formats and test each one

                    // 1. Convert to WAV with original parameters
                    const wavFilePath = path.join(
                        tempDir,
                        `${latestFile.replace(".pcm", "")}_test1.wav`,
                    );
                    execSync(
                        `ffmpeg -f s16le -ar 48000 -ac 2 -i "${discordFilePath}" "${wavFilePath}" -y`,
                    );
                    results.push(
                        `✅ Converted to WAV (original params): ${wavFilePath}`,
                    );

                    const wav1Result = await transcribeWavFile(wavFilePath);
                    if (wav1Result) {
                        results.push(
                            `✅ Original WAV transcription: "${wav1Result}"`,
                        );
                    } else {
                        results.push(
                            "❌ Original WAV transcription returned empty result",
                        );
                    }

                    // 2. Convert to WAV with modified parameters (16kHz mono)
                    const wav2FilePath = path.join(
                        tempDir,
                        `${latestFile.replace(".pcm", "")}_test2.wav`,
                    );
                    execSync(
                        `ffmpeg -f s16le -ar 48000 -ac 2 -i "${discordFilePath}" -ar 16000 -ac 1 "${wav2FilePath}" -y`,
                    );
                    results.push(
                        `✅ Converted to WAV (16kHz mono): ${wav2FilePath}`,
                    );

                    const wav2Result = await transcribeWavFile(
                        wav2FilePath,
                        "16000",
                        1,
                    );
                    if (wav2Result) {
                        results.push(
                            `✅ 16kHz mono WAV transcription: "${wav2Result}"`,
                        );
                    } else {
                        results.push(
                            "❌ 16kHz mono WAV transcription returned empty result",
                        );
                    }
                } catch (err) {
                    results.push(
                        `❌ Conversion or transcription error: ${err.message}`,
                    );
                }
            }
        } else {
            results.push("⚠️ No Discord audio files found to test");
        }

        // Summary of findings
        results.push("\n📋 Test Summary:");
        if (ttsFilePath && fs.existsSync(ttsFilePath)) {
            results.push("- TTS generation is working");
        } else {
            results.push("- TTS generation is NOT working");
        }

        if (ffmpegAvailable) {
            results.push("- ffmpeg is available for audio conversion");
        } else {
            results.push(
                "- ffmpeg is NOT available - install it for better results",
            );
        }

        if (discordFiles.length > 0) {
            results.push("- Discord audio is being captured");
        } else {
            results.push("- No Discord audio files found");
        }

        return results.join("\n");
    } catch (err) {
        logger.error("Error in audio test:", err);
        return `Audio test failed: ${err.message}`;
    }
}

/**
 * Transcribe a PCM file
 * @param {string} filePath - Path to the PCM file
 * @param {string} sampleRate - Sample rate in Hz
 * @param {number} channels - Number of audio channels
 * @returns {Promise<string>} - Transcription result
 */
async function transcribePcmFile(filePath, sampleRate = "48000", channels = 2) {
    try {
        // Read the audio file
        const content = fs.readFileSync(filePath).toString("base64");

        // Create the request
        const request = {
            audio: {
                content: content,
            },
            config: {
                encoding: "LINEAR16",
                sampleRateHertz: parseInt(sampleRate, 10),
                languageCode: "en-US",
                model: "default",
                audioChannelCount: channels,
            },
        };

        // Perform speech recognition
        const [response] = await speechClient.recognize(request);

        if (!response.results || response.results.length === 0) {
            return "";
        }

        return response.results
            .map((result) => result.alternatives[0].transcript)
            .join("\n");
    } catch (err) {
        logger.error("Error transcribing PCM file:", err);
        throw err;
    }
}

/**
 * Transcribe a WAV file
 * @param {string} filePath - Path to the WAV file
 * @param {string} sampleRate - Sample rate in Hz
 * @param {number} channels - Number of audio channels
 * @returns {Promise<string>} - Transcription result
 */
async function transcribeWavFile(filePath, sampleRate = "48000", channels = 2) {
    try {
        // Read the audio file
        const content = fs.readFileSync(filePath).toString("base64");

        // Create the request
        const request = {
            audio: {
                content: content,
            },
            config: {
                encoding: "LINEAR16",
                sampleRateHertz: parseInt(sampleRate, 10),
                languageCode: "en-US",
                model: "default",
                audioChannelCount: channels,
            },
        };

        // Perform speech recognition
        const [response] = await speechClient.recognize(request);

        if (!response.results || response.results.length === 0) {
            return "";
        }

        return response.results
            .map((result) => result.alternatives[0].transcript)
            .join("\n");
    } catch (err) {
        logger.error("Error transcribing WAV file:", err);
        throw err;
    }
}

/**
 * Transcribe an MP3 file
 * @param {string} filePath - Path to the MP3 file
 * @returns {Promise<string>} - Transcription result
 */
async function transcribeMp3File(filePath) {
    try {
        // Read the audio file
        const content = fs.readFileSync(filePath).toString("base64");

        // Create the request
        const request = {
            audio: {
                content: content,
            },
            config: {
                encoding: "MP3",
                languageCode: "en-US",
                model: "default",
            },
        };

        // Perform speech recognition
        const [response] = await speechClient.recognize(request);

        if (!response.results || response.results.length === 0) {
            return "";
        }

        return response.results
            .map((result) => result.alternatives[0].transcript)
            .join("\n");
    } catch (err) {
        logger.error("Error transcribing MP3 file:", err);

        // Try to convert the MP3 to WAV and try again
        try {
            if (fs.existsSync(filePath)) {
                const wavFilePath = filePath.replace(".mp3", "_converted.wav");
                execSync(
                    `ffmpeg -i "${filePath}" -ar 16000 -ac 1 "${wavFilePath}" -y`,
                );

                // Now try to transcribe the WAV
                return await transcribeWavFile(wavFilePath, "16000", 1);
            }
        } catch (convErr) {
            logger.error("Error converting MP3 to WAV:", convErr);
        }

        throw err;
    }
}

/**
 * Calculate a simple match score between original text and transcription
 * @param {string} original - Original text
 * @param {string} transcription - Transcribed text
 * @returns {number} - Matching percentage
 */
function calculateMatchScore(original, transcription) {
    // Normalize both strings
    const normalizedOriginal = original
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const normalizedTranscription = transcription
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    // Split into words
    const originalWords = normalizedOriginal.split(" ");
    const transcriptionWords = normalizedTranscription.split(" ");

    // Count matching words
    let matchCount = 0;
    for (const word of transcriptionWords) {
        if (originalWords.includes(word)) {
            matchCount++;
        }
    }

    // Calculate percentage based on original text length
    const percentage = Math.round((matchCount / originalWords.length) * 100);
    return Math.min(100, Math.max(0, percentage)); // Clamp between 0-100
}

module.exports = {
    testAudioTranscription,
};
