import { createServer } from './server';
import * as fs from 'fs';
import * as path from 'path';
import { Bot, BotEventType, BotOutput, BotRole, CommsEvent, Project, Verbosity, BotSettings } from './bots/types';
import {GeminiToolCall, getGeminiToolCallOutputAndFormat} from './bots/gemini';
import { Client, GatewayIntentBits, Events, Message, Role, ChannelType, TextChannel } from 'discord.js';
import dockerManager from './dockermanager';
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
    private discordClients: Map<string, Client> = new Map();

    constructor() {
        this.app = createServer();
        this.app.use(express.json());
        this.setupRoutes();
    }

    public initBots(instanceIds?: string[]) {
        dockerManager.initBots(instanceIds);

        const instancesToInit = instanceIds
            ? configManager.getInstances().filter(inst => instanceIds.includes(inst.id))
            : configManager.getInstances();

        instancesToInit.forEach((instance: any) => {
            if (instance.enabled) {
                this.initDiscordBot(instance);
            }
        });
    }

    private createEventFile(instance: Bot, event: BotEvent) {
        const eventsDir = path.join(__dirname, `../bot-instances/${instance.id}/.events`);
        if (!fs.existsSync(eventsDir)) {
            fs.mkdirSync(eventsDir, { recursive: true });
        }
        const eventFilePath = path.join(eventsDir, `${event.id}.json`);
        fs.writeFileSync(eventFilePath, JSON.stringify(event, null, 2));
    }

    private writeLogEntry(instance: Bot, logFilename: string, event: BotOutput) {
        const logsDir = path.join(__dirname, `../bot-instances/${instance.id}/.logs`);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        const logStream = fs.createWriteStream(path.join(logsDir, logFilename), { flags: 'a' });
        logStream.write(JSON.stringify(event) + '\n');
        logStream.end();
    }

    private getVerbosity(instance: Bot, event: BotEvent): Verbosity {
        const isDelegated = event instanceof DelegationBotEvent;
        const isDm = event instanceof DiscordBotEvent && event.message.channel.type === ChannelType.DM;

        let verbosity: Verbosity;

        if (isDelegated) {
            verbosity = instance.settings?.delegatedVerbosity ?? Verbosity.INHERIT;
            if (verbosity === Verbosity.INHERIT) {
                verbosity = configManager.getRoles()[instance.role]?.delegatedVerbosity ?? Verbosity.INHERIT;
            }
            if (verbosity === Verbosity.INHERIT) {
                verbosity = configManager.getSettings().delegatedVerbosity;
            }
        } else if (isDm) {
            verbosity = instance.settings?.dmVerbosity ?? Verbosity.INHERIT;
            if (verbosity === Verbosity.INHERIT) {
                verbosity = configManager.getRoles()[instance.role]?.dmVerbosity ?? Verbosity.INHERIT;
            }
            if (verbosity === Verbosity.INHERIT) {
                verbosity = configManager.getSettings().dmVerbosity;
            }
        } else {
            verbosity = instance.settings?.channelVerbosity ?? Verbosity.INHERIT;
            if (verbosity === Verbosity.INHERIT) {
                verbosity = configManager.getRoles()[instance.role]?.channelVerbosity ?? Verbosity.INHERIT;
            }
            if (verbosity === Verbosity.INHERIT) {
                verbosity = configManager.getSettings().channelVerbosity;
            }
        }
        return verbosity;
    }

    private async createStatusMessageIfApplicable(targetInstance:Bot, event:BotEvent):Promise<Message|undefined> {
        let statusMessage:Message|undefined =undefined;
         
        // //Allow other kinds of comms replies (email, slack), etc
        if(event instanceof DiscordBotEvent) {
            let discordBotEvent = event as DiscordBotEvent;
            statusMessage = await discordBotEvent.message.reply('Processing...');
        } else if(event instanceof DelegationBotEvent) {
            let commsEvent = event.commsEvent;
            if(commsEvent instanceof DiscordBotEvent) {
                let discordCommsEvent = commsEvent as DiscordBotEvent;
                let discordClient = this.discordClients.get(targetInstance.id);
                if(discordClient) {
                    try {
                        const channel = await discordClient.channels.fetch(commsEvent.message.channelId);
                        if(channel) {
                            if(channel instanceof TextChannel) {
                                statusMessage = await ( channel as TextChannel).send('Received Delegation Request - Processing...');
                            } else {
                                console.error('Channel is not a text channel',channel);
                            }
                        } else {
                            console.error('Channel not found:',channel);
                        }
                    } catch(error) {
                        console.error('Error fetching channel or sending status message', error);
                    }
                }
            } else { //TODO: Allow other kinds of comms initialtion (email, slack), etc
                console.error('No originating comms event found for delegation event ', event);
                
            } 
        }
        return statusMessage;
    }

    private async handleDelegatedBotFlow(fromInstance:Bot, targetInstance: Bot, event:DelegationBotEvent) {
        if(targetInstance.id == fromInstance.id) {
            console.error("tried to delegate event from and to same instance id: "+fromInstance.id, event);
            return;
        }
        this.handleBotFlow(targetInstance, event);
    }

    private async handleBotFlow(targetInstance: Bot, event: BotEvent) {
        this.createEventFile(targetInstance, event);        
        log(`Activating bot ${targetInstance.id} for event ${event.id}`);

        let statusMessage:Message|undefined = await this.createStatusMessageIfApplicable(targetInstance, event);    
        const verbosity = this.getVerbosity(targetInstance, event);

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

        const project = configManager.getProjects().find(p => p.name === originalEvent.project);                
        const delegator = configManager.getInstances().find(i => i.id === originalEvent.delegator_botid);
        const developer = configManager.getInstances().find(i => i.id === originalEvent.assignedTo);

    
        
        const nextEvent = new DelegationBotEvent({
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
            // 2. Handle QA flow
            const qaBot = configManager.getInstances().find(i => i.role == BotRole.QA && i.managedProjects.indexOf(project.name)>=0);
            if (qaBot) {
                log(`Developer task complete for ${project.name}. Delegating to QA bot ${qaBot.id}.`);                                
                this.handleDelegatedBotFlow(fromInstance, qaBot, nextEvent);
                return;
            }
        } else if (fromInstance.role === 'qa' && responseJson.task_status === 'failed') { 
            // 3. Handle QA failure (and max attempts)
            const developer = configManager.getInstances().find(i => i.id === originalEvent.assignedTo);
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

    private initDiscordBot(instance: Bot) {
        const client = this.discordClients.get(instance.id);
        if (client) {
            client.destroy();
        }

        const newClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

        newClient.once(Events.ClientReady, readyClient => {
            log(`Bot ${instance.name} is ready! Logged in as ${readyClient.user.tag}`);
        });

        newClient.on(Events.MessageCreate, async message => {
            const allowedChannelIds = instance.discordChannelId;
            const isListening = Array.isArray(allowedChannelIds) ? allowedChannelIds.includes(message.channel.id) : allowedChannelIds === message.channel.id;

            if (newClient.user && isListening && !message.author.bot && message.mentions.has(newClient.user.id)) {
                const eventId = generateEventId();
                log(`Discord Message received for ${instance.name} (Event ID: ${eventId}): ${message.content}`);
                
                const channelProjects = configManager.getProjects().filter(p => Array.isArray(p.discordChannelIds) && p.discordChannelIds.includes(message.channel.id)).map(p => p.name);

                const discordBotEvent = new DiscordBotEvent({id: generateEventId(),message:message, channelProjects});
                
                this.handleBotFlow(instance, discordBotEvent);
            }
        });

        newClient.login(instance.discordBotToken);
        this.discordClients.set(instance.id, newClient);
    }

    private setupRoutes() {
        this.app.get('/bots', (req, res) => {
            const bots: Bot[] = configManager.getInstances().map((instance: any) => {
                const settingsPath = path.join(__dirname, `../bot-instances/${instance.id}/.${instance.cli}/settings.json`);
                const mdPath = path.join(__dirname, `../bot-instances/${instance.id}/${instance.cli.toUpperCase()}.md`);

                const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
                const md = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf-8') : '';

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
                log(`Received tool call for ${instanceId} (Event ID: ${eventId})`);                
                if(hookData.toolCall && hookData.toolCall.name && hookData.toolCall.args) {
                    log(` - tool: ${hookData.toolCall.name} | args: ${JSON.stringify(hookData.toolCall.args)}`);
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

        this.app.post('/instance/:instanceId/delegated-task', (req, res) => {
            const targetInstanceId = req.params.instanceId;
            const taskData = req.body;
            const delegatorId = req.header('X-Instance-Id');
            const originalEventId = req.header('X-Event-Id');            

            const delegator = configManager.getInstances().find((inst: any) => inst.id === delegatorId);
            if (!delegator || !configManager.getRoles()[delegator.role]?.allowDelegation) {
                return res.status(403).send('This bot is not authorized to delegate tasks.');
            }

            const targetInstance = configManager.getInstances().find((inst: any) => inst.id === targetInstanceId);

            if(!originalEventId) {res.status(404).send('No X-Event-Id Header provided'); return; }
            if(!delegatorId) { res.status(404).send('No X-Instance-Id Header provided'); return; }
            if(!taskData.task_description || typeof(taskData.task_description) !== 'string' || 
                !taskData.project || typeof(taskData.project) !== 'string') {
                res.status(404).send('Bad task data provided'); return; 
            }
            
            //Find the comms Event specified by X-Event-ID
            //The problem is that the activateBot() on zulu-manager occurs with the X-Event-Id of the delegation event, so its not actually a comms even that he finds...
            let openEvent = dockermanager.getOpenEventByInstanceAndEventId(delegatorId, originalEventId);
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
                        id:generateEventId(),
                        project:taskData.project,
                        task_description: taskData.task_description,
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
