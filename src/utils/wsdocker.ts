import { DataListener,ErrorListener,StatusCodeListener, IDocker, RunOptions, ExecOptions, ExecResult, ProcessInfo, ContainerInfo, ContainerList, PsOptions, IChildProcess } from './idocker';
import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './log';
import { randomUUID } from 'crypto';


export class WSDockerProcess implements IChildProcess {
    private eventListeners: Map<string, Set<Function>> = new Map();
    private onceEventListeners: Map<string, Set<Function>> = new Map();

    constructor(private ws: WebSocket, public pid: string, public containerName: string) {
        this.stdin = {
            write: (data: string) => {
                this.ws.send(JSON.stringify({ type: 'stdin', pid: this.pid, data }));
            },
            end: () => {
                // WebSocket protocol doesn't have a direct 'end' for stdin,
                // so we might need to send a special signal or rely on the command finishing.
                // For now, we'll just log it.
                log(`stdin.end() called for PID ${this.pid}`);
            }
        };

        this.stdout = {
            on: (event, listener) => this.addEventListener(`stdout`, listener),
            removeListener: (event, listener) => this.removeEventListener(`stdout`, listener),
            once: (event, listener) => this.addOnceListener(`stdout`, listener)
        };

        this.stderr = {
            on: (event, listener) => this.addEventListener(`stderr`, listener),
            removeListener: (event, listener) => this.removeEventListener(`stderr`, listener),
            once: (event, listener) => this.addOnceListener(`stderr`, listener)
        };
    }

    public stdin: { write: (data: string) => void; end: () => void; };
    public stdout?: { on: (event: 'data', listener: DataListener) => void; removeListener: (event: 'data', listener: DataListener) => void; once: (event: 'data', listener: DataListener) => void; };
    public stderr?: { on: (event: 'data', listener: DataListener) => void; removeListener: (event: 'data', listener: DataListener) => void; once: (event: 'data', listener: DataListener) => void; };

    on(event: 'close' | 'error', listener: StatusCodeListener|ErrorListener): void {
        this.addEventListener(`${event}`, listener);
    }

    removeListener(event: 'close' | 'error', listener: StatusCodeListener|ErrorListener): void {
        this.removeEventListener(`${event}`, listener);
    }

    once(event: 'close' | 'error', listener: StatusCodeListener|ErrorListener): void {
        this.addOnceListener(`${event}`, listener);
    }

    private addEventListener(eventName: string, listener: Function) {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, new Set());
        }
        this.eventListeners.get(eventName)!.add(listener);
    }

    private removeEventListener(eventName: string, listener: Function) {
        if (this.eventListeners.has(eventName)) {
            this.eventListeners.get(eventName)!.delete(listener);
        }
        if (this.onceEventListeners.has(eventName)) {
            this.onceEventListeners.get(eventName)!.delete(listener);
        }
    }

    private addOnceListener(eventName: string, listener: Function) {
        if (!this.onceEventListeners.has(eventName)) {
            this.onceEventListeners.set(eventName, new Set());
        }
        this.onceEventListeners.get(eventName)!.add(listener);
    }

    emit(eventName: string, ...args: any[]) {
        //console.log(`Emitting event: ${eventName} with args: ${args}`)
        // Emit regular listeners
        if (this.eventListeners.has(eventName)) {
            // Create a copy to prevent issues if listeners modify the set during iteration
            const listeners = new Set(this.eventListeners.get(eventName)!);
            listeners.forEach(listener => { 
                //console.log(`Calling eventlistener for event ${eventName}`); 
                listener(...args) 
            });
        }
        // Emit once listeners and then clear them
        if (this.onceEventListeners.has(eventName)) {
            // Create a copy to prevent issues if listeners modify the set during iteration
            const onceListeners = new Set(this.onceEventListeners.get(eventName)!);
            onceListeners.forEach(listener => { 
                this.onceEventListeners.get(eventName)?.delete(listener);
                //console.log(`Calling oncelistener for event ${eventName}`); 
                listener(...args) 
            });            
        }
    }
}

class WSDockerConnection {
    constructor(public ws: WebSocket, public imageName: string) {

    }
    public files: Record<string, string|Buffer> = {}
    public env: Record<string, string> = {}
}

/**
 * WebSocket-based Docker implementation
 * Uses Cloudflare's Docker WebSocket endpoints for remote container operations
 * Environment variables: DOCKER_ENDPOINT_GEMINI_DOCKER, DOCKER_ENDPOINT_CLAUDE_DOCKER
 */
export class WSDocker implements IDocker {
    private connections: Map<string, WSDockerConnection> = new Map();
    private childProcesses: Map<string, WSDockerProcess> = new Map(); // Map PID to WSDockerProcess

    private getEndpoint(imageName: string, containerName?: string): string {
        const endpoints: Record<string, string> = {
            'gemini-docker': process.env.DOCKER_ENDPOINT_GEMINI_DOCKER || 'ws://localhost:8088/ws',
            'claude-docker': process.env.DOCKER_ENDPOINT_CLAUDE_DOCKER || 'ws://localhost:8089/ws'
        };
        let endpoint = endpoints[imageName] || endpoints['gemini-docker'];
        
        // Add clientid parameter
        if (containerName) {
            const separator = endpoint.includes('?') ? '&' : '?';
            endpoint += `${separator}clientid=${containerName}`;
        }
        
        // Add token parameter if DOCKER_WS_TOKEN is set
        const token = process.env.DOCKER_WS_TOKEN;
        if (token) {
            const separator = endpoint.includes('?') ? '&' : '?';
            endpoint += `${separator}token=${token}`;
        }
        
        return endpoint;
    }

    private async connect(containerName: string, imageName: string): Promise<WSDockerConnection> {
        if (this.connections.has(containerName)) {
            return this.connections.get(containerName)!;
        }

        const endpoint = this.getEndpoint(imageName, containerName);
        log(`Connecting to WebSocket for container ${containerName} (${imageName}): ${endpoint}`);
        const ws = new WebSocket(endpoint);

        return new Promise((resolve, reject) => {
            ws.on('open', () => {
                const connection = new WSDockerConnection(ws, imageName);
                this.connections.set(containerName, connection);
                log(`WSDocker: Connection Established for container ${containerName} (${imageName})`);
                resolve(connection);
            });

            ws.on('message', (data) => {
                //log(`WSDocker: Message recieved for container ${containerName} (${imageName}): `+data);
                try {
                    const response = JSON.parse(data.toString());
                    const childProcess = this.childProcesses.get(response.pid);
                    if (childProcess) {
                        switch (response.type) {
                            case 'stdout':
                                childProcess.emit('stdout', Buffer.from(response.data || ''));
                                break;
                            case 'stderr':
                                childProcess.emit('stderr', Buffer.from(response.data || ''));
                                break;
                            case 'stdclose':
                                childProcess.emit('close', parseInt(response.data || '0'));
                                this.childProcesses.delete(response.pid);
                                break;
                            case 'error':
                                childProcess.emit('error', new Error(response.data || 'Unknown WebSocket error'));
                                this.childProcesses.delete(response.pid);
                                break;
                        }
                    }
                } catch (error) {
                    log(`Error parsing WebSocket message: ${error}`);
                }
            });

            ws.on('error', (error) => {
                log(`WebSocket error for container ${containerName}:`, error);
                reject(error);
            });

            ws.on('close', (code, reason) => {
                log(`WebSocket closed for container ${containerName}: Code=${code}, Reason=${reason}`);
                this.connections.delete(containerName);
                // Emit close for any active child processes associated with this connection
                this.childProcesses.forEach((child, pid) => {
                    if (child.containerName === containerName) {
                        child.emit('close', code || 1); // Emit a non-zero exit code on unexpected close
                        this.childProcesses.delete(pid);
                    }
                });
            });
        });
    }

    async fsExists(containerName: string, filePath: string, options?:ExecOptions): Promise<boolean> {
        try {
            const result = await this.exec(containerName, `[ -e "${filePath}" ] && echo "exists" || echo "not found"`, options);
            return result.stdout.trim() === 'exists';
        } catch (error) {
            return false;
        }
    }

    async fsWriteFile(containerName: string, filePath: string, content: string|Buffer, mode?: number, options?: ExecOptions): Promise<void> {
        let connection = this.connections.get(containerName);
        if(!connection) {
            throw new Error("No container named "+containerName+" found");
        }

        connection.files[filePath] = content;
        
        if (mode !== undefined) {
            await this.exec(containerName, `chmod ${mode.toString(8)} "${filePath}"`, options);
        } else {
            await this.exec(containerName, `:`, options);
        }
    }

    async fsChmod(containerName: string, filePath: string, mode: number, options?:ExecOptions): Promise<void> {
        await this.exec(containerName, `chmod ${mode.toString(8)} "${filePath}"`, options);
    }

    async run(containerName: string, imageName: string, options?: RunOptions): Promise<ContainerInfo> {
        // Establish WebSocket connection for this container/image combination
        let connection = await this.connect(containerName, imageName);

        // Store environment variables on the connection for later use
        connection.env = { ...options?.env };
        
        // Initialize files map if not exists
        if (!connection.files) connection.files = {};
        
        // Load volume files into containerFiles map
        if (options?.volumes) {
            for (const [source, destination] of Object.entries(options.volumes)) {
                console.log(`Loading volume files from ${source} to ${destination}`);
                await this.loadVolumeFiles(containerName, source, destination);
                console.log(`Loaded files:`, Object.keys(connection.files));
            }
        }
        
        // Return mock container info (WebSocket containers are always "running")
        return {
            name: containerName,
            image: connection.imageName,
            status: 'running',
            state: 'running',
            config: {
                env: connection.env,
                workingDir: '/workspace',
                user: 'exec'
            },
            mounts: Object.entries(options?.volumes || {}).map(([source, dest]) => ({
                source,
                destination: dest,
                mode: 'rw'
            }))
        };
    }

    private encodeFilesToBase64(files: Record<string, any>): Record<string, string> {
        const encodedFiles: Record<string, string> = {};
        
        for (const [filePath, content] of Object.entries(files)) {
            if (typeof content === 'string') {
                encodedFiles[filePath] = Buffer.from(content, 'utf-8').toString('base64');
            } else if (Buffer.isBuffer(content)) {
                encodedFiles[filePath] = content.toString('base64');
            } else if (typeof content === 'object' && content !== null) {
                // Handle objects by stringifying them
                encodedFiles[filePath] = Buffer.from(JSON.stringify(content), 'utf-8').toString('base64');
            } else {
                // Fallback for any other type
                encodedFiles[filePath] = Buffer.from(String(content), 'utf-8').toString('base64');
            }
        }
        
        return encodedFiles;
    }

    private async loadVolumeFiles(containerName: string, sourcePath: string, destinationPath: string): Promise<void> {
        if (sourcePath.startsWith('gs://')) {
            await this.mountGCSBucket(containerName, sourcePath, destinationPath);
            return;
        }

        if (!fs.existsSync(sourcePath)) {
            console.log(`Source path ${sourcePath} does not exist`);
            return;
        }

        const connection = this.connections.get(containerName);
        if(!connection) {
            console.log(`No connection found for ${containerName}`);
            return;
        }
        
        const loadFilesRecursive = (relativePath: string) => {
            const fullPath = path.join(sourcePath, relativePath);
            
            if (fs.statSync(fullPath).isDirectory()) {
                const items = fs.readdirSync(fullPath);
                for (const item of items) {
                    loadFilesRecursive(path.join(relativePath, item));
                }
            } else {
                const content:Buffer = fs.readFileSync(fullPath);
                console.log(`Content of volume file: ${fullPath} : ${content} - typeof: ${typeof content}`);
                const containerPath = path.join(destinationPath, relativePath);
                console.log(`Loading file: ${fullPath} -> ${containerPath}`);
                // Use helper function for consistent base64 encoding                
                if (!connection.files) connection.files = {};
                Object.assign(connection.files, { [containerPath]: content });
            }
        };

        loadFilesRecursive('');
    }

    private async mountGCSBucket(containerName: string, sourcePath: string, destinationPath: string): Promise<void> {
        const connection = this.connections.get(containerName);
        if (!connection) {
            console.log(`No connection found for ${containerName}`);
            return;
        }

        // Parse GCS path: gs://bucket-name/path/to/subdir
        const gcsPath = sourcePath.replace('gs://', '');
        const [bucketName, ...pathParts] = gcsPath.split('/');
        const bucketPath = pathParts.join('/');

        console.log(`Setting up GCS mount: ${sourcePath} -> ${destinationPath}`);

        // Create mount script using the mount-gcs.workflow format
        const mountScript = `#!/bin/bash
set -e

# Ensure mount point exists
mkdir -p "${destinationPath}"

# Mount GCS bucket using gcsfuse
if [ -f /workspace/service-account-key.json ]; then
    export GOOGLE_APPLICATION_CREDENTIALS=/workspace/service-account-key.json
    gcsfuse ${bucketPath ? '--only-dir ' + bucketPath : ''} ${bucketName} "${destinationPath}"
    echo "Successfully mounted ${sourcePath} to ${destinationPath}"
else
    echo "Warning: No service account key found, skipping GCS mount"
fi
`;

        // Add mount script to container files
        if (!connection.files) connection.files = {};
        connection.files['/workspace/mount-gcs.sh'] = mountScript;

        // Make script executable and run it
        try {
            await this.exec(containerName, 'chmod +x /workspace/mount-gcs.sh');
            await this.exec(containerName, '/workspace/mount-gcs.sh');
        } catch (error) {
            console.log(`Error mounting GCS bucket:`, error);
        }
    }

    async rm(containerName: string, force: boolean = true): Promise<void> {
        const connection = this.connections.get(containerName);
        if (connection) {
            if(connection.ws) {
                connection.ws.close();
            }
            this.connections.delete(containerName);
        }
    }

    async exec(containerName: string, command: string, options?: ExecOptions): Promise<ExecResult> {
        const connection = this.connections.get(containerName);
        if (!connection) {
            throw new Error(`Container ${containerName} not found`);
        }  

        // Merge environment variables
        const containerEnv = connection.env;
        const mergedEnv = { ...containerEnv, ...options?.env };

        // Merge files
        const containerFiles = connection.files;
        const mergedFiles: Record<string, string|Buffer> = { ...containerFiles, ...options?.files };
        

        const message = {
            type: 'exec',
            command: command,
            user: options?.user || 'exec',
            cwd: options?.cwd || '/workspace',
            env: mergedEnv,
            files: this.encodeFilesToBase64(mergedFiles),
            pid: randomUUID() // Assign a unique PID for this execution
        };


        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            let exitCode = 0;
            let timeoutId: NodeJS.Timeout | undefined;

            if (options?.timeout) {
                timeoutId = setTimeout(() => {
                    reject(new Error(`Command timed out after ${options.timeout}ms`));
                }, options.timeout);
            }

            const childProcess = new WSDockerProcess(connection.ws, message.pid, containerName);
            this.childProcesses.set(message.pid, childProcess);

            childProcess.stdout?.on('data', (data) => {
                console.log(`Got stdout for container ${containerName}:`+data);
                stdout += data.toString();
            });
            childProcess.stderr?.on('data', (data) => {
                console.log(`Got stderr for container ${containerName}:`+data);
                stderr += data.toString();
            });
            childProcess.on('close', (code:number) => {
                console.log(`Got close for container ${containerName}:`+code);
                if (timeoutId) clearTimeout(timeoutId);
                exitCode = code || 0;
                resolve({
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    exitCode
                });
                this.childProcesses.delete(message.pid);
            });
            childProcess.on('error', (error:Error) => {
                console.log(`Got error for container ${containerName}:`+error);
                if (timeoutId) clearTimeout(timeoutId);
                reject(error);
                this.childProcesses.delete(message.pid);
            });

            //console.log(`Sending message for container  ${containerName}: ${JSON.stringify(message)}`)
            connection.ws.send(JSON.stringify(message));
        });
    }

    async spawnExec(containerName: string, command: string, options?: ExecOptions, stdinContent?: string): Promise<IChildProcess> {
        const connection = this.connections.get(containerName);
        if (!connection) {
            throw new Error(`WebSocket not connected for container ${containerName}. Call run() first.`);
        }

        const pid = randomUUID(); // Unique PID for this spawned process
        const childProcess = new WSDockerProcess(connection.ws, pid, containerName);
        this.childProcesses.set(pid, childProcess);

        const message = {
            type: 'exec',
            command: command,
            user: options?.user || 'exec',
            cwd: options?.cwd || '/workspace',
            env: { ...connection.env, ...options?.env },
            files: options?.files ? this.encodeFilesToBase64(options.files) : {},
            stdin: stdinContent,
            pid: pid
        };

        connection.ws.send(JSON.stringify(message));

        return childProcess;
    }

    async inspect(containerName: string): Promise<ContainerInfo> {
        const connection = this.connections.get(containerName);
        if (!connection) {
            throw new Error(`Container ${containerName} not found`);
        }

        // Return cached container info for WebSocket containers
        const containerEnv = connection.env;
        return {
            name: containerName,
            image: connection.imageName,
            status: 'running',
            state: 'running',
            config: {
                env: containerEnv,
                workingDir: '/workspace',
                user: 'exec'
            },
            mounts: []
        };
    }

    async ps(options?: PsOptions): Promise<ContainerList> {
        // For WebSocket implementation, return only connected containers
        const containers = Array.from(this.connections.entries()).map(([name, connection]) => ({
            name,
            image: connection.imageName,
            status: 'running',
            id: name
        }));

        let filtered = containers;
        
        if (options?.name) {
            filtered = filtered.filter(c => c.name.includes(options.name!));
        }
        
        if (options?.image) {
            filtered = filtered.filter(c => c.image.includes(options.image!));
        }
        
        if (options?.status && options.status !== 'running') {
            filtered = [];
        }
        
        if (!options?.all) {
            filtered = filtered.filter(c => c.status === 'running');
        }

        return {
            containers: filtered,
            total: filtered.length
        };
    }
}



// Export singleton instance
export default new WSDocker();