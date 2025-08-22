#!/usr/bin/env node

require('dotenv').config();
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'exec.log');
function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(logFile, logMessage + '\n');
}

// Parse command line arguments
const args = process.argv.slice(2);
let model = 'kimi-k2-turbo-preview'; // Default model
let commandToExecute = null;
let user = 'exec'; // Default user

// Display help if no arguments or --help is provided
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node exec.js [options]

Options:
  --model <model>     Specify the model to use (default: kimi-k2-turbo-preview)
  --exec <command>    Command to execute in the container
  --user <user>       User to run the command as (default: exec)
  --help, -h          Show this help message

Examples:
  node exec.js --exec "ls -la /workspace"
  node exec.js --exec "whoami" --user git
    `);
    process.exit(0);
}

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && i + 1 < args.length) {
        model = args[i + 1];
        i++; // Skip next argument
    } else if (args[i] === '--exec' && i + 1 < args.length) {
        commandToExecute = args[i + 1];
        i++; // Skip next argument
    } else if (args[i] === '--user' && i + 1 < args.length) {
        user = args[i + 1];
        i++; // Skip next argument
    }
}

const config = {
    endpoint: process.env.EXEC_ENDPOINT,
    exec_token: process.env.EXEC_TOKEN,
    repoUrl: process.env.GIT_REPOURL,
    branch: process.env.GIT_BRANCH,
    sshKeyBase64: process.env.GIT_SSHKEY_BASE64,
    projectName: process.env.PROJECT_NAME,
    execCommand: commandToExecute || `echo "Container is ready for commands"`,
    openaiBaseUrl: process.env.OPENAI_BASE_URL,
    openaiApiKey: process.env.OPENAI_API_KEY
};

function validateConfig() {
    const required = ['endpoint', 'exec_token', 'openaiBaseUrl', 'openaiApiKey'];
    const missing = required.filter(key => !config[key]);
    if (missing.length > 0) throw new Error(`Missing: ${missing.join(', ')}`);
    log('Config validated');
}

function connectWebSocket(clientId, token) {
    return new Promise((resolve, reject) => {
        const wsUrl = `${config.endpoint}?clientid=${clientId}&token=${token}`;
        log(`Connecting: ${wsUrl}`);
        
        const ws = new WebSocket(wsUrl);
        
        const timeout = setTimeout(() => {
            reject(new Error('WebSocket connection timeout'));
        }, 10000);
        
        ws.on('open', () => {
            clearTimeout(timeout);
            log('WebSocket connected');
            resolve(ws);
        });
        
        ws.on('error', (error) => {
            clearTimeout(timeout);
            log(`WebSocket error: ${error.message}`, 'ERROR');
            reject(error);
        });
        
        ws.on('close', (code, reason) => {
            log(`WebSocket closed: ${code} ${reason}`, 'WARN');
        });
    });
}

function executeCommand(ws, command, user, env = {}, files = {}, cwd = '/workspace') {
    return new Promise((resolve, reject) => {
        const message = { type: 'exec', command, user, env, files, cwd };
        let output = '';
        let exitCode = null;
        
        const messageHandler = (data) => {
            const res = JSON.parse(data);
            log(`Received: ${JSON.stringify(res)}`);
            
            if (res.type === 'stdout') {
                output += res.data;
                log(`STDOUT: ${res.data}`);
            } else if (res.type === 'stderr') {
                output += res.data;
                log(`STDERR: ${res.data}`);
            } else if (res.type === 'stdclose') {
                exitCode = parseInt(res.data);
                log(`Process closed with exit code: ${exitCode}`);
                ws.off('message', messageHandler);
                exitCode === 0 ? resolve({ output, exitCode }) : reject(new Error(`Exit ${exitCode}: ${output}`));
            } else if (res.error) {
                log(`Error: ${res.error}`);
                ws.off('message', messageHandler);
                reject(new Error(res.error));
            }
        };
        
        ws.on('message', messageHandler);
        log(`Sending command: ${command} as user: ${user} in ${cwd}`);
        ws.send(JSON.stringify(message));
    });
}

async function runExec() {
    try {
        validateConfig();
        const token = config.exec_token;
        
        // Single WebSocket connection for all commands
        log('Establishing single WebSocket connection...');
        const ws = await connectWebSocket('exec-' + Date.now(), token);
        
        log('Container is ready for commands');
        
        // Execute the provided command or default command
        log('Executing command...');
        const execEnv = { 
            OPENAI_BASE_URL: config.openaiBaseUrl, 
            OPENAI_API_KEY: config.openaiApiKey,
            GEMINI_API_KEY: config.openaiApiKey
        };
        await executeCommand(ws, config.execCommand, user, execEnv);
        log('Command execution completed');
        
        // Keep the connection open for interactive use
        log('Container is ready. You can now run additional commands.');
        log('Press Ctrl+C to exit.');
        
        // Keep the process running
        process.stdin.resume();
        
        // Handle Ctrl+C
        process.on('SIGINT', () => {
            log('Closing WebSocket connection...');
            ws.close();
            process.exit(0);
        });
        
    } catch (error) {
        log(`Execution failed: ${error.message}`, 'ERROR');
        process.exit(1);
    }
}

if (require.main === module) runExec();