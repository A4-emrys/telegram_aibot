const { setApiCredentials, removeApiCredentials, getApiCredentials } = require('./config');

const command = process.argv[2];

switch (command) {
    case 'set':
        const apiId = process.argv[3];
        const apiHash = process.argv[4];
        
        if (!apiId || !apiHash) {
            console.error('Usage: node config-cli.js set <API_ID> <API_HASH>');
            process.exit(1);
        }
        
        if (setApiCredentials(apiId, apiHash)) {
            console.log('API credentials saved successfully!');
        } else {
            console.error('Failed to save API credentials');
        }
        break;
        
    case 'remove':
        if (removeApiCredentials()) {
            console.log('API credentials removed successfully!');
        } else {
            console.error('Failed to remove API credentials');
        }
        break;
        
    case 'show':
        const credentials = getApiCredentials();
        if (credentials.apiId && credentials.apiHash) {
            console.log('Current API credentials:');
            console.log('API ID:', credentials.apiId);
            console.log('API Hash:', credentials.apiHash);
        } else {
            console.log('No API credentials found');
        }
        break;
        
    default:
        console.log('Usage:');
        console.log('  Set credentials:    node config-cli.js set <API_ID> <API_HASH>');
        console.log('  Remove credentials: node config-cli.js remove');
        console.log('  Show credentials:   node config-cli.js show');
        break;
} 