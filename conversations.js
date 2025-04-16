const fs = require('fs');
const path = require('path');

// Configuration
const CONVERSATIONS_DIR = '.conversations';
const MAX_CONTEXT_LENGTH = 8000;
const MAX_RECENT_MESSAGES = 10;
const DATE_FORMAT_OPTIONS = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
};

class ConversationManager {
    constructor() {
        this.initializeStorage();
        this.userContext = new Map();
    }

    initializeStorage() {
        if (!fs.existsSync(CONVERSATIONS_DIR)) {
            fs.mkdirSync(CONVERSATIONS_DIR);
            console.log('[Storage] Created conversations directory');
        }
    }

    getConversationPath(userId) {
        return path.join(CONVERSATIONS_DIR, `${userId}.txt`);
    }

    getContextPath(userId) {
        return path.join(CONVERSATIONS_DIR, `${userId}_context.json`);
    }

    formatTimestamp(date = new Date()) {
        return date.toLocaleString('en-US', DATE_FORMAT_OPTIONS);
    }

    // Enhanced context management
    updateUserContext(userId, message, aiResponse) {
        const contextPath = this.getContextPath(userId);
        let context = this.getUserContext(userId);

        // Update basic info
        context.lastInteraction = new Date().toISOString();
        context.messageCount = (context.messageCount || 0) + 1;

        // Extract and update name if found
        const nameMatches = [
            ...message.matchAll(/my name is (\w+)/gi),
            ...message.matchAll(/I['']m (\w+)/gi),
            ...message.matchAll(/call me (\w+)/gi),
            ...message.matchAll(/name['']s (\w+)/gi),
            ...message.matchAll(/^(\w+), that['']s my name$/gi)
        ];

        if (nameMatches.length > 0) {
            const name = nameMatches[nameMatches.length - 1][1];
            context.name = name;
            console.log(`[Context] Updated name for user ${userId} to: ${name}`);
        }

        // Extract and track topics
        context.topics = context.topics || [];
        const newTopic = this.extractMainTopic(message);
        if (newTopic) {
            context.topics.push(newTopic);
            context.lastTopic = newTopic;
        }

        // Track personal information
        const ageMatch = message.match(/(?:I am|I'm)\s+(\d+)\s+years?\s+old/i);
        if (ageMatch) {
            context.age = parseInt(ageMatch[1]);
        }

        const locationMatch = message.match(/(?:I (?:live|am from|reside) in|from) ([^,.!?]+)/i);
        if (locationMatch) {
            context.location = locationMatch[1].trim();
        }

        // Save context
        try {
            fs.writeFileSync(contextPath, JSON.stringify(context, null, 2));
        } catch (error) {
            console.error(`[Context] Error saving context for user ${userId}:`, error);
        }

        return context;
    }

    extractMainTopic(message) {
        // Simple topic extraction based on key nouns and verbs
        const topics = message.match(/\b(?:about|discussing|talking about|regarding) ([^,.!?]+)/i);
        return topics ? topics[1].trim() : null;
    }

    getUserContext(userId) {
        const contextPath = this.getContextPath(userId);
        try {
            if (fs.existsSync(contextPath)) {
                return JSON.parse(fs.readFileSync(contextPath, 'utf8'));
            }
        } catch (error) {
            console.error(`[Context] Error reading context for user ${userId}:`, error);
        }
        return {};
    }

    appendMessage(userId, role, message) {
        const filePath = this.getConversationPath(userId);
        const timestamp = this.formatTimestamp();
        const formattedMessage = `[${timestamp}] ${role}: ${message}\n`;

        try {
            fs.appendFileSync(filePath, formattedMessage);
            console.log(`[Storage] Appended message for user ${userId}`);
        } catch (error) {
            console.error(`[Storage] Error appending message for user ${userId}:`, error);
        }
    }

    addExchange(userId, userMessage, aiResponse) {
        this.appendMessage(userId, 'User', userMessage);
        
        // Validate and clean AI response before saving
        const cleanedResponse = this.validateResponse(aiResponse, this.getUserContext(userId));
        this.appendMessage(userId, 'AI', cleanedResponse);
        
        // Update context based on the exchange
        this.updateUserContext(userId, userMessage, cleanedResponse);
    }

    validateResponse(response, context) {
        // Remove any leaked system instructions or formatting
        let cleanedResponse = response
            .replace(/You are an AI assistant.*?(?=\n|$)/gi, '')
            .replace(/You (always )?address users as.*?(?=\n|$)/gi, '')
            .replace(/\b(AI|assistant|model|language model)\b/gi, '')
            .replace(/\[.*?\]/g, '')
            .replace(/^(Human|User|Assistant|AI|Friend):/gm, '')
            .replace(/Previous response:\s*/g, '')
            .trim();

        // Ensure proper name usage if available
        if (context.name && !cleanedResponse.includes(context.name)) {
            // Only add name if response doesn't already have a personal reference
            if (!cleanedResponse.match(/\b(you|your)\b/i)) {
                cleanedResponse = `${context.name}, ${cleanedResponse}`;
            }
        }

        // Remove duplicate responses
        const sentences = cleanedResponse.split(/[.!?]+\s+/);
        const uniqueSentences = [...new Set(sentences)];
        cleanedResponse = uniqueSentences.join('. ').trim();

        // Ensure the response ends with proper punctuation
        if (!cleanedResponse.match(/[.!?]$/)) {
            cleanedResponse += '.';
        }

        return cleanedResponse;
    }

    buildContext(userId, currentMessage = null) {
        const context = {
            systemPrompt: null, // Will be filled by the caller
            userContext: this.getUserContext(userId),
            recentMessages: this.getRecentMessages(userId),
            currentMessage
        };

        // Format context string
        let contextString = '';

        // Add user context if available
        if (context.userContext.name) {
            contextString += `The user's name is ${context.userContext.name}. `;
        }
        if (context.userContext.age) {
            contextString += `They are ${context.userContext.age} years old. `;
        }
        if (context.userContext.location) {
            contextString += `They live in ${context.userContext.location}. `;
        }

        // Add recent messages
        if (context.recentMessages.length > 0) {
            contextString += '\n\nRecent conversation:\n';
            contextString += context.recentMessages.join('\n');
        }

        // Add current message if provided
        if (currentMessage) {
            contextString += `\n\nCurrent message: ${currentMessage}`;
        }

        return contextString;
    }

    getRecentMessages(userId, limit = MAX_RECENT_MESSAGES) {
        const filePath = this.getConversationPath(userId);
        if (!fs.existsSync(filePath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const messages = content.split('\n').filter(line => line.trim());
            return messages.slice(-limit);
        } catch (error) {
            console.error(`[Storage] Error reading messages for user ${userId}:`, error);
            return [];
        }
    }

    clearHistory(userId) {
        const filePath = this.getConversationPath(userId);
        const contextPath = this.getContextPath(userId);
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[Storage] Deleted conversation for user ${userId}`);
            }
            if (fs.existsSync(contextPath)) {
                fs.unlinkSync(contextPath);
                console.log(`[Storage] Deleted context for user ${userId}`);
            }
            return true;
        } catch (error) {
            console.error(`[Storage] Error clearing data for user ${userId}:`, error);
            return false;
        }
    }

    getConversationSummary(userId) {
        const filePath = this.getConversationPath(userId);
        try {
            if (!fs.existsSync(filePath)) {
                return {
                    messageCount: 0,
                    totalExchanges: 0,
                    lastInteraction: null,
                    fileSize: 0,
                    contextLength: 0
                };
            }

            const stats = fs.statSync(filePath);
            const content = fs.readFileSync(filePath, 'utf8');
            const messages = content.split('\n').filter(line => line.trim());
            const lastMessage = messages[messages.length - 1];
            const lastInteractionMatch = lastMessage ? lastMessage.match(/\[(.*?)\]/) : null;

            // Count actual exchanges (pairs of user and AI messages)
            const totalExchanges = Math.floor(messages.length / 2);

            // Get the current context length
            const context = this.buildContext(userId);
            const contextLength = context ? context.length : 0;

            return {
                messageCount: messages.length,
                totalExchanges: totalExchanges,
                lastInteraction: lastInteractionMatch ? new Date(lastInteractionMatch[1]) : null,
                fileSize: stats.size,
                contextLength: contextLength
            };
        } catch (error) {
            console.error(`[Storage] Error getting summary for user ${userId}:`, error);
            return {
                messageCount: 0,
                totalExchanges: 0,
                lastInteraction: null,
                fileSize: 0,
                contextLength: 0
            };
        }
    }

    listAllConversations() {
        try {
            const files = fs.readdirSync(CONVERSATIONS_DIR);
            return files
                .filter(file => !file.endsWith('_context.json'))
                .map(file => {
                    const userId = path.basename(file, '.txt');
                    return {
                        userId,
                        ...this.getConversationSummary(userId)
                    };
                });
        } catch (error) {
            console.error('[Storage] Error listing conversations:', error);
            return [];
        }
    }
}

module.exports = new ConversationManager(); 