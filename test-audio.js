// Standalone CLI script to test audio transcription
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Make sure environment variables are loaded
require("dotenv").config();

// Run this as a standalone script
if (require.main === module) {
    console.log("Starting audio transcription test...");

    // Run the test
    runTest()
        .then((results) => {
            console.log("\n=== TEST RESULTS ===\n");
            console.log(results);
            console.log("\n=== TEST COMPLETE ===\n");
        })
        .catch((err) => {
            console.error("Test failed with error:", err);
            process.exit(1);
        });
}

/**
 * Run the audio transcription test
 */
async function runTest() {
    try {
        // Import services (lazy load to ensure environment is set up)
        const { SpeechClient } = require("@google-cloud/speech");
        const { TextToSpeechClient } = require("@google-cloud/text-to-speech");

        // Initialize clients
        const speechClient = new SpeechClient();
        const ttsClient = new TextToSpeechClient();

        const results = [];
        const tempDir = path.join(__dirname, "temp");

        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        results.push("🔍 Starting audio transcription test...");

        // Step 1: Generate test audio using TTS
        results.push("\n📢 Testing with TTS-generated audio:");

        // Generate test phrase with TTS
        const testPhrase =
            "This is a test of the speech recognition system. Can you hear me clearly?";
        let ttsFilePath = null;

        try {
            // Create TTS request
            const ttsRequest = {
                input: { text: testPhrase },
                voice: {
                    languageCode: "en-US",
                    ssmlGender: "FEMALE",
                    name: "en-US-Standard-C",
                },
                audioConfig: {
                    audioEncoding: "LINEAR16", // Change to PCM (LINEAR16)
                    sampleRateHertz: 16000,
                },
            };

            // Generate TTS
            const [ttsResponse] = await ttsClient.synthesizeSpeech(ttsRequest);

            // Save to file
            ttsFilePath = path.join(
                tempDir,
                `voice_test_tts_${Date.now()}.pcm`,
            );
            fs.writeFileSync(ttsFilePath, ttsResponse.audioContent, "binary");

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
        }

        // Step 2: Try to transcribe the TTS-generated audio
        if (ttsFilePath && fs.existsSync(ttsFilePath)) {
            try {
                // Read the audio file
                const content = fs.readFileSync(ttsFilePath).toString("base64");

                // Create STT request
                const request = {
                    audio: { content },
                    config: {
                        encoding: "LINEAR16",
                        sampleRateHertz: 16000,
                        languageCode: "en-US",
                        model: "default",
                        audioChannelCount: 1,
                    },
                };

                // Transcribe
                const [response] = await speechClient.recognize(request);
                let transcription = "";

                if (response.results && response.results.length > 0) {
                    transcription = response.results
                        .map((result) => result.alternatives[0].transcript)
                        .join("\n");
                }

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
                // Read the audio file
                const content = fs
                    .readFileSync(discordFilePath)
                    .toString("base64");

                // Create the request
                const request = {
                    audio: { content },
                    config: {
                        encoding: "LINEAR16",
                        sampleRateHertz: 16000,
                        languageCode: "en-US",
                        model: "default",
                        audioChannelCount: 1,
                    },
                };

                // Transcribe
                const [response] = await speechClient.recognize(request);
                let directResult = "";

                if (response.results && response.results.length > 0) {
                    directResult = response.results
                        .map((result) => result.alternatives[0].transcript)
                        .join("\n");
                }

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
        console.error("Error in audio test:", err);
        return `Audio test failed: ${err.message}`;
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

// Export for use in other modules
module.exports = { runTest };
