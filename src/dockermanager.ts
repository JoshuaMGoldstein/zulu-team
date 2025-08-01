import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { log } from './utils/log';
import * as dotenv from 'dotenv';
import { BotOutput, BotEventType } from './bots/types';
import { Message } from 'discord.js';
import { sendChunkedMessage } from './utils/discord';

dotenv.config();

const execAsync = promisify(exec);

type PromiseResolver = {
    resolve: (output: BotOutput) => void;
    reject: (reason?: any) => void;
};

type StoredPromise = {
    resolver: PromiseResolver;
    logs: BotOutput[];
    eventInfo: any;
};

class DockerManager {
    private instances: any[];
    private instancesPath: string;
    private openPromises: Map<string, Map<string, StoredPromise>> = new Map();

    constructor() {
        this.instancesPath = path.join(__dirname, '../bot-instances/instances.json');
        this.instances = [];
        this.loadInstances();
    }

    private loadInstances() {
        this.instances = JSON.parse(fs.readFileSync(this.instancesPath, 'utf-8'));
    }

    private async getRunningContainers(): Promise<Map<string, string>> {
        const containerMap = new Map<string, string>();
        try {
            const { stdout } = await execAsync('docker ps --format "{{.Names}}\t{{.Image}}"');
            const lines = stdout.split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                const [name, image] = line.split('\t');
                containerMap.set(name, image);
            }
        } catch (error) {
            log('Error getting running Docker containers:', error);
        }
        return containerMap;
    }

    public async initBots(instanceIds?: string[]) {
        this.loadInstances();
        log('Initializing and verifying bot containers...');
        const runningContainers = await this.getRunningContainers();

        const instancesToInit = instanceIds
            ? this.instances.filter(inst => instanceIds.includes(inst.id))
            : this.instances;

        for (const instance of instancesToInit) {
            if (instance.enabled) {
                const containerName = `zulu-instance-${instance.id}`;
                const expectedImage = instance.cli === 'gemini' ? 'gemini-docker' : 'claude-docker';
                const runningImage = runningContainers.get(containerName);

                if (runningImage) {
                    if (runningImage !== expectedImage) {
                        log(`Container ${containerName} is running the wrong image (${runningImage}). Recreating...`);
                        await this.stopAndRemoveContainer(containerName);
                        await this.startBotContainer(instance);
                    } else {
                        log(`Container ${containerName} is running the correct image.`);
                    }
                } else {
                    log(`Container ${containerName} not found. Starting...`);
                    await this.startBotContainer(instance);
                }
            }
        }
    }

    private async startBotContainer(instance: any) {
        const imageName = instance.cli === 'gemini' ? 'gemini-docker' : 'claude-docker';
        const containerName = `zulu-instance-${instance.id}`;
        const volumePath = path.resolve(__dirname, `../bot-instances/${instance.id}`);
        
        let envVars = '';
        if (instance.cli === 'gemini') {
            envVars = `-e GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`;
        }

        const command = `docker run -d --name ${containerName} -v "${volumePath}:/workspace" --network=host ${envVars} ${imageName} sleep infinity`;

        try {
            await execAsync(command);
            log(`Container ${containerName} started successfully.`);
        } catch (error) {
            log(`Error starting container ${containerName}:`, error);
        }
    }

    private async stopAndRemoveContainer(containerName: string) {
        try {
            await execAsync(`docker rm -f ${containerName}`);
            log(`Container ${containerName} stopped and removed.`);
        } catch (error) {
            log(`Error stopping or removing container ${containerName}:`, error);
        }
    }

    public handleToolCall(instanceId: string, eventId: string, toolCallData: any) {
        const instancePromises = this.openPromises.get(instanceId);
        if (instancePromises && instancePromises.has(eventId)) {
            const storedPromise = instancePromises.get(eventId);
            if (storedPromise) {
                const childProcess = {} as ChildProcess; // A mock or placeholder might be needed if the process object is used
                storedPromise.resolver.resolve({
                    type: BotEventType.TOOLCALL,
                    output: toolCallData,
                    next: this.createNextEventPromise(childProcess, instanceId, eventId),
                });
            }
        }
    }

    private createNextEventPromise(child: ChildProcess, instanceId: string, eventId: string, statusMessage?: Message): Promise<BotOutput> {
        return new Promise((resolve, reject) => {
            const storedPromise = this.openPromises.get(instanceId)?.get(eventId);
            if (storedPromise) {
                storedPromise.resolver = { resolve, reject };
            }

            let fullResponse = '';
            const stdoutListener = (data: Buffer) => {
                const output = data.toString();
                fullResponse += output;
                if (statusMessage) {
                    sendChunkedMessage(statusMessage, fullResponse);
                }
                cleanup();
                resolve({
                    type: BotEventType.STDOUT,
                    output: output,
                    next: this.createNextEventPromise(child, instanceId, eventId, statusMessage),
                });
            };

            const stderrListener = (data: Buffer) => {
                cleanup();
                resolve({
                    type: BotEventType.STDERR,
                    output: data.toString(),
                    next: this.createNextEventPromise(child, instanceId, eventId, statusMessage),
                });
            };

            const closeListener = (code: number) => {
                cleanup();
                this.openPromises.get(instanceId)?.delete(eventId);
                resolve({
                    type: BotEventType.CLOSE,
                    output: `Process exited with code ${code}`,
                });
            };

            const errorListener = (err: Error) => {
                cleanup();
                this.openPromises.get(instanceId)?.delete(eventId);
                reject(err);
            };

            const cleanup = () => {
                child.stdout?.removeListener('data', stdoutListener);
                child.stderr?.removeListener('data', stderrListener);
                child.removeListener('close', closeListener);
                child.removeListener('error', errorListener);
            };

            child.stdout?.once('data', stdoutListener);
            child.stderr?.once('data', stderrListener);
            child.once('close', closeListener);
            child.once('error', errorListener);
        });
    }

    public activateBot(instance: any, messageContent?: string, eventId?: string, statusMessage?: Message): Promise<BotOutput> {
        const eventTimestamp = eventId || new Date().toISOString();
        const containerName = `zulu-instance-${instance.id}`;
        let cliCommand: string;

        if (instance.cli === 'gemini') {
            cliCommand = 'gemini --autosave --resume --yolo';
        } else {
            cliCommand = `claude --dangerously-skip-permissions --continue --model ${instance.model}`;
        }

        const env = {
            ...process.env,
            DISCORD_EVENT_ID: eventTimestamp,
            INSTANCE_ID: instance.id,
            API_URL: 'http://host.docker.internal:3001'
        };

        log(`Activating bot ${instance.id} in container ${containerName}`);

        const child = spawn('docker', ['exec', '-i', containerName, 'bash', '-c', cliCommand], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: env
        });

        if (messageContent) {
            child.stdin.write(messageContent);
            child.stdin.end();
        }

        return new Promise((resolve, reject) => {
            if (!this.openPromises.has(instance.id)) {
                this.openPromises.set(instance.id, new Map());
            }
            this.openPromises.get(instance.id)!.set(eventTimestamp, {
                resolver: { resolve, reject },
                logs: [],
                eventInfo: {
                    id: eventTimestamp,
                    source: 'discord',
                    content: messageContent,
                    timestamp: new Date().toISOString()
                }
            });

            child.stdout?.once('data', (data: Buffer) => {
                resolve({
                    type: BotEventType.STDOUT,
                    output: data.toString(),
                    next: this.createNextEventPromise(child, instance.id, eventTimestamp, statusMessage),
                });
            });

            child.stderr?.once('data', (data: Buffer) => {
                resolve({
                    type: BotEventType.STDERR,
                    output: data.toString(),
                    next: this.createNextEventPromise(child, instance.id, eventTimestamp, statusMessage),
                });
            });

            child.once('close', (code: number) => {
                this.openPromises.get(instance.id)?.delete(eventTimestamp);
                resolve({
                    type: BotEventType.CLOSE,
                    output: `Process exited with code ${code}`,
                });
            });

            child.once('error', (err: Error) => {
                this.openPromises.get(instance.id)?.delete(eventTimestamp);
                reject(err);
            });
        });
    }
}

export default new DockerManager();