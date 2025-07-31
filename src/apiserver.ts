import { createServer } from './server';
import * as fs from 'fs';
import * as path from 'path';
import { Bot } from './bots/types';
import { Client, GatewayIntentBits, Events, Message, TextChannel } from 'discord.js';
import dockerManager from './dockermanager';
import express from 'express';
import { log } from './utils/log';

const MAX_MESSAGE_LENGTH = 2000;

const sendChunkedMessage = async (statusMessage: Message, content: string) => {
    if (!content) return;

    try {
        let channel = statusMessage.channel as TextChannel;
        if (content.length <= MAX_MESSAGE_LENGTH) {
            await statusMessage.edit(content);
            return;
        }

        const chunks = [];
        for (let i = 0; i < content.length; i += MAX_MESSAGE_LENGTH) {
            chunks.push(content.substring(i, i + MAX_MESSAGE_LENGTH));
        }

        await statusMessage.edit(chunks[0]);

        if (channel instanceof TextChannel) {
            for (let i = 1; i < chunks.length; i++) {
                await channel.send(chunks[i]);
            }
        }
    } catch (e) {
        log('Error sending discord message: ' + e);
    }
};

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
                log(`Message received for ${instance.name}: ${message.content}`);
                const statusMessage = await message.reply('Processing...');
                dockerManager.activateBot(instance, message.content, undefined, statusMessage);
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
                dockerManager.activateBot(instance, JSON.stringify(event));
                res.status(200).json({ message: 'Bot activated' });
            } else {
                res.status(404).send('Bot not found or is disabled');
            }
        });
    }

    public listen(port: number, callback?: () => void) {
        this.app.listen(port, callback);
    }
}

export default new ApiServer();
