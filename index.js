const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const input = require('input');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getApiCredentials } = require('./config');
const conversationManager = require('./conversations');
const { ChatSessionManager } = require('./chat_session');

// Get Telegram API credentials from config
const { apiId, apiHash } = getApiCredentials();

// Ollama configuration
const OLLAMA_API_URL = 'http://localhost:11434/api/generate';
const MODEL_NAME = 'wizard-vicuna-uncensored:13b';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const PROMPT_FILE = 'prompt.txt';

// Store session in a file
const SESSION_FILE = '.telegram-session';
const TARGET_FILE = '.target-user';

// Command prefix
const COMMAND_PREFIX = '/';

// Function to load system prompt
function loadSystemPrompt() {
    try {
        if (fs.existsSync(PROMPT_FILE)) {
            return fs.readFileSync(PROMPT_FILE, 'utf8');
        } else {
            const defaultPrompt = `You are having a casual conversation with a friend. Keep the following in mind:

- Be natural and conversational
- Keep responses concise and casual
- If you don't know something, just say so
- Stay on topic and be genuine`;
            
            fs.writeFileSync(PROMPT_FILE, defaultPrompt);
            return defaultPrompt;
        }
    } catch (error) {
        console.error('[Prompt] Error loading system prompt:', error);
        return defaultPrompt;
    }
}

// Function to save system prompt
function saveSystemPrompt(newPrompt) {
    try {
        fs.writeFileSync(PROMPT_FILE, newPrompt);
        return true;
    } catch (error) {
        console.error('[Prompt] Error saving system prompt:', error);
        return false;
    }
}

// Function to get response from Ollama with retries
async function getAIResponse(message, userInfo, userId) {
    let retries = 0;
    
    while (retries < MAX_RETRIES) {
        try {
            // Get or create chat session
            const session = await ChatSessionManager.getSession(userId, MODEL_NAME);
            
            // Initialize session if needed
            if (!session.isInitialized) {
                await session.initialize();
            }
            
            // Send message and get response
            const response = await session.sendMessage(message);
            console.log('[Ollama] Successfully got response');
            return response;

        } catch (error) {
            console.error(`[Ollama] Error attempt ${retries + 1}:`, error.message);
            retries++;
            
            // If there's a session error, try resetting it
            if (retries < MAX_RETRIES) {
                try {
                    await ChatSessionManager.resetSession(userId);
                } catch (resetError) {
                    console.error('[Ollama] Failed to reset session:', resetError.message);
                }
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            }
        }
    }

    throw new Error(`Failed to get AI response after ${MAX_RETRIES} attempts`);
}

async function loadSession() {
    if (fs.existsSync(SESSION_FILE)) {
        return new StringSession(fs.readFileSync(SESSION_FILE, 'utf8'));
    }
    return new StringSession('');
}

async function saveSession(session) {
    fs.writeFileSync(SESSION_FILE, session.save());
}

// Save target user info
function saveTargetUser(targetInfo) {
    if (targetInfo) {
        // Convert BigInt to string for storage
        const storageInfo = {
            ...targetInfo,
            id: targetInfo.id ? targetInfo.id.toString() : null
        };
        fs.writeFileSync(TARGET_FILE, JSON.stringify(storageInfo));
    }
}

// Load target user info
function loadTargetUser() {
    try {
        if (fs.existsSync(TARGET_FILE)) {
            const data = JSON.parse(fs.readFileSync(TARGET_FILE));
            // Convert string back to BigInt if ID exists
            return {
                ...data,
                id: data.id ? BigInt(data.id) : null
            };
        }
    } catch (error) {
        console.error('Error loading target user:', error);
    }
    return null;
}

// Function to format phone number consistently
function formatPhoneNumber(phone) {
    if (!phone) return null;
    // Remove all non-digit characters except +
    let formatted = phone.toString().replace(/[^\d+]/g, '');
    // Ensure it starts with +
    if (!formatted.startsWith('+')) {
        formatted = '+' + formatted;
    }
    return formatted;
}

// Function to resolve user by username or phone
async function resolveUser(client, type, value) {
    try {
        if (!type || !value || type === 'none') return null;

        if (type === 'phone') {
            const formattedPhone = formatPhoneNumber(value);
            console.log(`Attempting to resolve phone number: ${formattedPhone}`);
            
            try {
                // First try to search in dialogs
                const dialogs = await client.getDialogs({});
                for (const dialog of dialogs) {
                    try {
                        const entity = dialog.entity;
                        if (entity && entity.phone) {
                            const entityPhone = formatPhoneNumber(entity.phone);
                            if (entityPhone === formattedPhone) {
                                console.log(`Found user with phone ${formattedPhone} in dialogs`);
                                return {
                                    id: BigInt(entity.id.value || entity.id),
                                    type: 'phone',
                                    value: formattedPhone,
                                    username: entity.username || null,
                                    firstName: entity.firstName || null,
                                    lastName: entity.lastName || null,
                                    phone: formattedPhone
                                };
                            }
                        }
                    } catch (e) {
                        continue; // Skip any problematic dialogs
                    }
                }

                // If not found in dialogs, try to import contact
                const imported = await client.invoke({
                    _: 'contacts.importContacts',
                    contacts: [{
                        _: 'inputPhoneContact',
                        client_id: BigInt(0),
                        phone: formattedPhone.replace('+', ''),
                        first_name: 'User',
                        last_name: ''
                    }]
                });

                if (imported.users && imported.users.length > 0) {
                    const user = imported.users[0];
                    console.log(`Found user by importing contact ${formattedPhone}`);
                    return {
                        id: BigInt(user.id.value || user.id),
                        type: 'phone',
                        value: formattedPhone,
                        username: user.username || null,
                        firstName: user.firstName || null,
                        lastName: user.lastName || null,
                        phone: formattedPhone
                    };
                }

                throw new Error('Phone number not found');
            } catch (error) {
                console.error(`Could not resolve phone number: ${formattedPhone}`);
                console.error('Error details:', error.message);
                console.log('\nPlease make sure:');
                console.log('1. The phone number is correct and includes country code');
                console.log('2. The user has a Telegram account');
                console.log('3. You have messaged this user before');
                console.log('4. Try adding this contact to your phone\'s contacts first');
                return null;
            }
        } else if (type === 'username') {
            const username = value.replace(/^@/, '');
            try {
                const user = await client.getEntity(username);
                if (user) {
                    return {
                        id: BigInt(user.id.value || user.id),
                        type: 'username',
                        value: username,
                        username: user.username || username,
                        firstName: user.firstName || null,
                        lastName: user.lastName || null
                    };
                }
            } catch (error) {
                console.error(`Could not resolve username "${username}": ${error.message}`);
                console.log('Please make sure:');
                console.log('1. The username exists');
                console.log('2. You have had a previous interaction with the user');
                console.log('3. The user has not restricted their privacy settings');
                return null;
            }
        }
        return null;
    } catch (error) {
        console.error('Error resolving user:', error);
        return null;
    }
}

// Function to get user info string
async function getUserInfoString(client, userId) {
    try {
        const user = await client.getEntity(userId);
        const parts = [];
        
        if (user.phone) parts.push(`+${user.phone}`);
        if (user.username) parts.push(`@${user.username}`);
        if (user.firstName) parts.push(user.firstName);
        if (user.lastName) parts.push(user.lastName);
        
        return parts.length > 0 ? 
            `${parts.join(' ')} (ID: ${userId})` : 
            `User ${userId}`;
    } catch (error) {
        return `User ${userId}`;
    }
}

async function askForTargetUser(client) {
    while (true) {  // Keep asking until we get a valid choice
        console.log('\nHow would you like to target messages?');
        console.log('1. By username');
        console.log('2. By phone number');
        console.log('3. Respond to everyone');
        console.log('4. Use previous target (if any)');
        
        const choice = (await input.text('Enter your choice (1-4): ')).trim();
        
        switch (choice) {
            case '1': {
                const username = await input.text('Enter username (with or without @): ');
                const targetUser = await resolveUser(client, 'username', username);
                if (!targetUser) {
                    console.log('\nFailed to set target user. Would you like to:');
                    console.log('1. Try again with a different username');
                    console.log('2. Respond to all messages');
                    const retry = (await input.text('Enter your choice (1-2): ')).trim();
                    if (retry === '1') {
                        continue;  // Go back to main menu
                    }
                    return null;
                }
                return targetUser;
            }
            
            case '2': {
                console.log('\nEnter phone number:');
                console.log('- Include the country code');
                console.log('- You can include or omit the + prefix');
                console.log('- Spaces and dashes are allowed');
                console.log('Example: +1 234 567-8900 or 12345678900\n');
                
                const phone = await input.text('Phone number: ');
                const targetUser = await resolveUser(client, 'phone', phone);
                if (!targetUser) {
                    console.log('\nFailed to set target user. Would you like to:');
                    console.log('1. Try again with a different phone number');
                    console.log('2. Respond to all messages');
                    const retry = (await input.text('Enter your choice (1-2): ')).trim();
                    if (retry === '1') {
                        continue;  // Go back to main menu
                    }
                    return null;
                }
                return targetUser;
            }
            
            case '3': {
                console.log('\nWill respond to all messages.');
                return null;
            }
            
            case '4': {
                const savedTarget = loadTargetUser();
                if (savedTarget) {
                    // Verify the saved target still exists
                    const verifiedUser = await resolveUser(client, savedTarget.type, savedTarget.value);
                    if (verifiedUser) {
                        console.log(`Using saved target: ${savedTarget.type} (${savedTarget.value})`);
                        return verifiedUser;
                    } else {
                        console.log('Saved target user could not be found. Please select a new target.');
                        continue;  // Go back to main menu
                    }
                } else {
                    console.log('No previous target found. Will respond to all messages.');
                    return null;
                }
            }
            
            default: {
                console.log('\nInvalid choice. Please enter a number between 1 and 4.');
                continue;  // Go back to main menu
            }
        }
    }
}

// Handle commands
async function handleCommand(message, fromId, userInfo) {
    const command = message.text.toLowerCase().split(' ')[0];
    const args = message.text.slice(command.length).trim();

    switch (command) {
        case '/clear':
        case '/reset':
            conversationManager.clearHistory(fromId);
            await ChatSessionManager.resetSession(fromId);
            return "Memory cleared! I've forgotten our previous conversation. What would you like to talk about?";
            
        case '/status':
            const summary = conversationManager.getConversationSummary(fromId);
            const lastInteraction = summary.lastInteraction ? 
                new Date(summary.lastInteraction).toLocaleString() : 
                'Never';
            return `Conversation Status:
• Total Exchanges: ${summary.totalExchanges}
• Last Interaction: ${lastInteraction}
• Memory Size: ${(summary.fileSize / 1024).toFixed(2)} KB
• Context Length: ${summary.contextLength} characters`;
            
        case '/prompt':
            if (!args) {
                // Show current prompt
                return `Current system prompt:\n\n${loadSystemPrompt()}`;
            }
            // Update prompt
            if (saveSystemPrompt(args)) {
                return "System prompt updated successfully! The new prompt will be used for future messages.";
            }
            return "Failed to update system prompt. Please try again.";
            
        case '/help':
            return `Available commands:
/clear or /reset - Clear conversation memory
/status - Show conversation statistics
/prompt - Show current system prompt
/prompt <new prompt> - Update system prompt
/help - Show this help message`;
            
        default:
            return null; // Not a command
    }
}

async function main() {
    console.log('Starting Telegram AI Client...');

    // Check for API credentials
    if (!apiId || !apiHash) {
        console.error(
            '\nTelegram API credentials not found!\n\n' +
            'You can set them using the config tool:\n' +
            '  node config-cli.js set <API_ID> <API_HASH>\n\n' +
            'To get your API credentials:\n' +
            '1. Go to https://my.telegram.org/apps\n' +
            '2. Log in with your phone number\n' +
            '3. Click on "API Development tools"\n' +
            '4. Create a new application\n' +
            '5. Copy the "App api_id" and "App api_hash"\n'
        );
        return;
    }

    try {
        // Initialize client
        const stringSession = await loadSession();
        const client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
            connectionRetries: 5,
            useWSS: false,
            timeout: 30000
        });

        // Start client
        await client.start({
            phoneNumber: async () => await input.text('Please enter your phone number: '),
            password: async () => await input.text('Please enter your 2FA password (if any): '),
            phoneCode: async () => await input.text('Please enter the code you received: '),
            onError: (err) => console.log(err),
        });

        // Connect fully before proceeding
        await client.connect();
        
        // Save session
        await saveSession(client.session);

        console.log('Client initialized successfully!');

        // Ask for target user interactively
        const targetUser = await askForTargetUser(client);
        
        // Save target user for future use
        if (targetUser) {
            saveTargetUser(targetUser);
            console.log(`Will only respond to messages from ${targetUser.type}: ${targetUser.value} (ID: ${targetUser.id})`);
        } else {
            console.log('Will respond to all messages.');
        }

        // Listen for new messages
        client.addEventHandler(async (event) => {
            const message = event.message;

            try {
                // Don't process messages from yourself
                const me = await client.getMe();
                const myId = BigInt(me.id);
                
                // Get the sender's ID safely
                const fromId = message.senderId ? BigInt(message.senderId.value || message.senderId) : null;
                
                if (!fromId) {
                    console.log('Could not determine message sender, ignoring message');
                    return;
                }

                if (fromId === myId) {
                    return;
                }

                // Get user info for logging
                const userInfo = await getUserInfoString(client, fromId);

                // Check if message is from target user (if specified)
                if (targetUser) {
                    if (targetUser.type === 'phone') {
                        try {
                            const sender = await client.getEntity(fromId);
                            const senderPhone = formatPhoneNumber(sender.phone);
                            
                            if (!senderPhone || senderPhone !== targetUser.phone) {
                                console.log(`Ignoring message from non-target phone ${userInfo} (${senderPhone || 'no phone'})`);
                                return;
                            }
                            console.log(`Matched target phone ${targetUser.phone}`);
                        } catch (error) {
                            console.log(`Could not verify sender's phone number, ignoring message from ${userInfo}`);
                            return;
                        }
                    } else if (fromId !== targetUser.id) {
                        console.log(`Ignoring message from non-target user ${userInfo}`);
                        return;
                    }
                }

                console.log(`[Message] Received from ${userInfo}: ${message.text}`);

                // Check if message is empty or too short
                if (!message.text || message.text.trim().length < 1) {
                    console.log(`[Warning] Empty or invalid message from ${userInfo}`);
                    return;
                }

                // Check if this is a command
                if (message.text.startsWith(COMMAND_PREFIX)) {
                    const commandResponse = await handleCommand(message, fromId, userInfo);
                    if (commandResponse) {
                        await message.reply({
                            message: commandResponse
                        });
                        return;
                    }
                }

                // Get conversation summary for logging
                const conversationSummary = conversationManager.getConversationSummary(fromId);
                console.log(`[Conversation] Total exchanges: ${conversationSummary.totalExchanges}, Last interaction: ${new Date(conversationSummary.lastInteraction || Date.now()).toISOString()}`);

                // Get AI response with conversation context
                let responseText = await getAIResponse(message.text, userInfo, fromId);
                
                // Validate response
                if (!responseText || responseText.trim().length === 0) {
                    console.log(`[Warning] Empty AI response for ${userInfo}`);
                    responseText = "I apologize, but I couldn't generate a proper response. Could you please try again?";
                }
                
                console.log(`[AI Response] To ${userInfo}: ${responseText}`);

                // Add the exchange to conversation history BEFORE sending the reply
                conversationManager.addExchange(fromId.toString(), message.text, responseText);

                // Send response with retry logic
                let replyAttempts = 0;
                while (replyAttempts < MAX_RETRIES) {
                    try {
                        await message.reply({
                            message: responseText
                        });
                        console.log('[Reply] Successfully sent response');
                        break;
                    } catch (replyError) {
                        replyAttempts++;
                        console.error(`[Reply] Attempt ${replyAttempts} failed:`, replyError.message);
                        
                        if (replyAttempts < MAX_RETRIES) {
                            console.log(`[Reply] Waiting ${RETRY_DELAY}ms before retry...`);
                            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                        } else {
                            console.error('[Reply] Failed to send response after all retries');
                            throw replyError;
                        }
                    }
                }
            } catch (error) {
                console.error('[Error] Processing message:', error);
                try {
                    await message.reply({
                        message: "I encountered an error processing your message. Please try again in a moment."
                    });
                } catch (replyError) {
                    console.error('[Error] Failed to send error message:', replyError);
                }
            }
        }, new NewMessage({}));

        console.log('\nClient is now listening for messages...');
        console.log('Press Ctrl+C to stop\n');

        // Keep the process alive
        await new Promise(() => {});

    } catch (error) {
        console.error('Error:', error);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    process.exit(0);
});

main(); 