const fs = require('fs');
const path = require('path');

// Configuration
const CONVERSATIONS_DIR = '.conversations';
const MAX_CONTEXT_LENGTH = 8000;
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
        this.userContext = new Map(); // Store user-specific context
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

    // Update user context (like their name, preferences, etc.)
    updateUserContext(userId, message, aiResponse) {
        const contextPath = this.getContextPath(userId);
        let context = {};

        // Try to load existing context
        try {
            if (fs.existsSync(contextPath)) {
                context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
            }
        } catch (error) {
            console.error(`[Context] Error loading context for user ${userId}:`, error);
        }

        // Update name if found in conversation
        const nameMatches = [
            // Match "my name is [name]" pattern
            ...message.matchAll(/my name is (\w+)/gi),
            // Match "I'm [name]" pattern
            ...message.matchAll(/I['']m (\w+)/gi),
            // Match "call me [name]" pattern
            ...message.matchAll(/call me (\w+)/gi),
            // Match "name's [name]" pattern
            ...message.matchAll(/name['']s (\w+)/gi),
            // Match direct name statements
            ...message.matchAll(/^(\w+), that['']s my name$/gi)
        ];

        if (nameMatches.length > 0) {
            const name = nameMatches[nameMatches.length - 1][1];
            context.name = name;
            console.log(`[Context] Updated name for user ${userId} to: ${name}`);
        }

        // Save context
        try {
            fs.writeFileSync(contextPath, JSON.stringify(context, null, 2));
        } catch (error) {
            console.error(`[Context] Error saving context for user ${userId}:`, error);
        }

        return context;
    }

    // Get user context
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
        this.appendMessage(userId, 'AI', aiResponse);
        
        // Update context based on the exchange
        this.updateUserContext(userId, userMessage, aiResponse);
    }

    buildContext(userId, currentMessage = null) {
        const filePath = this.getConversationPath(userId);
        const userContext = this.getUserContext(userId);
        
        let contextParts = [];

        // Add user context if available
        if (userContext.name) {
            contextParts.push(`The user's name is ${userContext.name}. Always remember to use their name when appropriate.`);
        }

        if (!fs.existsSync(filePath)) {
            return contextParts.join('\n') + (currentMessage ? `\n${currentMessage}` : '');
        }

        try {
            // Read the entire conversation
            let conversation = fs.readFileSync(filePath, 'utf8');
            let messages = conversation.split('\n').filter(line => line.trim());

            // Extract messages without timestamps and organize by exchange
            let exchanges = [];
            let currentExchange = { user: null, ai: null };

            messages.forEach(line => {
                const match = line.match(/\[.*?\] (User|AI): (.+)/);
                if (match) {
                    const [_, role, content] = match;
                    if (role === 'User') {
                        if (currentExchange.user !== null) {
                            exchanges.push({...currentExchange});
                            currentExchange = { user: null, ai: null };
                        }
                        currentExchange.user = content;
                    } else if (role === 'AI') {
                        currentExchange.ai = content;
                        if (currentExchange.user !== null) {
                            exchanges.push({...currentExchange});
                            currentExchange = { user: null, ai: null };
                        }
                    }
                }
            });

            // If we have a partial exchange, add it
            if (currentExchange.user || currentExchange.ai) {
                exchanges.push(currentExchange);
            }

            // If within length limit, use all exchanges
            const exchangeStrings = exchanges.map(ex => {
                let parts = [];
                if (ex.user) parts.push(`User: ${ex.user}`);
                if (ex.ai) parts.push(`Previous response: ${ex.ai}`);
                return parts.join('\n');
            });

            if (conversation.length <= MAX_CONTEXT_LENGTH) {
                contextParts.push(...exchangeStrings);
                return contextParts.join('\n\n') + '\n';
            }

            // If too long, use smart truncation
            // Always include the last 3 exchanges
            const lastExchanges = exchangeStrings.slice(-3);
            const remainingExchanges = exchangeStrings.slice(0, -3);
            
            // Calculate remaining space
            const essentialContent = lastExchanges.join('\n\n');
            const essentialLength = essentialContent.length + contextParts[0]?.length || 0;
            const remainingSpace = MAX_CONTEXT_LENGTH - essentialLength;

            if (remainingSpace > 100) {
                let currentLength = 0;
                let additionalExchanges = [];
                
                for (let i = remainingExchanges.length - 1; i >= 0; i--) {
                    const exchange = remainingExchanges[i];
                    if (currentLength + exchange.length > remainingSpace) break;
                    additionalExchanges.unshift(exchange);
                    currentLength += exchange.length + 2; // +2 for '\n\n'
                }

                contextParts.push(...additionalExchanges);
            }

            contextParts.push(...lastExchanges);
            return contextParts.join('\n\n') + '\n';

        } catch (error) {
            console.error(`[Storage] Error building context for user ${userId}:`, error);
            return contextParts.join('\n') + (currentMessage ? `\n${currentMessage}` : '');
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
                    lastInteraction: null,
                    fileSize: 0
                };
            }

            const stats = fs.statSync(filePath);
            const content = fs.readFileSync(filePath, 'utf8');
            const messages = content.split('\n').filter(line => line.trim());
            const lastMessage = messages[messages.length - 1];
            const lastInteractionMatch = lastMessage ? lastMessage.match(/\[(.*?)\]/) : null;

            return {
                messageCount: messages.length,
                lastInteraction: lastInteractionMatch ? new Date(lastInteractionMatch[1]) : null,
                fileSize: stats.size
            };
        } catch (error) {
            console.error(`[Storage] Error getting summary for user ${userId}:`, error);
            return {
                messageCount: 0,
                lastInteraction: null,
                fileSize: 0
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