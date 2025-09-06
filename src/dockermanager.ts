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
import workflowManager from './workflowmanager';

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

    public getOpenPromise(instanceId:string,eventId:string):StoredPromise|undefined {
        const storedPromise = this.openPromises.get(instanceId)?.get(eventId);
        return storedPromise;
    }

    public getDocker(): IDocker {
        return this.docker;
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


    private async startBotContainer(instance: Bot) {        
        const imageName = instance.cli === 'gemini' ? 'gemini-docker' : 'claude-docker';
        const containerName = this.getContainerName(instance);
                
        const runOptions: RunOptions = {
            files: { ...instance.files },
            env: instance.env,
            volumes: {},
            privileged: false,
        }; 
        
        try {
            await this.docker.run(containerName, imageName, runOptions);
            log(`Container ${containerName} started successfully.`);
        } catch (error) {
            log(`Error starting container ${containerName}:`, error);
        }

        try {
            const contexts = await workflowManager.buildGCSFuseContexts(this.docker, containerName, instance);
            for(var context of contexts) {
                await workflowManager.executeWorkflow('mount-gcs', context);
            }
            log(`Container: ${containerName}  GCSFuse Mount Setup Complete.`);
        } catch (error) {
            log(`Container: ${containerName} - Error during GCSFuse Mount Setup `, error);            
        }
    }

    private getContainerName(instance:Bot) {
        return  `${instance.account_id}-zulu-instance-${instance.id}`;
    }

    private async _ensureContainerIsRunning(instance: Bot): Promise<void> {
        const containerName = this.getContainerName(instance);
        try {
            await this.docker.inspect(containerName);
            log(`Container ${containerName} is already running.`);

            //FIXME: Validate parameters?
        } catch (error) {
            log(`Container ${containerName} is not running or not found. Attempting to restart...`);
            //templateManager.applyTemplates(instance);
            await this.startBotContainer(instance);
        }
    }

    public handleToolCall(instanceId: string, eventId: string, toolCallData: GeminiToolCall) {
        const storedPromise = this.getOpenPromise(instanceId, eventId);    
        if(!storedPromise) return;        
                
        const openEvent:BotEvent|undefined = storedPromise.eventInfo;
        storedPromise.resolver.resolve({
            type: BotEventType.TOOLCALL,
            output: toolCallData,
            next: this.createNextEventPromise(storedPromise.child, instanceId, openEvent.id),
        });

    }

    private createNextEventPromise(child: IChildProcess, instanceId:string, eventId: string, statusMessage?: Message): Promise<BotOutput> {
        return new Promise((resolve, reject) => {
            const storedPromise = this.openPromises.get(instanceId)?.get(eventId);
            if (storedPromise) {
                storedPromise.resolver = { resolve, reject };
            }

            this.createEventListeners(child, instanceId, eventId, resolve, reject, statusMessage);            
        });
    }

    public async cloneProject(instance: Bot, project: Project) {
        const containerName = this.getContainerName(instance);
        const projectPath = `/workspace/${project.name}`;

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

        try {
            const context = await workflowManager.buildGitContext(this.docker, containerName, project);
            await workflowManager.executeWorkflow('clone-project', context);
            log(`Project ${project.name} cloned successfully into ${containerName}:${projectPath}.`);
        } catch (error) {
            log(`Error cloning project ${project.name} into ${containerName}:`, error);
        }
    }

    private async doGitLogic(instance:Bot, event:BotEvent) {
        
    }

    private async _runActivation(instance: Bot, event: BotEvent, statusMessage?: Message): Promise<BotOutput> {
        if(event.account_id != instance.account_id) {
            throw new Error(`_runActivation instance.account_id ${instance.account_id} != event.account_id ${event.account_id}`);
        }


        const env:Record<string,string> = {}; 
        Object.assign(env,instance.env);
        env.EVENT_ID = event.id; 

        // Existing activation logic (cloning and container exec)
        if (event instanceof DelegationBotEvent) {
            const project = (await configManager.getProjects(instance.account_id)).find(p => p.name === event.project);
            if (project) {
                await this.cloneProject(instance, project);
                // Checkout specified branch if provided
                if (event.branch) {
                    const containerName = this.getContainerName(instance);
                    try {
                        const context = await workflowManager.buildGitContext(this.docker, containerName, project, event.branch);
                        await workflowManager.executeWorkflow('set-branch', context);
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
                const project = (await configManager.getProjects(instance.account_id)).find(p => p.name === projectName);
                if (project) {
                    await this.cloneProject(instance, project);
                }
            }
        }

        const messageContent = JSON.stringify(event.getSummary());
        const containerName = this.getContainerName(instance);
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
                cliCommand = `cd /workspace && gemini --autosave --resume --yolo --model "${modelFlag}${preset}" --flashmodel "nousresearch/deephermes-3-mistral-24b-preview"`;
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
            
            this.createEventListeners(child, instance.id, event.id, resolve, reject, statusMessage);
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

    public async runGitWorkflow(workflowName:string, fromInstance:Bot, project:Project, branch?:string, commit_hash?:string):Promise<boolean> {
        let containerName = this.getContainerName(fromInstance);
        try {
            let context = await workflowManager.buildGitContext(this.docker,containerName, project, branch, commit_hash);
            await workflowManager.executeWorkflow(workflowName, context);
            return true;
        } catch(e) {
            return false;
        }
        
    }

    private createEventListeners(child:IChildProcess, instanceId:string, eventId:string, resolve:(value: BotOutput | PromiseLike<BotOutput>) => void, reject:(reason?:any)=>void, statusMessage?: Message) {
        const cleanup = () => {
            child.removeListener('close', closeListener);
            child.removeListener('error', errorListener);
            child.stdout?.removeListener('data', stdoutListener);
            child.stderr?.removeListener('data', stderrListener);
        };

        const closeListener = (code: number) => {
            cleanup();
            log("[CLOSE]:"+code);
            this.openPromises.get(instanceId)?.delete(eventId);
            resolve({
                type: BotEventType.CLOSE,
                output: `Process exited with code ${code}`,
            });
        };
        const errorListener = (err: Error) => {
            cleanup();
            log("[ERROR]:"+err);
            this.openPromises.get(instanceId)?.delete(eventId);
            reject(err);
        };
        const stdoutListener = (data: Buffer) => {
            cleanup();
            resolve({
                type: BotEventType.STDOUT,
                output: data.toString(),
                next: this.createNextEventPromise(child, instanceId, eventId, statusMessage),
            });
        }
        const stderrListener = (data: Buffer) => {
            console.log("[STDERR]:"+data);
            cleanup();
            resolve({
                type: BotEventType.STDERR,
                output: data.toString(),
                next: this.createNextEventPromise(child, instanceId, eventId, statusMessage),
            });
        }

        child.once('close', closeListener);
        child.once('error', errorListener);        
        child.stdout?.once('data', stdoutListener);
        child.stderr?.once('data', stderrListener);
    }
}

export default new DockerManager(new WSDocker());