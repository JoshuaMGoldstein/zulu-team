#!/usr/bin/env node

require('dotenv').config();
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'test.log');
function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(logFile, logMessage + '\n');
}

const config = {
    endpoint: process.env.EXEC_ENDPOINT,
    exec_token: process.env.EXEC_TOKEN,
    repoUrl: process.env.GIT_REPOURL,
    branch: process.env.GIT_BRANCH,
    sshKeyBase64: process.env.GIT_SSHKEY_BASE64,
    projectName: process.env.PROJECT_NAME,
    execCommand: process.env.EXEC_COMMAND,
    openaiBaseUrl: process.env.OPENAI_BASE_URL,
    openaiApiKey: process.env.OPENAI_API_KEY
};

function validateConfig() {
    const required = ['endpoint', 'repoUrl', 'branch', 'sshKeyBase64', 'projectName', 'execCommand', 'openaiBaseUrl', 'openaiApiKey'];
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
        const message = { type: 'exec', command, user, env, files };
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

async function runTest() {
    try {
        validateConfig();
        const token = config.exec_token;
        const projectPath = `/workspace/${config.projectName}`;
        
        // Single WebSocket connection for all commands
        log('Establishing single WebSocket connection...');
        const ws = await connectWebSocket('test-' + Date.now(), token);
        const gitFiles = { '~/.ssh/id_rsa': config.sshKeyBase64 };
        
        // Git clone and checkout
        log('Step 1: Git clone and checkout...');
        await executeCommand(ws, `cd /workspace && touch /workspace/test`, 'git', {}, gitFiles);
        await executeCommand(ws, `git clone ${config.repoUrl} ${projectPath}`, 'git', {}, gitFiles);
        await executeCommand(ws, `cd ${projectPath} && git fetch && git checkout -b ${config.branch} origin/${config.branch} && git pull`, 'git', {}, gitFiles);

        await executeCommand(ws, `chmod -R g+srwx ${projectPath}`, 'git', {}, gitFiles, projectPath);
        await executeCommand(ws, `ls -la ${projectPath}`, 'git', {}, gitFiles, projectPath);

        log('Git clone and checkout completed');

        
        
        // Exec command
        log('Step 2: Exec command...');
        const execEnv = { 
            OPENAI_BASE_URL: config.openaiBaseUrl, 
            OPENAI_API_KEY: config.openaiApiKey,
            GEMINI_API_KEY: config.openaiApiKey,  // Use the provided API key
            //HOME: '/home/exec',
            //XDG_CONFIG_HOME: '/home/exec/.config'  // Redirect config directory
        };
        await executeCommand(ws, config.execCommand, 'exec', execEnv);
        log('Exec command completed');
        
        // Verify file creation and commit
        log('Verifying file creation and commit...');
        await executeCommand(ws, `ls -la ${projectPath}`, 'git', {}, gitFiles, projectPath);
        await executeCommand(ws, `cd ${projectPath} && git log --oneline -3`, 'git', {}, gitFiles);
        await executeCommand(ws, `cd ${projectPath} && git status`, 'git', {}, gitFiles);
        
        // Git push
        log('Step 3: Git push...');
        await executeCommand(ws, `cd ${projectPath} && git push -u origin ${config.branch}`, 'git', {}, gitFiles);
        log('Git push completed');
        
        ws.close();
        log('Test completed successfully');
    } catch (error) {
        log(`Test failed: ${error.message}`, 'ERROR');
        process.exit(1);
    }
}

if (require.main === module) runTest();