const axios = require('axios');
const fs = require('fs');

class ChatSession {
    constructor(userId, modelName = 'wizard-vicuna-uncensored:13b', baseUrl = 'http://localhost:11434') {
        this.userId = userId;
        this.modelName = modelName;
        this.baseUrl = baseUrl;
        this.isInitialized = false;
        this.messages = [];
        this.lastError = null;
    }

    async initialize(systemPrompt) {
        if (this.isInitialized) {
            return;
        }

        try {
            // Load the system prompt
            if (!systemPrompt) {
                systemPrompt = fs.readFileSync('prompt.txt', 'utf8');
            }

            // Initialize chat with system prompt
            const response = await axios.post(`${this.baseUrl}/api/chat`, {
                model: this.modelName,
                messages: [{
                    role: 'system',
                    content: systemPrompt
                }],
                stream: false
            });

            if (response.data && response.data.message) {
                this.messages.push({
                    role: 'system',
                    content: systemPrompt
                });
                this.isInitialized = true;
                console.log(`[Chat] Initialized session for user ${this.userId}`);
            }
        } catch (error) {
            this.lastError = error;
            console.error(`[Chat] Failed to initialize session for user ${this.userId}:`, error.message);
            throw error;
        }
    }

    async sendMessage(message) {
        try {
            // Add user message to history
            this.messages.push({
                role: 'user',
                content: message
            });

            // Send message to Ollama
            const response = await axios.post(`${this.baseUrl}/api/chat`, {
                model: this.modelName,
                messages: this.messages,
                stream: false,
                options: {
                    temperature: 0.8,
                    top_p: 0.9,
                    top_k: 40
                }
            });

            if (response.data && response.data.message) {
                // Add assistant's response to history
                this.messages.push({
                    role: 'assistant',
                    content: response.data.message.content
                });

                return response.data.message.content;
            }

            throw new Error('Invalid response from Ollama');
        } catch (error) {
            this.lastError = error;
            console.error(`[Chat] Error in session ${this.userId}:`, error.message);
            throw error;
        }
    }

    async reset() {
        this.messages = [];
        this.isInitialized = false;
        console.log(`[Chat] Reset session for user ${this.userId}`);
    }

    getMessageCount() {
        return this.messages.length;
    }

    getLastError() {
        return this.lastError;
    }
}

// Singleton to manage all chat sessions
class ChatSessionManager {
    constructor() {
        this.sessions = new Map();
    }

    async getSession(userId, modelName) {
        if (!this.sessions.has(userId)) {
            const session = new ChatSession(userId, modelName);
            this.sessions.set(userId, session);
            return session;
        }
        return this.sessions.get(userId);
    }

    async resetSession(userId) {
        if (this.sessions.has(userId)) {
            await this.sessions.get(userId).reset();
        }
    }

    removeSession(userId) {
        this.sessions.delete(userId);
    }
}

module.exports = {
    ChatSession,
    ChatSessionManager: new ChatSessionManager()
}; 