import { createServer } from './server';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Bot, BotEventType, BotOutput, CommsEvent, Project, Verbosity, BotSettings } from './bots/types';
import {GeminiToolCall, getGeminiToolCallOutputAndFormat} from './bots/gemini';
import { Client, GatewayIntentBits, Events, Message, Role, ChannelType, TextChannel } from 'discord.js';
import dockerManager from './dockermanager';
import discordManager from './discordmanager'; // Import DiscordManager
import express from 'express';
import { log } from './utils/log';
import { sendChunkedMessage } from './utils/discord';
import { STDERR_FILTERS } from './utils/filters';
import { generateEventId } from './utils/snowflake';
import { parseCodeBlocks } from './utils/parsers';
import configManager from './configmanager';

import {BotEvent,DiscordBotEvent,DelegationBotEvent} from './bots/types';
import dockermanager from './dockermanager';

const MAX_ATTEMPTS = 5;


class ApiServer {
    private app: express.Application;

    constructor() {
        this.app = createServer();
        this.app.use(express.json());
        this.app.use(this.authenticateToken.bind(this));
        this.setupRoutes();
    }
    static GetAccountId(req:express.Request):string {
        return (req as any).account_id;
    }

    private async authenticateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
        // Allow unauthenticated access to /bots (GET) as it's for listing available bots
        if (req.path === '/bots' && req.method === 'GET') {
            return next();
        }

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).send('Access Denied: No Token Provided!');
        }

        // Check against master API token
        if (token === process.env.API_TOKEN) {
            (req as any).account_id = 'originalEvent.account_id';
            return next();
        }

        // Check against instance-specific API token
        const instanceId = req.header('X-Instance-Id');
        const account_id = token.split('|')[0];
        if(!account_id) return;

        if (instanceId) {
            const instance = (await configManager.getInstances(account_id)).find(inst => inst.id === instanceId);
            if (instance && instance.env && instance.env['API_KEY'] === token) {
                (req as any).account_id = account_id;
                return next();
            }
        }

        log("Bad authentication received!")
        return res.status(403).send('Access Denied: Invalid Token!');
    }

    //public initBots(instanceIds?: string[]) {
        //dockerManager.initBots(instanceIds); //I dont think this shoulkd be done, its supposed to happen ON DEMAND.
        //discordManager.initBots(instanceIds);
    //}

    private async createEventFile(instance: Bot, event: BotEvent) {
        const account = await configManager.getAccount(instance.account_id);
        if (account?.defaultBucketId) {
            const bucket = account.buckets.find(b => b.id === account.defaultBucketId);
            if (bucket) {
                const gcsPath = `gs://${bucket.bucket_name}/.events/${event.id}.json`;
                const tempFilePath = `/tmp/${event.id}.json`;
                fs.writeFileSync(tempFilePath, JSON.stringify(event, null, 2));
                await execAsync(`gsutil cp ${tempFilePath} ${gcsPath}`);
                fs.unlinkSync(tempFilePath);
                log(`Event file uploaded to GCS: ${gcsPath}`);
                return;
            }
        }

        // Fallback to local file system if no default bucket or bucket not found
        const eventsDir = path.join(__dirname, `../bot-instances/${instance.id}/.events`);
        if (!fs.existsSync(eventsDir)) {
            fs.mkdirSync(eventsDir, { recursive: true });
        }
        const eventFilePath = path.join(eventsDir, `${event.id}.json`);
        fs.writeFileSync(eventFilePath, JSON.stringify(event, null, 2));
        log(`Event file created locally: ${eventFilePath}`);
    }

    private async writeLogEntry(instance: Bot, logFilename: string, event: BotOutput) {
        const account = await configManager.getAccount(instance.account_id);
        if (account?.defaultBucketId) {
            const bucket = account.buckets.find(b => b.id === account.defaultBucketId);
            if (bucket) {
                const gcsPath = `gs://${bucket.bucket_name}/.logs/${logFilename}`;
                const logEntry = JSON.stringify(event) + '\n';
                const tempFilePath = `/tmp/${randomUUID()}.jsonl`;
                fs.writeFileSync(tempFilePath, logEntry);
                await execAsync(`gsutil cp ${tempFilePath} ${gcsPath}`);
                fs.unlinkSync(tempFilePath);
                log(`Log entry appended to GCS: ${gcsPath}`);
                return;
            }
        }

        // Fallback to local file system if no default bucket or bucket not found
        const logsDir = path.join(__dirname, `../bot-instances/${instance.id}/.logs`);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        const logStream = fs.createWriteStream(path.join(logsDir, logFilename), { flags: 'a' });
        logStream.write(JSON.stringify(event) + '\n');
        logStream.end();
        log(`Log entry written locally: ${path.join(logsDir, logFilename)}`);
    }

    private async getVerbosity(instance: Bot, event: BotEvent): Promise<Verbosity> {
        const isDelegated = event instanceof DelegationBotEvent;
        const isDm = event instanceof DiscordBotEvent && event.message.channel.type === ChannelType.DM;

        let verbosity: Verbosity;

        if (isDelegated) {
            verbosity = instance.settings?.delegatedVerbosity ?? Verbosity.INHERIT;
            if (verbosity === Verbosity.INHERIT) {
                verbosity = (await configManager.getRoles(instance.account_id))[instance.role]?.delegatedVerbosity ?? Verbosity.INHERIT;
            }
            if (verbosity === Verbosity.INHERIT) {
                verbosity = (await configManager.getSettings(instance.account_id))?.delegatedVerbosity??(Verbosity.NONE);
            }
        } else if (isDm) {
            verbosity = instance.settings?.dmVerbosity ?? Verbosity.INHERIT;
            if (verbosity === Verbosity.INHERIT) {
                verbosity = (await configManager.getRoles(instance.account_id))[instance.role]?.dmVerbosity ?? Verbosity.INHERIT;
            }
            if (verbosity === Verbosity.INHERIT) {
                verbosity = (await configManager.getSettings(instance.account_id))?.dmVerbosity??(Verbosity.STDOUT && Verbosity.TOOLHOOKS);
            }
        } else {
            verbosity = instance.settings?.channelVerbosity ?? Verbosity.INHERIT;
            if (verbosity === Verbosity.INHERIT) {
                verbosity = (await configManager.getRoles(instance.account_id))[instance.role]?.channelVerbosity ?? Verbosity.INHERIT;
            }
            if (verbosity === Verbosity.INHERIT) {
                verbosity = (await configManager.getSettings(instance.account_id))?.channelVerbosity??(Verbosity.STDOUT && Verbosity.TOOLHOOKS);
            }
        }
        return verbosity;
    }

    private async handleDelegatedBotFlow(fromInstance:Bot, targetInstance: Bot, event:DelegationBotEvent) {
        if(targetInstance.id == fromInstance.id) {
            console.error("tried to delegate event from and to same instance id: "+fromInstance.id, event);
            return;
        }
        this.handleBotFlow(targetInstance, event);
    }

    public async handleBotFlow(targetInstance: Bot, event: BotEvent) {
        this.createEventFile(targetInstance, event);        
        log(`Activating bot ${targetInstance.id} for event ${event.id}`);

        let statusMessage:Message|undefined = await discordManager.createStatusMessageIfApplicable(targetInstance, event);    
        const verbosity = await this.getVerbosity(targetInstance, event);

        try {
            let botOutput = await dockerManager.activateBot(targetInstance, event, statusMessage);
            let fullResponse = '';
            const logFilename = `${event.id}.jsonl`;

            while (botOutput) {
                if (!(botOutput.type === BotEventType.STDERR && STDERR_FILTERS.includes(botOutput.output.trim()))) {
                    this.writeLogEntry(targetInstance, logFilename, botOutput);
                }

                if (botOutput.type === BotEventType.STDOUT) {
                    fullResponse += botOutput.output;

                } else if(botOutput.type == BotEventType.TOOLCALL) {
                    if (statusMessage && (verbosity & Verbosity.TOOLHOOKS)) {
                        //Fixme: Support Claude etc
                        let geminiToolCall = botOutput.output as GeminiToolCall;
                        let [toolMsg,toolOutput,toolOutputFormat] = getGeminiToolCallOutputAndFormat(geminiToolCall);
                        
                        if(toolMsg) {
                            await sendChunkedMessage(statusMessage, toolMsg);
                        }
                        if(toolOutput) {
                            //FIXME: Allow viewing of additional hidden lines through a button interface?
                            let maxToolLines = 20;
                            let maxToolChars=1000;
                            if(toolOutput.length > maxToolChars ) {
                                let splitOutput = toolOutput.split('\n');
                                let lines=0;
                                toolOutput='';
                                for(lines=0; lines<splitOutput.length && lines<=maxToolLines; lines++) {                                    
                                    let newToolOutput = toolOutput + splitOutput[lines]+"\n";
                                    if( newToolOutput.length > maxToolChars) break;                                    
                                    toolOutput =newToolOutput;
                                }
                                if(splitOutput.length > lines) {
                                    toolOutput += `...${splitOutput.length-lines} more lines (hidden)`;
                                }
                            }
                            await sendChunkedMessage(statusMessage, toolOutput, toolOutputFormat);
                        }
                    }           
                }

                if (!botOutput.next) {
                    break;
                }
                botOutput = await botOutput.next;
            }

            if (statusMessage && (verbosity & Verbosity.STDOUT)) {
                console.log(targetInstance.id +"> "+fullResponse);
                await sendChunkedMessage(statusMessage, fullResponse);
            }                    
    
            if(event instanceof DelegationBotEvent) {  // Continue the flow
                let delegationBotEvent = event as DelegationBotEvent;
                if(!delegationBotEvent.final) {
                    this.processDelegationBotResponse(targetInstance, event, fullResponse);
                }
            }
        } catch (error) {
            log(`Error processing bot command for event ${event.id}:`, error);
            if (statusMessage) {
                await statusMessage.edit('An error occurred while processing your request.');
            }
        }
    }

    private async processDelegationBotResponse(fromInstance: Bot, originalEvent: DelegationBotEvent, response: string) {        
        console.log("Received response from instance:"+fromInstance.id +": "+response);
        if(originalEvent.account_id!= fromInstance.account_id) {
            throw new Error(`Bad Delegation Response from instance ${fromInstance.account_id} not linked to originalEvent AccountId: ${originalEvent.account_id}`);
        }

        const parsed = parseCodeBlocks(response);
        let responseJson: any;
        try {            
            if (parsed.json && parsed.json.length > 0) {
                responseJson = JSON.parse(parsed.json[0]);
            } else {
                responseJson = { task_status: 'problem', message: 'No JSON response found', notes: response };
            }
        } catch (error) {
            console.log("Failed to parse json response from bot instance: "+fromInstance.id);
            responseJson = { task_status: 'problem', message: 'Invalid JSON response', notes: response };
        }

        const project = (await configManager.getProjects(originalEvent.account_id)).find(p => p.name === originalEvent.project);                
        const delegator = (await configManager.getInstances(originalEvent.account_id)).find(i => i.id === originalEvent.delegator_botid);
        const developer = (await configManager.getInstances(originalEvent.account_id)).find(i => i.id === originalEvent.assignedTo);

    
        
        const nextEvent = new DelegationBotEvent({
            account_id:originalEvent.account_id,
            id: generateEventId(),
            project: originalEvent.project,
            task_description: originalEvent.task_description,
            notes: responseJson.notes??'',
            data: originalEvent.data,
            delegator_botid: originalEvent.delegator_botid,
            assignedTo: originalEvent.assignedTo, //developer.id
            commsEvent: originalEvent.commsEvent,
            attempts: (originalEvent.attempts || 0) + 1,
        });



        // 1. Handle problems
        if (!project || responseJson.task_status === 'problem') {
            if(!project) {
                responseJson.task_status = 'problem';
                responseJson.message = `Project ${originalEvent.project} not found`;
            }

            if (delegator) {
                nextEvent.final=true;
                log(`Task failed for project ${originalEvent.project}. Notifying ${delegator.id}.`);                                
                this.handleDelegatedBotFlow(fromInstance, delegator, nextEvent);
            }
            return;
        } else if (fromInstance.role === 'developer' && (responseJson.task_status === 'complete' || responseJson.task_status === 'progress')) { 
            // 2. Handle QA flow --FIXME: we shouldnt be hardcoding roles at all.
            const qaBot = (await configManager.getInstances(originalEvent.account_id)).find(i => i.role == 'qa' && i.managedProjects.indexOf(project.name)>=0);
            if (qaBot) {
                log(`Developer task complete for ${project.name}. Delegating to QA bot ${qaBot.id}.`);                                
                this.handleDelegatedBotFlow(fromInstance, qaBot, nextEvent);
                return;
            }
        } else if (fromInstance.role === 'qa' && responseJson.task_status === 'failed') { 
            // 3. Handle QA failure (and max attempts)
            const developer = (await configManager.getInstances(originalEvent.account_id)).find(i => i.id === originalEvent.assignedTo);
            if (developer && nextEvent.attempts < MAX_ATTEMPTS) {
                log(`QA failed for ${project.name}. Sending back to developer ${developer.id}.`);
                                
                this.handleDelegatedBotFlow(fromInstance, developer, nextEvent);
            } else if (delegator) {
                log(`QA failed for ${project.name} after max attempts. Notifying ${delegator.id}.`);
                                
                nextEvent.final=true;
                this.handleDelegatedBotFlow(fromInstance, delegator, nextEvent);
            }
            return;
        } else if (delegator && nextEvent.attempts < MAX_ATTEMPTS+1) { 
            // 4. Default: report back to delegator. If MAX_ATTEMPTS +1 exceeded, we might be in a infinite loop
            log(`Task flow complete for project ${project.name}. Notifying ${delegator.id}.`);
            nextEvent.final=true;
            this.handleDelegatedBotFlow(fromInstance, delegator, nextEvent);
        } else {
            console.error(`Error in processDelegationBotResponse, delegator=${delegator?delegator.id:'?'}, attempts=${nextEvent?nextEvent.attempts:'?'}`)
        }
    }



    private setupRoutes() {
        this.app.get('/bots', async (req, res) => {
            const account_id = ApiServer.GetAccountId(req);

            const bots: Bot[] = (await configManager.getInstances(account_id)).map((instance: any) => {
                const settings = instance.settings;
                const md = instance.md;
                return { ...instance, settings, md };
            });
            res.json(bots);
        });

        this.app.post('/hook/:hookType', (req, res) => {
            const instanceId = req.header('X-Instance-Id');
            const eventId = req.header('X-Event-Id');        

            //Fixme: Support both Gemini and Claude tool call format. Maybe a diff endpoint is easiest?        
            const hookData:GeminiToolCall = req.body;            

            if (instanceId && eventId) {
                //log(`Received tool call for ${instanceId} (Event ID: ${eventId})`);                
                if(hookData.toolCall && hookData.toolCall.name && hookData.toolCall.args) {
                    //log(` - tool: ${hookData.toolCall.name} | args: ${JSON.stringify(hookData.toolCall.args)}`);
                }

                dockerManager.handleToolCall(instanceId, eventId, hookData);
                res.status(200).send();
            } else {
                res.status(400).send('Missing X-Instance-Id or X-Event-Id header');
            }
        });

        this.app.post('/log', (req, res) => {
            const instanceId = req.header('X-Instance-Id');
            const eventId = req.header('X-Event-Id');
            const logData = req.body;

            if (instanceId && eventId) {
                log(`Received log from ${instanceId} (Event ID: ${eventId})`, logData);
                res.status(200).send();
            } else {
                res.status(400).send('Missing X-Instance-Id or X-Event-Id header');
            }
        });

        this.app.post('/instance/:instanceId/delegated-task', async (req, res) => {
            const account_id = ApiServer.GetAccountId(req);

            const targetInstanceId = req.params.instanceId;
            const taskData = req.body;
            const delegatorId = req.header('X-Instance-Id');
            const originalEventId = req.header('X-Event-Id');            

            const delegator = (await configManager.getInstances(account_id)).find((inst: any) => inst.id === delegatorId);
            if (!delegator || !(await configManager.getRoles(account_id))[delegator.role]?.allowDelegation) {
                return res.status(403).send('This bot is not authorized to delegate tasks.');
            }

            const targetInstance = (await configManager.getInstances(account_id)).find((inst: any) => inst.id === targetInstanceId);

            if(!originalEventId) {res.status(404).send('No X-Event-Id Header provided'); return; }
            if(!delegatorId) { res.status(404).send('No X-Instance-Id Header provided'); return; }
            if(!taskData.task_description || typeof(taskData.task_description) !== 'string' || 
                !taskData.project || typeof(taskData.project) !== 'string' || 
                !taskData.branch || typeof(taskData.branch) !== 'string') {
                res.status(400).send('Bad task data provided: missing required fields'); return; 
            }
            
            //Find the comms Event specified by X-Event-ID
            //The problem is that the activateBot() on zulu-manager occurs with the X-Event-Id of the delegation event, so its not actually a comms even that he finds...
            let openEvent = dockermanager.getOpenPromise(delegatorId, originalEventId)?.eventInfo;
            let commsEvent = null;
            if(!openEvent) {
                res.status(400).send('Open Event Id not found: '+originalEventId);
                return;
            } else if(openEvent instanceof DelegationBotEvent) {                
                commsEvent = (openEvent as DelegationBotEvent).commsEvent;
            } else if (openEvent instanceof CommsEvent) {
                commsEvent = openEvent;
            }
            if(!commsEvent) {
                res.status(400).send('Comms Event not found: '+originalEventId);
                return;
            }


            if (targetInstance && targetInstance.enabled) {                
                const event:DelegationBotEvent = new DelegationBotEvent(
                    {
                        account_id:targetInstance.account_id,
                        id:generateEventId(),
                        project:taskData.project,
                        task_description: taskData.task_description,
                        branch: taskData.branch,
                        notes: taskData.notes??'',
                        data: taskData.data??null,
                        delegator_botid: delegatorId,
                        assignedTo: targetInstanceId,
                        commsEvent:commsEvent
                    }
                );                
                this.handleBotFlow(targetInstance, event);
                res.status(200).json({ message: 'Task delegated' });
            } else {
                res.status(404).send('Target bot not found or is disabled');
            }
        });
    }

    public listen(port: number, callback?: () => void) {
        this.app.listen(port, callback);
    }
}

export default new ApiServer();
