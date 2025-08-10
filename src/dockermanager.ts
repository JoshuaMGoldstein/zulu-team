import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { log } from './utils/log';
import * as dotenv from 'dotenv';
import { Bot, BotOutput, BotEvent, BotEventType, BotSettings, Project, DelegationBotEvent, DiscordBotEvent } from './bots/types';
import { GeminiToolCall } from './bots/gemini';
import { Message } from 'discord.js';
import { sendChunkedMessage } from './utils/discord';
import templateManager from './templatemanager';
import configManager from './configmanager';
import { getApiUrl } from './utils/api';

dotenv.config();

const execAsync = promisify(exec);

type PromiseResolver = {
    resolve: (output: BotOutput) => void;
    reject: (reason?: any) => void;
};

export type StoredPromise = {
    resolver: PromiseResolver;
    logs: BotOutput[];
    eventInfo: BotEvent;
    child: ChildProcess;
};

class DockerManager {
    private openPromises: Map<string, Map<string, StoredPromise>> = new Map();

    constructor() {
    }

    public getOpenEventByInstanceAndEventId(instanceId:string, eventId:string):BotEvent|undefined {
        const instancePromises = this.openPromises.get(instanceId);
        if (instancePromises && instancePromises.has(eventId)) {
            let openPromise = instancePromises.get(eventId);            
            if(openPromise) {
                return openPromise.eventInfo;
            } else {
                return undefined;
            }
        } else {
            return undefined;
        }
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
        log('Initializing and verifying bot containers...');
        const runningContainers = await this.getRunningContainers();

        // Check force-regenerate flag
        const settingsPath = path.resolve(__dirname, '../settings.json');
        let forceRegenerate = false;
        if (fs.existsSync(settingsPath)) {
            try {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
                forceRegenerate = !!settings.forceregenerateinstances;
                if (forceRegenerate) {
                    // consume the flag
                    delete settings.forceregenerateinstances;
                    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
                    log('Force-regenerate flag detected; all containers will be recreated.');
                }
            } catch { /* ignore */ }
        }

        const instancesToInit = instanceIds
            ? configManager.getInstances().filter(inst => instanceIds.includes(inst.id))
            : configManager.getInstances();

        for (const instance of instancesToInit) {
            if (instance.enabled) {
                const containerName = `zulu-instance-${instance.id}`;
                const expectedImage = instance.cli === 'gemini' ? 'gemini-docker' : 'claude-docker';

                // Prepare SSH key
                const sshDir = path.join(__dirname, `../bot-instances/${instance.id}/.ssh`);
                if (!fs.existsSync(sshDir)) {
                    fs.mkdirSync(sshDir, { recursive: true });
                }

                const runningImage = runningContainers.get(containerName);
        // Check current platform env
        let currentPlatform = 'unknown';
        try {
            const { stdout } = await execAsync(`docker inspect --format='{{range .Config.Env}}{{println .}}{{end}}' ${containerName}`);
            const envLines = stdout.split('\n');
            const platformLine = envLines.find(l => l.startsWith('LLMPROVIDER='));
            if (platformLine) currentPlatform = platformLine.split('=')[1];
        } catch { /* ignore */ }

        const modelsPath = path.resolve(__dirname, '../models.json');
        let expectedPlatform = 'moonshot';
        let modelFlag = instance.model === 'auto' ? 'kimi-k2-turbo-preview' : instance.model;
        if (fs.existsSync(modelsPath)) {
            const models = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'));
            const allModels = [...models.toolmodels, ...models.flashmodels];
            const found = allModels.find((m: any) => m.id === modelFlag);
            if (found) expectedPlatform = found.provider;
        }

        if (forceRegenerate || runningImage !== expectedImage || currentPlatform !== expectedPlatform) {
            if (forceRegenerate) {
                log(`Force-regenerating container ${containerName}.`);
            } else {
                log(`Container ${containerName} needs recreation (image=${runningImage}, platform=${currentPlatform} → expected=${expectedImage}, platform=${expectedPlatform}).`);
            }
            await this.stopAndRemoveContainer(containerName);
            await this.startBotContainer(instance);
        } else {
            log(`Container ${containerName} is correctly configured.`);
        }
                templateManager.applyTemplates(instance);
            }
        }
    }

    private async startBotContainer(instance: Bot) {
        const imageName = instance.cli === 'gemini' ? 'gemini-docker' : 'claude-docker';
        const containerName = `zulu-instance-${instance.id}`;
        const volumePath = path.resolve(__dirname, `../bot-instances/${instance.id}`);
        
        // Build environment variables based on provider
        const modelsPath = path.resolve(__dirname, '../models.json');
        let provider = 'moonshot'; // default
        let modelFlag = instance.model === 'auto' ? 'kimi-k2-turbo-preview' : instance.model;
        if (fs.existsSync(modelsPath)) {
            const models = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'));
            const allModels = [...models.toolmodels, ...models.flashmodels];
            const found = allModels.find((m: any) => m.id === modelFlag);
            if (found) provider = found.provider;
        }

        let envVars = `-e LLMPROVIDER=${provider}`;
        if (instance.cli === 'gemini') {
            envVars += ` -e GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`;
            if (provider === 'moonshot') {
                envVars += ` -e OPENAI_API_KEY=${process.env.MOONSHOT_API_KEY} -e OPENAI_BASE_URL=${process.env.MOONSHOT_BASE_URL || ''}`;
            } else if (provider === 'openrouter') {
                envVars += ` -e OPENAI_API_KEY=${process.env.OPENAI_API_KEY} -e OPENAI_BASE_URL=${process.env.OPENAI_BASE_URL || ''}`;
            }
        }

        const sshDir = path.join(__dirname, `../bot-instances/${instance.id}/.ssh`);
        let volumeMounts = `-v "${volumePath}:/workspace"`;
        if (fs.existsSync(path.join(sshDir, 'id_ed25519'))) {
            // Ensure the directory itself is 700 and key 600 on host before mounting
            fs.chmodSync(sshDir, 0o700);
            fs.chmodSync(path.join(sshDir, 'id_ed25519'), 0o600);
            volumeMounts += ` -v "${sshDir}:/home/gemini-user/.ssh:ro"`;
        }
        let command = `docker run -d --name ${containerName} ${volumeMounts} --network=host ${envVars} ${imageName} sleep infinity`;

        const role = configManager.getRoles()[instance.role];
        if (role && role.mountBotInstances) {
            const botInstancesPath = path.resolve(__dirname, '../bot-instances');
            command = `docker run -d --name ${containerName} ${volumeMounts} -v "${volumePath}:/workspace" -v "${botInstancesPath}:/workspace/bot-instances:ro" --network=host ${envVars} ${imageName} sleep infinity`;
        }

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

    public handleToolCall(instanceId: string, eventId: string, toolCallData: GeminiToolCall) {
        const instancePromises = this.openPromises.get(instanceId);
        if (instancePromises && instancePromises.has(eventId)) {
            const storedPromise = instancePromises.get(eventId);
            if (storedPromise) {
                storedPromise.resolver.resolve({
                    type: BotEventType.TOOLCALL,
                    output: toolCallData,
                    next: this.createNextEventPromise(storedPromise.child, instanceId, eventId),
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
//                if (statusMessage) {
//                    sendChunkedMessage(statusMessage, fullResponse);
//                }
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

    public async cloneProject(instance: Bot, project: Project) {
        const containerName = `zulu-instance-${instance.id}`;
        const projectPath = `/workspace/${project.name}`;
        const gitCheckCommand = `docker exec ${containerName} [ -d "${projectPath}/.git" ]`;

        try {
            await execAsync(gitCheckCommand);
            log(`Project ${project.name} already exists for instance ${instance.id}.`);
            return; // .git directory exists, so we skip cloning
        } catch (error) {
            // .git directory does not exist, proceed with cloning
            log(`Cloning project ${project.name} for instance ${instance.id}`);
        }

        const gitKeys = configManager.getGitKeys();
        const key = gitKeys.find((k: any) => k.id === project.gitKeyId);
        if (!key) {
            log(`Git key not found for project ${project.name}`);
            return;
        }

        // Decode base64 private key if encoded
        let privateKeyContent = key.privateKey;
        const sshDir = path.join(__dirname, `../bot-instances/${instance.id}/.ssh`);        
        if (key.encoding === 'base64') {
            console.log("Writing key to "+path.join(sshDir, key.id));
            privateKeyContent = Buffer.from(key.privateKey, 'base64').toString('utf-8');
            fs.writeFileSync(path.join(sshDir, key.id), privateKeyContent, { mode: 0o600 });
        }
                      
//mkdir -p /workspace/.ssh
//echo '${privateKeyContent.replace(/'/g, "'\"'\"'")}' > ${keyPath}
//chmod 600 ${keyPath}


        const keyPath = `/workspace/.ssh/${key.id}`;
        const sshCommand = `ssh -i ${keyPath} -o StrictHostKeyChecking=no`;
        const repoUrl = project.repositoryUrl.replace('https://github.com/', 'git@github.com:');

        // Using a heredoc for the shell script to be executed in the container
        const cloneScript = `
set -e && GIT_SSH_COMMAND="${sshCommand}" git clone ${repoUrl} ${projectPath}
`;

        const command = `docker exec -i ${containerName} bash -c '${cloneScript.replace(/"/g, '\"')}'`;
        log(`Running clone command: ${command}`);

        try {
            const { stdout, stderr } = await execAsync(command);
            log(`Clone stdout: ${stdout}`);
            if (stderr) log(`Clone stderr: ${stderr}`);
            log(`Project ${project.name} cloned successfully into ${containerName}:${projectPath}.`);
        } catch (error) {
            log(`Error cloning project ${project.name} into ${containerName}:`, error);
        }
    }

    private activationQueue: Map<string, Promise<BotOutput>> = new Map();

    private async _runActivation(instance: Bot, event: BotEvent, statusMessage?: Message): Promise<BotOutput> {
        // Existing activation logic (cloning and container exec)
        if (event instanceof DelegationBotEvent) {
            const project = configManager.getProjects().find(p => p.name === event.project);
            if (project) {
                await this.cloneProject(instance, project);
                // Checkout specified branch if provided
                if (event.branch) {
                    const containerName = `zulu-instance-${instance.id}`;
                    const projectPath = `/workspace/${project.name}`;
                    try {
                        // Ensure project directory exists before checkout
                        await execAsync(`docker exec ${containerName} bash -c "test -d ${projectPath} || exit 1"`);
                        await execAsync(`docker exec ${containerName} git -C ${projectPath} checkout ${event.branch}`);
                        log(`Checked out branch ${event.branch} for project ${project.name}`);
                    } catch (err) {
                        log(`Failed to checkout branch ${event.branch} for project ${project.name}:`, err);
                    }
                }
            }
        } else if (event instanceof DiscordBotEvent) {
            const commsEvent = event as DiscordBotEvent;
            for (let p = 0; p < commsEvent.channelProjects.length; p++) {
                const projectName = commsEvent.channelProjects[p];
                const project = configManager.getProjects().find(p => p.name === projectName);
                if (project) {
                    await this.cloneProject(instance, project);
                }
            }
        }

        const messageContent = JSON.stringify(event.getSummary());
        const containerName = `zulu-instance-${instance.id}`;
        // Determine model and flags
        let modelFlag = '';
        let flashFlag = '';

        if (instance.model === 'auto') {
            modelFlag = 'kimi-k2-turbo-preview'; // default Moonshot model
        } else {
            modelFlag = instance.model;
        }

        // Resolve provider from models.json (assume moonshot if not found)
        const modelsPath = path.resolve(__dirname, '../models.json');
        let provider = 'moonshot';
        if (fs.existsSync(modelsPath)) {
            const models = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'));
            const allModels = [...models.toolmodels, ...models.flashmodels];
            const found = allModels.find((m: any) => m.id === modelFlag);
            if (found) provider = found.provider;
        }

        let cliCommand: string;
        if (instance.cli === 'gemini') {
            if (provider === 'moonshot') {
                cliCommand = `cd /workspace && gemini --autosave --resume --yolo --model "${modelFlag}"`;
            } else {
                // openrouter
                const preset = instance.preset === 'auto' ? '' : `@preset/${instance.preset}`;
                cliCommand = `cd /workspace && gemini --autosave --resume --yolo --model "${modelFlag}${preset}" --flashmodel "nousresearch/deephermes-3-mistral-24b-preview"`;
            }
        } else {
            cliCommand = `cd /workspace && claude --dangerously-skip-permissions --continue --model ${instance.model}`;
        }
        const env: { [key: string]: string } = {
            EVENT_ID: event.id,
            INSTANCE_ID: instance.id,
            API_URL: getApiUrl()
        };
        const spawnArgs = ['exec', '-i'];
        for (const key in env) {
            spawnArgs.push('-e', `${key}=${env[key]}`);
        }
        spawnArgs.push(containerName, 'bash', '-c', cliCommand);
        const fullCmd = `docker ${spawnArgs.join(' ')}`;
        log(`Activating bot ${instance.id} in container ${containerName} with command: ${fullCmd}`);
        const child = spawn('docker', spawnArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
        if (messageContent) {
            child.stdin.write(messageContent);
            child.stdin.end();
        }
        return new Promise((resolve, reject) => {
            if (!this.openPromises.has(instance.id)) {
                this.openPromises.set(instance.id, new Map());
            }
            this.openPromises.get(instance.id)!.set(event.id, {
                resolver: { resolve, reject },
                logs: [],
                eventInfo: event,
                child: child
            });
            child.stdout?.once('data', (data: Buffer) => {
                resolve({
                    type: BotEventType.STDOUT,
                    output: data.toString(),
                    next: this.createNextEventPromise(child, instance.id, event.id, statusMessage),
                });
            });
            // child.stderr?.once('data', (data: Buffer) => {
            //     resolve({
            //         type: BotEventType.STDERR,
            //         output: data.toString(),
            //         next: this.createNextEventPromise(child, instance.id, event.id, statusMessage),
            //     });
            // });
            child.once('close', (code: number) => {
                this.openPromises.get(instance.id)?.delete(event.id);
                resolve({
                    type: BotEventType.CLOSE,
                    output: `Process exited with code ${code}`,
                });
            });
            child.once('error', (err: Error) => {
                this.openPromises.get(instance.id)?.delete(event.id);
                reject(err);
            });
        });
    }

    public async activateBot(instance: Bot, event: BotEvent, statusMessage?: Message): Promise<BotOutput> {
        // Queue handling: ensure only one activation per bot at a time
        const previous = this.activationQueue.get(instance.id) || Promise.resolve();
        const queued = previous.then(() => this._runActivation(instance, event, statusMessage));
        // Clean up the queue entry after this activation finishes
        queued.finally(() => {
            if (this.activationQueue.get(instance.id) === queued) {
                this.activationQueue.delete(instance.id);
            }
        });
        this.activationQueue.set(instance.id, queued);
        return queued;
    }
}

export default new DockerManager();