import { createServer } from './server';
import * as fs from 'fs';
import * as path from 'path';
import { Bot, BotEventType, BotOutput } from './bots/types';
import { Client, GatewayIntentBits, Events, Message } from 'discord.js';
import dockerManager from './dockermanager';
import express from 'express';
import { log } from './utils/log';
import { sendChunkedMessage } from './utils/discord';
import { STDERR_FILTERS } from './utils/filters';
import { generateEventId } from './utils/id';

class ApiServer {
    private app: express.Application;
    private instances: any[];
    private instancesPath: string;
    private discordClients: Map<string, Client> = new Map();

    constructor() {
        this.app = createServer();
        this.instancesPath = path.join(__dirname, '../bot-instances/instances.json');
        this.instances = [];
        this.loadInstances();
        this.setupRoutes();
    }

    private loadInstances() {
        this.instances = JSON.parse(fs.readFileSync(this.instancesPath, 'utf-8'));
    }

    public initBots(instanceIds?: string[]) {
        this.loadInstances();
        dockerManager.initBots(instanceIds);

        const instancesToInit = instanceIds
            ? this.instances.filter(inst => instanceIds.includes(inst.id))
            : this.instances;

        instancesToInit.forEach((instance: any) => {
            if (instance.enabled) {
                this.initDiscordBot(instance);
            }
        });
    }

    private createEventFile(instance: any, eventId: string, messageContent: string) {
        const eventsDir = path.join(__dirname, `../bot-instances/${instance.id}/.events`);
        if (!fs.existsSync(eventsDir)) {
            fs.mkdirSync(eventsDir, { recursive: true });
        }
        const eventFilePath = path.join(eventsDir, `${eventId}.json`);
        const eventData = {
            id: eventId,
            source: 'discord',
            content: messageContent,
            timestamp: new Date().toISOString()
        };
        fs.writeFileSync(eventFilePath, JSON.stringify(eventData, null, 2));
    }

    private writeLogEntry(instanceId: string, logFilename: string, event: BotOutput) {
        const logsDir = path.join(__dirname, `../bot-instances/${instanceId}/.logs`);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        const logStream = fs.createWriteStream(path.join(logsDir, logFilename), { flags: 'a' });
        logStream.write(JSON.stringify(event) + '\n');
        logStream.end();
    }

    private initDiscordBot(instance: any) {
        const client = this.discordClients.get(instance.id);
        if (client) {
            client.destroy();
        }

        const newClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

        newClient.once(Events.ClientReady, readyClient => {
            log(`Bot ${instance.name} is ready! Logged in as ${readyClient.user.tag}`);
        });

        newClient.on(Events.MessageCreate, async message => {
            if (newClient.user && message.channel.id === instance.discordChannelId && !message.author.bot && message.mentions.has(newClient.user.id)) {
                const eventId = generateEventId();
                const logFilename = `${eventId}.jsonl`;

                log(`Message received for ${instance.name} (Event ID: ${eventId}): ${message.content}`);
                const statusMessage = await message.reply('Processing...');
                this.createEventFile(instance, eventId, message.content);

                try {
                    let event = await dockerManager.activateBot(instance, message.content, eventId);
                    let fullResponse = '';

                    while (event) {
                        if (!(event.type === BotEventType.STDERR && STDERR_FILTERS.includes(event.output.trim()))) {
                            this.writeLogEntry(instance.id, logFilename, event);
                        }

                        if (event.type === BotEventType.STDOUT) {
                            fullResponse += event.output;
                        }

                        if (!event.next) {
                            break;
                        }
                        event = await event.next;
                    }

                    await sendChunkedMessage(statusMessage, fullResponse);

                } catch (error) {
                    log(`Error processing bot command for event ${eventId}:`, error);
                    await statusMessage.edit('An error occurred while processing your request.');
                }
            }
        });

        newClient.login(instance.discordBotToken);
        this.discordClients.set(instance.id, newClient);
    }

    private setupRoutes() {
        this.app.get('/bots', (req, res) => {
            this.loadInstances();
            const bots: Bot[] = this.instances.map((instance: any) => {
                const settingsPath = path.join(__dirname, `../bot-instances/${instance.id}/.${instance.cli}/settings.json`);
                const mdPath = path.join(__dirname, `../bot-instances/${instance.id}/${instance.cli.toUpperCase()}.md`);

                const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
                const md = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf-8') : '';

                return { ...instance, settings, md };
            });
            res.json(bots);
        });

        this.app.post('/bots/:id/events', (req, res) => {
            this.loadInstances();
            const botId = req.params.id;
            const event = req.body;
            const instance = this.instances.find((inst: any) => inst.id === botId);

            if (instance && instance.enabled) {
                const eventId = generateEventId();
                this.createEventFile(instance, eventId, JSON.stringify(event));
                dockerManager.activateBot(instance, JSON.stringify(event), eventId);
                res.status(200).json({ message: 'Bot activated' });
            }
            else {
                res.status(404).send('Bot not found or is disabled');
            }
        });

        this.app.post('/hook/:hookType', (req, res) => {
            const instanceId = req.header('X-Instance-Id');
            const eventId = req.header('X-Discord-Event-Id');
            const hookData = req.body;

            if (instanceId && eventId) {
                log(`Received tool call for ${instanceId} (Event ID: ${eventId})`);
                dockerManager.handleToolCall(instanceId, eventId, hookData);
                res.status(200).send();
            }
            else {
                res.status(400).send('Missing X-Instance-Id or X-Discord-Event-Id header');
            }
        });

        this.app.post('/log', (req, res) => {
            const instanceId = req.header('X-Instance-Id');
            const eventId = req.header('X-Event-Id');
            const logData = req.body;

            if (instanceId && eventId) {
                log(`Received log from ${instanceId} (Event ID: ${eventId})`, logData);
                res.status(200).send();
            }
            else {
                res.status(400).send('Missing X-Instance-Id or X-Event-Id header');
            }
        });

        this.app.post('/instance/:instanceId/delegated-task', (req, res) => {
            this.loadInstances();
            const targetInstanceId = req.params.instanceId;
            const taskData = req.body;
            const delegatorId = req.header('X-Instance-Id');

            const targetInstance = this.instances.find((inst: any) => inst.id === targetInstanceId);

            if (targetInstance && targetInstance.enabled) {
                const eventId = generateEventId();
                const eventContent = {
                    ...taskData,
                    delegator_botid: delegatorId,
                };
                this.createEventFile(targetInstance, eventId, JSON.stringify(eventContent));
                dockerManager.activateBot(targetInstance, JSON.stringify(eventContent), eventId);
                res.status(200).json({ message: 'Task delegated' });
            }
            else {
                res.status(404).send('Target bot not found or is disabled');
            }
        });
    }

    public listen(port: number, callback?: () => void) {
        this.app.listen(port, callback);
    }
}

export default new ApiServer();
