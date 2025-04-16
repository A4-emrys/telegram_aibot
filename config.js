const fs = require('fs');
const path = require('path');

const CONFIG_FILE = '.telegram-config.json';

// Function to load configuration
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            return config;
        }
    } catch (error) {
        console.error('Error loading config:', error);
    }
    return {};
}

// Function to save configuration
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving config:', error);
        return false;
    }
}

// Function to set API credentials
function setApiCredentials(apiId, apiHash) {
    const config = loadConfig();
    config.apiId = apiId;
    config.apiHash = apiHash;
    return saveConfig(config);
}

// Function to remove API credentials
function removeApiCredentials() {
    const config = loadConfig();
    delete config.apiId;
    delete config.apiHash;
    return saveConfig(config);
}

// Function to get API credentials
function getApiCredentials() {
    const config = loadConfig();
    return {
        apiId: config.apiId || process.env.TELEGRAM_API_ID,
        apiHash: config.apiHash || process.env.TELEGRAM_API_HASH
    };
}

module.exports = {
    setApiCredentials,
    removeApiCredentials,
    getApiCredentials
}; 