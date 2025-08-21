import { spawn } from 'child_process';
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
import { IChildProcess, IDocker, RunOptions,ExecOptions,ExecResult } from './utils/idocker';
import { LocalDocker } from './utils/localdocker';
import { WSDocker } from './utils/wsdocker';
import configmanager from './configmanager';

dotenv.config();

type PromiseResolver = {
    resolve: (output: BotOutput) => void;
    reject: (reason?: any) => void;
};

export type StoredPromise = {
    resolver: PromiseResolver;
    logs: BotOutput[];
    eventInfo: BotEvent;
    child: IChildProcess;
    
};



class DockerManager {
    private openPromises: Map<string, Map<string, StoredPromise>> = new Map();
    private activationQueue: Map<string, Promise<BotOutput>> = new Map();
    private docker: IDocker;

    constructor(docker: IDocker) {
        this.docker = docker;
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
            const result = await this.docker.ps();
            for (const container of result.containers) {
                containerMap.set(container.name, container.image);
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
                    const containerInfo = await this.docker.inspect(containerName);
                    const platformLine = containerInfo.config.env['LLMPROVIDER'];
                    if (platformLine) currentPlatform = platformLine;
                } catch { /* ignore */ }
                
                let expectedPlatform = configmanager.getProviderForModel(instance.model);                
   

                if (forceRegenerate || runningImage !== expectedImage || currentPlatform !== expectedPlatform) {
                    if (forceRegenerate) {
                        log(`Force-regenerating container ${containerName}.`);
                    } else {
                        log(`Container ${containerName} needs recreation (image=${runningImage}, platform=${currentPlatform} → expected=${expectedImage}, platform=${expectedPlatform}).`);
                    }
                    await this.docker.rm(containerName, true);
                    templateManager.applyTemplates(instance);
                    await this.startBotContainer(instance);
                } else {
                    log(`Container ${containerName} is correctly configured.`);
                    templateManager.applyTemplates(instance);
                }
            }
        }
    }


    private async startBotContainer(instance: Bot) {        
        const imageName = instance.cli === 'gemini' ? 'gemini-docker' : 'claude-docker';
        const containerName = `zulu-instance-${instance.id}`;
        
        //We used to create VOLUMES here, but now FILES
        //const volumePath = path.resolve(__dirname, `../bot-instances/${instance.id}`);
        //But  some things are missing like .events / .logs
        //We really need WORKFLOWS to take the place so we can have a run based workflow that sets things up for each bot role.
        
        //FIXME: Do we really need to provide this to runOptions, or can we just provide to exec() which might be more secure?
        const runOptions: RunOptions = {
            //volumes: { [`${volumePath}`]: '/workspace' },
            env: instance.env //This might not needed anymore because exec passes it, but i think we use it to verify the container //{ LLMPROVIDER: provider } 
        };
        

        try {
            await this.docker.run(containerName, imageName, runOptions);
            log(`Container ${containerName} started successfully.`);
        } catch (error) {
            log(`Error starting container ${containerName}:`, error);
        }
    }    

    private async _ensureContainerIsRunning(instance: Bot): Promise<void> {
        const containerName = `zulu-instance-${instance.id}`;
        try {
            await this.docker.inspect(containerName);
            log(`Container ${containerName} is already running.`);
        } catch (error) {
            log(`Container ${containerName} is not running or not found. Attempting to restart...`);
            templateManager.applyTemplates(instance);
            await this.startBotContainer(instance);
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

    private createNextEventPromise(child: IChildProcess, instanceId: string, eventId: string, statusMessage?: Message): Promise<BotOutput> {
        return new Promise((resolve, reject) => {
            const storedPromise = this.openPromises.get(instanceId)?.get(eventId);
            if (storedPromise) {
                storedPromise.resolver = { resolve, reject };
            }

            let fullResponse = '';
            const stdoutListener = (data: Buffer) => {
                console.log("[NEXT-STDOUT]:"+data);
                const output = data.toString();
                fullResponse += output;
                //if (statusMessage) {
                //    sendChunkedMessage(statusMessage, fullResponse);
                //}
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

        const env = instance.env; // { [key: string]: string } = { /*EVENT_ID: event.id,*/ INSTANCE_ID: instance.id, API_URL: getApiUrl() };


        try {
            const exists = await this.docker.fsExists(containerName, `${projectPath}/.git`);
            if (exists) {
                log(`Project ${project.name} already exists for instance ${instance.id}.`);
                return; // .git directory exists, so we skip cloning
            }
        } catch (error) {
            // If fsExists throws, it means the container might not be running or other issues.
            // We'll log and proceed with cloning, assuming it doesn't exist or needs recreation.
            log(`Error checking for existing project ${project.name} in container ${containerName}:`, error);
        }

        log(`Cloning project ${project.name} for instance ${instance.id}`);

        const gitKeys = configManager.getGitKeys();
        const key = gitKeys.find((k: any) => k.id === project.gitKeyId);
        if (!key) {
            log(`Git key not found for project ${project.name}`);
            return;
        }

        let gitExecOptions:ExecOptions = {
            user: 'git',
            env: env,
            cwd: '/workspace',
            stdin: true
        }                   
        gitExecOptions.files = {};
        gitExecOptions.files['~/.ssh/'+key.id] = key.privateKey; //provide to server

        const keyPath = `~/.ssh/${key.id}`;
        const sshCommand = `ssh -i ${keyPath} -o StrictHostKeyChecking=no`;
        const repoUrl = project.repositoryUrl.replace('https://github.com/', 'git@github.com:');

        // Using a heredoc for the shell script to be executed in the container
        const cloneScript = `
set -e && GIT_SSH_COMMAND="${sshCommand}" git clone ${repoUrl} ${projectPath}
`;

        const command = `${cloneScript.replace(/"/g, '\"')}`;
        log(`Running clone command: docker exec -i ${containerName} ${command}`);

        try {
            const { stdout, stderr } = await this.docker.exec(containerName, command, gitExecOptions);
            log(`Clone stdout: ${stdout}`);
            if (stderr) log(`Clone stderr: ${stderr}`);
            log(`Project ${project.name} cloned successfully into ${containerName}:${projectPath}.`);
        } catch (error) {
            log(`Error cloning project ${project.name} into ${containerName}:`, error);
        }
    }

    private async _runActivation(instance: Bot, event: BotEvent, statusMessage?: Message): Promise<BotOutput> {
        const env:Record<string,string> = {}; 
        Object.assign(env,instance.env);
        env.EVENT_ID = event.id; 

        let gitExecOptions:ExecOptions = {
            user: 'git',
            env: env,
            cwd: '/workspace',
            stdin: true,
        }
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
                        await this.docker.exec(containerName, `bash -c "test -d ${projectPath} || exit 1"`,gitExecOptions);
                        
                        // Create branch if it doesn't exist, then checkout
                        const branchScript = `
set -e
cd ${projectPath}
# Try to fetch from origin, but don't fail if it fails
git fetch origin 2>/dev/null || true
if git show-ref --verify --quiet refs/heads/${event.branch}; then
    git checkout ${event.branch}
elif git ls-remote --heads origin ${event.branch} 2>/dev/null | grep -q ${event.branch}; then
    # Branch exists on remote, create local tracking branch
    git checkout -b ${event.branch} origin/${event.branch}
else
    # Branch doesn't exist locally or remotely, create new branch
    git checkout -b ${event.branch}
fi
`;
                        await this.docker.exec(containerName, `bash -c "${branchScript}"`);
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

        let provider = configManager.getProviderForModel(modelFlag);


        let cliCommand: string;
        if (instance.cli === 'gemini') {
            if (provider === 'moonshot') {
                cliCommand = `cd /workspace && gemini --autosave --resume --yolo --model "${modelFlag}"`;
            } else {
                // openrouter
                const preset = instance.preset === 'auto' ? '' : `@preset/${instance.preset}`;
                cliCommand = `cd /workspace && gemini --autosave --resume --yolo --model "${modelFlag}${preset}"a --flashmodel "nousresearch/deephermes-3-mistral-24b-preview"`;
            }
        } else {
            cliCommand = `cd /workspace && claude --dangerously-skip-permissions --continue --model ${instance.model}`;
        }

        const execOptions: ExecOptions = {
            user: 'exec',
            env: env,
            cwd: '/workspace',
            stdin: true,
            files: instance.files
        };
        //log(`About to activate bot ${instance.id} with files: ${Object.entries(instance.files)}`);
        log(`Activating bot ${instance.id} in container ${containerName} with command: ${cliCommand}`);
        const child = await this.docker.spawnExec(containerName, cliCommand, execOptions, messageContent);

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


           const cleanup = () => {
                child.removeListener('close', closeListener);
                child.removeListener('error', errorListener);
                child.stdout?.removeListener('data', stdoutListener);
                child.stderr?.removeListener('data', stderrListener);
            };

            const closeListener = (code: number) => {
                cleanup();
                log("[CLOSE]:"+code);
                this.openPromises.get(instance.id)?.delete(event.id);
                resolve({
                    type: BotEventType.CLOSE,
                    output: `Process exited with code ${code}`,
                });
            };
            const errorListener = (err: Error) => {
                cleanup();
                log("[ERROR]:"+err);
                this.openPromises.get(instance.id)?.delete(event.id);
                reject(err);
            };
            const stdoutListener = (data: Buffer) => {
                console.log("[STDOUT]:"+data);
                //Remove the close/error event handlers since createNextEventPromise will handle it from here on out.
                cleanup();
                resolve({
                    type: BotEventType.STDOUT,
                    output: data.toString(),
                    next: this.createNextEventPromise(child, instance.id, event.id, statusMessage),
                });
            }
            const stderrListener = (data: Buffer) => {
                console.log("[STDERR]:"+data);
                cleanup();
                resolve({
                    type: BotEventType.STDERR,
                    output: data.toString(),
                    next: this.createNextEventPromise(child, instance.id, event.id, statusMessage),
                });
            }

        

            child.once('close', closeListener);
            child.once('error', errorListener);        
            child.stdout?.once('data', stdoutListener);
            child.stderr?.once('data', stderrListener);

        });
    }

    public async activateBot(instance: Bot, event: BotEvent, statusMessage?: Message): Promise<BotOutput> {
        await this._ensureContainerIsRunning(instance);
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

export default new DockerManager(new WSDocker());