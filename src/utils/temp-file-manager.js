/**
 * Utility for managing temporary files
 */
const fs = require("fs");
const path = require("path");
const { createLogger } = require("./logger");
const config = require("./config");

const logger = createLogger("TempFileManager");
const TEMP_DIR = config.app.tempDir;

// Track all created temporary files for cleanup
const tempFiles = new Set();

/**
 * Ensure the temp directory exists
 */
function ensureTempDir() {
    if (!fs.existsSync(TEMP_DIR)) {
        logger.info(`Creating temp directory: ${TEMP_DIR}`);
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
}

/**
 * Create a temporary file path
 * @param {string} prefix - File prefix
 * @param {string} extension - File extension
 * @returns {string} - Path to the temporary file
 */
function createTempFilePath(prefix, extension) {
    ensureTempDir();
    const fileName = `${prefix}_${Date.now()}.${extension}`;
    return path.join(TEMP_DIR, fileName);
}

/**
 * Create a write stream for a temporary file
 * @param {string} prefix - File prefix
 * @param {string} extension - File extension
 * @returns {Object} - Object containing the file path and write stream
 */
function createTempFileStream(prefix, extension) {
    const filePath = createTempFilePath(prefix, extension);
    const writeStream = fs.createWriteStream(filePath);

    // Track the file for cleanup
    tempFiles.add(filePath);

    return {
        filePath,
        writeStream,
    };
}

/**
 * Register an existing file path for cleanup
 * @param {string} filePath - Path to the file
 */
function registerTempFile(filePath) {
    tempFiles.add(filePath);
}

/**
 * Delete a temporary file
 * @param {string} filePath - Path to the file
 * @returns {boolean} - Whether the deletion was successful
 */
function deleteTempFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            tempFiles.delete(filePath);
            return true;
        }
    } catch (error) {
        logger.error(`Failed to delete temp file: ${filePath}`, error);
    }
    return false;
}

/**
 * Clean up all temporary files
 * @returns {number} - Number of files successfully cleaned up
 */
function cleanupAllTempFiles() {
    let successCount = 0;

    for (const filePath of tempFiles) {
        if (deleteTempFile(filePath)) {
            successCount++;
        }
    }

    logger.info(`Cleaned up ${successCount}/${tempFiles.size} temporary files`);
    return successCount;
}

// Initialize temp directory on module load
ensureTempDir();

module.exports = {
    createTempFilePath,
    createTempFileStream,
    registerTempFile,
    deleteTempFile,
    cleanupAllTempFiles,
};
