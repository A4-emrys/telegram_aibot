# Telegram AI Chat Bot

A Telegram bot that uses Ollama's local AI model to respond to messages, with conversation memory and customizable prompts.

For more questions contact https://t.me/brokensim


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
- `.gitignore` - Specifies which files Git should ignore

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
- Sensitive files and directories are included in `.gitignore`

## Version Control

The project includes a `.gitignore` file that excludes:
- Node dependencies (`node_modules/`)
- Environment files (`.env`, `.env.local`, etc.)
- Log files
- Editor-specific files
- Session and configuration files containing sensitive data

## Stopping the Bot

Press `Ctrl+C` to stop the bot safely.

## Contributing

Feel free to submit issues and enhancement requests!

## Disclaimer

This software is provided "as is" without warranty of any kind, either express or implied. The user assumes all responsibility for any consequences resulting from the use of this software. The creator(s) and contributors of this project will not be held responsible for any inappropriate use, damages, or any other liabilities arising from the use or misuse of this software.

## License

MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE. 