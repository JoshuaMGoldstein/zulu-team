const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static('public'));

// Ensure workspace directory exists
const WORKSPACE_DIR = '/workspace';
if (!fs.existsSync(WORKSPACE_DIR)) {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

// Store active processes and their client mappings
const activeProcesses = new Map(); // pid -> { process, clientId, ws }
let activeWebSocket = null; // Track the single active WebSocket connection
let idleTimeout = null; // Track idle timeout

// Function to reset idle timeout
function resetIdleTimeout() {
    if (idleTimeout) {
        clearTimeout(idleTimeout);
    }
    
    const timeoutSeconds = parseInt(process.env.TIMEOUTSECS) || 300;
    idleTimeout = setTimeout(() => {
        console.log(`Idle timeout reached (${timeoutSeconds}s), terminating WebSocket and rebooting container`);
        if (activeWebSocket && activeWebSocket.readyState === WebSocket.OPEN) {
            activeWebSocket.close(1001, 'Idle timeout');
        }
        // Kill the container
        exec('kill 1', (error) => {
            if (error) {
                console.error('Error executing kill 1:', error);
            } else {
                console.log('Container reboot initiated');
            }
        });
    }, timeoutSeconds * 1000);
}

// Function to setup workspace with files
function setupWorkspace(files) {
    if (!files || typeof files !== 'object') {
        return;
    }

    try {
        // Clear existing workspace contents
        if (fs.existsSync(WORKSPACE_DIR)) {
            fs.rmSync(WORKSPACE_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

        // Write new files
        for (const [filePath, base64Content] of Object.entries(files)) {
            let fullPath;
            let targetDir;
            
            // Handle home directory files
            if (filePath.startsWith('~/')) {
                const homeDir = os.homedir();
                const relativePath = filePath.substring(2); // Remove '~/'
                fullPath = path.join(homeDir, relativePath);
                targetDir = path.dirname(fullPath);
                
                // Create directories if they don't exist
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                
                // Handle .ssh directory with special permissions
                if (filePath.startsWith('~/.ssh')) {
                    const sshDir = path.join(homeDir, '.ssh');
                    
                    // Ensure .ssh directory exists with 700 permissions
                    if (!fs.existsSync(sshDir)) {
                        fs.mkdirSync(sshDir, { recursive: true });
                    }
                    fs.chmodSync(sshDir, 0o700);
                    
                    // Write file and set 600 permissions for private keys
                    const fileContent = Buffer.from(base64Content, 'base64');
                    fs.writeFileSync(fullPath, fileContent);
                    fs.chmodSync(fullPath, 0o600);
                } else {
                    // Regular home directory file
                    const fileContent = Buffer.from(base64Content, 'base64');
                    fs.writeFileSync(fullPath, fileContent);
                }
            } else {
                // Regular workspace file
                fullPath = path.join(WORKSPACE_DIR, filePath);
                targetDir = path.dirname(fullPath);
                
                // Create directories if they don't exist
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                
                // Write file from base64
                const fileContent = Buffer.from(base64Content, 'base64');
                fs.writeFileSync(fullPath, fileContent);
            }
        }
        
        console.log('Workspace setup complete');
    } catch (error) {
        console.error('Error setting up workspace:', error);
        throw error;
    }
}

// Function to spawn a command
function spawnCommand(command, args, env, clientId, ws = null) {
    console.log(`Spawning command: ${command} ${args.join(' ')} for client: ${clientId}`);
    
    const processEnv = { ...process.env, ...env };
    const childProcess = spawn(command, args, {
        cwd: WORKSPACE_DIR,
        env: processEnv,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    const pid = childProcess.pid;
    
    // Store process info
    activeProcesses.set(pid, {
        process: childProcess,
        clientId: clientId,
        ws: ws
    });

    // Handle stdout
    childProcess.stdout.on('data', (data) => {
        const message = {
            type: 'stdout',
            data: data.toString(),
            pid: pid
        };
        broadcastToClient(clientId, message);
    });

    // Handle stderr
    childProcess.stderr.on('data', (data) => {
        const message = {
            type: 'stderr',
            data: data.toString(),
            pid: pid
        };
        broadcastToClient(clientId, message);
    });

    // Handle process close
    childProcess.on('close', (code) => {
        const message = {
            type: 'stdclose',
            data: `${code}`,
            pid: pid
        };
        broadcastToClient(clientId, message);
        activeProcesses.delete(pid);
    });

    childProcess.on('error', (error) => {
        const message = {
            type: 'stderr',
            data: `Error: ${error.message}`,
            pid: pid
        };
        broadcastToClient(clientId, message);
        activeProcesses.delete(pid);
    });

    return pid;
}

// Broadcast message to the active WebSocket connection
function broadcastToClient(clientId, message) {
    if (activeWebSocket && activeWebSocket.readyState === WebSocket.OPEN) {
        activeWebSocket.send(JSON.stringify(message));
    }
}

// POST endpoint for executing commands
app.post('/exec', (req, res) => {
    const { clientid, command, env = {}, files } = req.body;
    
    if (!clientid || !command) {
        return res.status(400).json({ error: 'clientid and command are required' });
    }

    try {
        // Setup workspace if files provided
        if (files) {
            setupWorkspace(files);
        }

        // Parse command and arguments
        const [cmd, ...args] = command.split(' ');
        const pid = spawnCommand(cmd, args, env, clientid);
        
        res.json({ type: 'open', pid: pid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const clientId = url.searchParams.get('clientid');
    
    if (!clientId) {
        ws.close(1008, 'clientid query parameter is required');
        return;
    }

    // Reject if there's already an active WebSocket
    if (activeWebSocket && activeWebSocket.readyState === WebSocket.OPEN) {
        ws.close(1008, 'Only one WebSocket connection is allowed');
        return;
    }

    // Set this as the active WebSocket
    activeWebSocket = ws;
    console.log(`WebSocket connected for client: ${clientId}`);

    // Reset idle timeout on connection
    resetIdleTimeout();

    // Handle incoming messages
    ws.on('message', (message) => {
        try {
            // Reset idle timeout on any activity
            resetIdleTimeout();
            
            const data = JSON.parse(message);
            
            if (data.type === 'exec') {
                // Execute command via WebSocket
                const { command, env = {}, files } = data;
                if (!command) {
                    ws.send(JSON.stringify({ error: 'command is required' }));
                    return;
                }

                try {
                    // Setup workspace if files provided
                    if (files) {
                        setupWorkspace(files);
                    }

                    const [cmd, ...args] = command.split(' ');
                    const pid = spawnCommand(cmd, args, env, clientId, ws);
                    ws.send(JSON.stringify({ type: 'open', pid: pid }));
                } catch (error) {
                    ws.send(JSON.stringify({ error: error.message }));
                }
            } else if (data.type === 'stdin') {
                // Send input to process
                const { data: inputData, pid } = data;
                if (!pid || !inputData) {
                    ws.send(JSON.stringify({ error: 'pid and data are required for stdin' }));
                    return;
                }

                const processInfo = activeProcesses.get(pid);
                if (processInfo && processInfo.clientId === clientId) {
                    processInfo.process.stdin.write(inputData + '\n');
                } else {
                    ws.send(JSON.stringify({ error: 'Process not found or not owned by this client' }));
                }
            }
        } catch (error) {
            ws.send(JSON.stringify({ error: 'Invalid JSON message' }));
        }
    });

    // Handle connection close
    ws.on('close', () => {
        console.log(`WebSocket disconnected for client: ${clientId}`);
        activeWebSocket = null;
        
        // Clear idle timeout
        if (idleTimeout) {
            clearTimeout(idleTimeout);
            idleTimeout = null;
        }
        
        // Kill all active processes
        activeProcesses.forEach((processInfo, pid) => {
            try {
                processInfo.process.kill('SIGTERM');
            } catch (error) {
                console.error(`Error killing process ${pid}:`, error);
            }
        });
        activeProcesses.clear();
        
        // Reboot the container
        console.log('WebSocket closed, rebooting container');
        exec('kill 1', (error) => {
            if (error) {
                console.error('Error executing kill 1:', error);
            } else {
                console.log('Container reboot initiated');
            }
        });
    });

    // Handle errors
    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        activeWebSocket = null;
        
        // Clear idle timeout
        if (idleTimeout) {
            clearTimeout(idleTimeout);
            idleTimeout = null;
        }
        
        // Reboot the container on error
        console.log('WebSocket error, rebooting container');
        exec('kill 1', (error) => {
            if (error) {
                console.error('Error executing kill 1:', error);
            } else {
                console.log('Container reboot initiated');
            }
        });
    });
});

// Start server
const PORT = process.env.PORT || 8088;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`POST endpoint: http://localhost:${PORT}/exec`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws?clientid=YOUR_CLIENT_ID`);
});