import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { log } from './utils/log';
import * as dotenv from 'dotenv';
import { Message } from 'discord.js';

dotenv.config();

const execAsync = promisify(exec);

class DockerManager {
    private instances: any[];
    private instancesPath: string;

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

    public activateBot(instance: any, messageContent?: string, eventId?: string, statusMessage?: Message) {
        const eventTimestamp = eventId || new Date().toISOString();
        const eventsDir = path.join(__dirname, `../bot-instances/${instance.id}/.${instance.cli}-events`);
        if (!fs.existsSync(eventsDir)) {
            fs.mkdirSync(eventsDir, { recursive: true });
        }

        const eventFileName = `${eventTimestamp}.json`;
        const eventFilePath = path.join(eventsDir, eventFileName);

        const eventData = {
            id: eventTimestamp,
            source: 'discord', // Or other source
            content: messageContent,
            timestamp: new Date().toISOString()
        };
        fs.writeFileSync(eventFilePath, JSON.stringify(eventData, null, 2));

        const containerName = `zulu-instance-${instance.id}`;
        let cliCommand: string;

        if (instance.cli === 'gemini') {
            cliCommand = 'gemini --autosave --resume --yolo';
        } else { // claude
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

        let fullResponse = '';
        child.stdout.on('data', (data) => {
            const output = data.toString();
            fullResponse += output;
            log(`[${instance.id}] stdout: ${output}`);
            if (statusMessage) {
                // This is a simplified version. A more robust implementation would
                // use a proper function to handle chunking and editing.
                statusMessage.edit(fullResponse.slice(0, 2000));
            }
        });

        child.stderr.on('data', (data) => {
            log(`[${instance.id}] stderr: ${data}`);
        });

        child.on('close', (code) => {
            log(`[${instance.id}] child process exited with code ${code}`);
        });
    }
}

export default new DockerManager();
