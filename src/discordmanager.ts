import { Client, GatewayIntentBits, Events, Message, ChannelType, TextChannel } from 'discord.js';
import { Bot, BotEvent, DelegationBotEvent, DiscordBotEvent } from './bots/types';
import { log } from './utils/log';
import { sendChunkedMessage } from './utils/discord';
import { generateEventId } from './utils/snowflake';
import configManager from './configmanager';
import apiServer from './apiserver'; // Import to access handleBotFlow

import {configdb, publicdb, PSQLERROR} from './supabase';
import { Tables } from './db/config.types';

import { assert, logAssert } from './utils/assert'


class DiscordManager {
    private channelAccounts: Map<string,string> = new Map(); //map from discord channelid to accountid
    private discordClients: Map<string, Client> = new Map(); //map from BOT ID (not Instance ID) to DiscordClient

    constructor() {
        this.fetchAllChannelInfos();
        this.initBots();

        //Don't we need to periodically poll for new bots?

    }
    private async fetchAllChannelInfos() {
        const {data:channels, error} = await publicdb.from('channels').select('*').eq('is_active',true).eq('type','discord');
        if(error) { 
            log('DiscordManager: Error fetching discord channels form Supabase'); 
            return; 
        }
        channels.forEach((x)=>this.channelAccounts.set(x.channel_id,x.account_id));        
    }
    public async getChannelAccountId(discordChannelId:string):Promise<string|undefined> {        
        let accountId = this.channelAccounts.get(discordChannelId);
        if(accountId) { return accountId; }

        if(this.channelAccounts.size ==0 ) {
            this.fetchAllChannelInfos();            
        } else {
            const {data:channels, error} = await publicdb.from('channels').select('*').eq('channel_id',discordChannelId).eq('type','discord').eq('active',true);
            if(channels) { channels.forEach((x)=>this.channelAccounts.set(x.channel_id,x.account_id)); }
        }

        return this.channelAccounts.get(discordChannelId);
    }
    

    public async initBots() { //instanceIds?: string[]
        try {
            const { data: discordBots, error } = await publicdb
                .from('bots')
                .select('*')
                .eq("active",true)
                .limit(27); //Alpha-Zulu+Sys

            if (error) {
                log('Error fetching discord bots from Supabase:', error);
                return;
            }

            if (!discordBots || discordBots.length==0) {
                log('No discord bots found in Supabase config');
                return;
            }

            const bots = discordBots;
  

            bots.forEach((bot) => {
                if (bot.active) {
                    this.initDiscordBot(bot);
                }
            });
        } catch (error) {
            log('Error initializing discord bots:', error);
        }
    }
    private initDiscordBot(bot: {
        active: boolean;
        created_at: string;
        discord_bot_token: string;
        id: string;
        name: string;
    }) {        
        //FIXME: How about bots which are no longer in database?
        const existingClient = this.discordClients.get(bot.id);
        if(existingClient && existingClient.token == bot.discord_bot_token) {
            return;
        } else if(existingClient) { //token has been updated
            existingClient.destroy();
            this.discordClients.delete(bot.id);
        }

        const newClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

        newClient.once(Events.ClientReady, readyClient => {
            log(`Bot ${bot.name} is ready! Logged in as ${readyClient.user.tag}`);
        });

        newClient.on(Events.MessageCreate, async message => {
            const channelAccountId = await this.getChannelAccountId(message.channel.id);            
            if(!channelAccountId) return;
            //The issue is no longer whether a channel is "allowed", so much as what account it relates to.
            // This is so we can map the inbound message, ultimately to an account & instance
            // FIXME: Figure out how to map the channelId to an AccountId
            // FIXME: Worry about securing this later. For now, its enough that the bot is in the channel and the user has configured the channel for their account.
            // Each channel can only be assigned and enabled on one account
            //const allowedChannelIds = instance.discordChannelId;

            const isListening = channelAccountId !== undefined; //Array.isArray(allowedChannelIds) ? allowedChannelIds.includes(message.channel.id) : allowedChannelIds === message.channel.id;

            if (newClient.user && isListening && !message.author.bot && message.mentions.has(newClient.user.id)) {
                const eventId = generateEventId();
                log(`Discord Message received for ${bot.name} (Event ID: ${eventId}): ${message.content}`);
                
                const channelProjects = (await configManager.getProjects(channelAccountId)).filter(p => Array.isArray(p.discordChannelIds) && p.discordChannelIds.includes(message.channel.id)).map(p => p.name);

                const discordBotEvent = new DiscordBotEvent({id: generateEventId(),account_id:channelAccountId,message:message, channelProjects});
                
                const botInstance = await configManager.getInstanceForBot(channelAccountId, bot.id);
                if(!botInstance) {
                    log(`Bot Instance not found for bot ${bot.name}`);
                    return;
                }

                //FIXME!!!: Actually im not 
                // sure there is a direct mapping from the Bots in the config schema to the Instances in the public schema as yet.
                //There has to be for this parameter to be passed correctly.
                apiServer.handleBotFlow(botInstance, discordBotEvent);
            }
        });

        newClient.login(bot.discord_bot_token);
        this.discordClients.set(bot.id, newClient);
    }

    public getDiscordClient(instance: Bot): Client | undefined {
        return this.discordClients.get(instance.bot_id);
    }

    public async createStatusMessageIfApplicable(targetInstance:Bot, event:BotEvent):Promise<Message|undefined> {
        let statusMessage:Message|undefined =undefined;
         
        // //Allow other kinds of comms replies (email, slack), etc
        if(event instanceof DiscordBotEvent) {
            let discordBotEvent = event as DiscordBotEvent;
            statusMessage = await discordBotEvent.message.reply('Processing...');
        } else if(event instanceof DelegationBotEvent) {
            let commsEvent = event.commsEvent;
            if(commsEvent instanceof DiscordBotEvent) {
                let discordCommsEvent = commsEvent as DiscordBotEvent;
                let discordClient = this.discordClients.get(targetInstance.bot_id);
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
}

export default new DiscordManager();