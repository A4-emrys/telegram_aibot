# Telegram AI Chat Bot

A Telegram bot that uses Ollama's local AI model to respond to messages, with conversation memory and customizable prompts.

## Requirements

- Node.js
- Ollama (with wizard-vicuna-uncensored:13b model)
- Telegram API credentials

## Setup

1. **Install Dependencies**
```bash
npm install
```

2. **Set up Telegram API Credentials**
- Go to https://my.telegram.org/apps
- Create a new application
- Get your `api_id` and `api_hash`
- Set them using the config tool:
```bash
node config-cli.js set YOUR_API_ID YOUR_API_HASH
```

3. **Start Ollama**
```bash
ollama run wizard-vicuna-uncensored:13b
```

4. **Start the Bot**
```bash
npm start
```
- On first run, you'll need to enter your phone number and verification code
- The session will be saved for future use

## Features

### Conversation Memory
- Conversations are stored in the `conversations` directory
- Each user's chat history is saved in a separate file
- Memory persists across bot restarts

### Customizable Prompt
- The bot's behavior is controlled by `prompt.txt`
- Edit this file anytime to change how the bot responds
- Changes take effect immediately without restart

### Available Commands
- `/clear` or `/reset` - Clear conversation memory
- `/status` - Show conversation statistics
- `/prompt` - View current system prompt
- `/help` - Show all available commands

## File Structure

- `index.js` - Main bot code
- `config.js` - API credentials management
- `conversations.js` - Conversation memory management
- `prompt.txt` - System prompt for AI behavior
- `conversations/` - Directory storing chat histories
- `.telegram-config.json` - Stored API credentials
- `.telegram-session` - Saved session data

## Customization

### Modifying the AI Prompt
Simply edit `prompt.txt` to change how the AI responds. The current prompt instructs the AI to:
- Keep responses concise and natural
- Be helpful and friendly
- Reference previous conversation parts
- Stay on topic
- Be honest about not knowing things

### Managing Conversations
- Conversations are automatically saved
- Use `/clear` to reset a conversation
- Each user's history is stored separately

## Troubleshooting

1. **Bot Not Responding**
   - Check if Ollama is running
   - Verify API credentials are set correctly
   - Check console for error messages

2. **Authentication Issues**
   - Delete `.telegram-session` and restart
   - Re-enter phone number and verification code

3. **Memory Issues**
   - Use `/clear` to reset conversation
   - Check `conversations` directory for stored chats

## Model Configuration

The bot uses the `wizard-vicuna-uncensored:13b` model by default. You can change this in `index.js` by modifying:
```javascript
const MODEL_NAME = 'wizard-vicuna-uncensored:13b';
```

## Security Notes

- Never share your `api_id` and `api_hash`
- The session is stored locally in `.telegram-session`
- Target user preferences are stored in `.target-user`
- Both files are created automatically

## Stopping the Bot

Press `Ctrl+C` to stop the bot safely.

## Contributing

Feel free to submit issues and enhancement requests! 