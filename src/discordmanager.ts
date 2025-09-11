import { Client, GatewayIntentBits, Events, Message, ChannelType, TextChannel, User as DiscordUser, PermissionsBitField} from 'discord.js';
import { Bot, BotEvent, DelegationBotEvent, DiscordBotEvent } from './bots/types';
import { log } from './utils/log';
import { generateEventId } from './utils/snowflake';
import configManager from './configmanager';
import apiServer from './apiserver'; // Import to access handleBotFlow
import { createHmac } from 'crypto';

import {publicdb, PSQLERROR} from './supabase';

import { Database as PublicSchema } from './db/public.types';

type UserAuthorization = PublicSchema["public"]["Tables"]["user_authorizations"]["Row"];
type Channel = PublicSchema["public"]["Tables"]["channels"]["Row"];

//PermissionsBitField.Flags.ManageGuild

class DiscordManager {
    //FIXME: Need to add keys to supabase for type,authorized_identifier to UserAuthorizations so its queryable
    private userAuthorizations: Map<string,UserAuthorization[]> = new Map(); //map from authorized_identifier to UserAuthorization[]

    private channelAccounts: Map<string, Channel> = new Map(); //map from discord channelid to accountid
    private discordClients: Map<string, Client> = new Map(); //map from BOT ID (not Instance ID) to DiscordClient

    constructor() {
        this.fetchAllChannelInfos();
        this.initBots();

        //Don't we need to periodically poll for new bots?

    }
    private async fetchAllUserAuthorizations() {
        const {data:user_authorizations, error} = await publicdb.from('user_authorizations').select('*').eq('is_active',true).eq('type','discord');
        if(!user_authorizations || error) {
            log('DiscordManager: Error fetching user_authorizations from Supabase');
            return;
        }        
        user_authorizations.forEach(
            (x) => { 
                let authList = this.userAuthorizations.get(x.authorized_identifier);
                if(!authList) authList = []; 
                authList.push(x);
                this.userAuthorizations.set(x.authorized_identifier,authList);
            }
        );
    }

    private generateSignedLink(discordUserId: string, guildId: string, channelId: string, guildName?: string, channelName?: string, userName?: string): string {
        // Create a signed link for zulu-www authentication
        const payload = {
            discord_user_id: discordUserId,
            guild_id: guildId,
            channel_id: channelId,
            guild_name: guildName || 'Unknown Server',
            channel_name: channelName || 'Unknown Channel', 
            user_name: userName || 'Unknown User',
            timestamp: Date.now(),
            expires_in: 3600000 // 1 hour in milliseconds
        };

        // Create signature using HMAC-SHA256
        const secret = process.env.ZULU_LINK_SECRET || 'fallback-secret-key'
        const signature = createHmac('sha256', secret)
            .update(JSON.stringify(payload))
            .digest('hex');

        // Encode payload and signature in URL-safe format (base64url)
        const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64')
        const encodedPayload = base64Payload.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
        const encodedSignature = signature;

        // Construct the signed link (zulu-www will need to validate this)
        const baseUrl = process.env.ZULU_WWW_URL || 'https://zulu-www.warmerise.co';
        return `${baseUrl}/authorize?payload=${encodedPayload}&signature=${encodedSignature}`;
    }
    private async fetchAllChannelInfos() {
        const {data:channels, error} = await publicdb.from('channels').select('*').eq('is_active',true).eq('type','discord');
        if(error) { 
            log('DiscordManager: Error fetching discord channels form Supabase'); 
            return; 
        }
        channels.forEach((x)=>this.channelAccounts.set(x.channel_id,x));        
    }
    public async getAccountAuthorizationForChannelAndUser(message:Message):Promise<UserAuthorization|undefined> {        
        if(this.userAuthorizations.size == 0) {
            this.fetchAllUserAuthorizations();
        }    
        if(this.channelAccounts.size ==0 ) {
            this.fetchAllChannelInfos();            
        }
        
        //First check if guild is authorized for a given account
        let discordChannelId = message.channelId;

        //Check if channel is activated for this account
        let channel = this.channelAccounts.get(discordChannelId);
        let account_id = undefined;
        if(channel && channel.account_id) {
            account_id = channel.account_id;            
        } else {
            const {data:channels, error} = await publicdb.from('channels').select('*').eq('channel_id',discordChannelId).eq('type','discord').eq('active',true);        
            if(!channels || channels.length!=1) return undefined; //There should only be ONE and ONLY ONE account for a given channel                        

            this.channelAccounts.set(discordChannelId,channels[0]); //Cache fetched channels         
            channel = channels[0];
            account_id = channel.account_id;
        }

        //Check user authorization for this account.

        let storedAuthorizations = this.userAuthorizations.get(message.author.id)
        let userAuthorization = storedAuthorizations?.find(x=>x.account_id == account_id);
        if(userAuthorization) {
            return userAuthorization;
        } else {
            const {data:authorizations,error} = await publicdb.from('user_authorizations').select('*').eq('type','discord').eq('authorized_identifier',message.author.id);
            if(!authorizations) return undefined;
            this.userAuthorizations.set(message.author.id,authorizations); //Cache fetched authorizations            
            //Return the authorization that matches the account_id for the channel, if one was found
            return authorizations?.find(x=>x.account_id == account_id);
        }
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
            // Only respond if this specific bot is mentioned
            if (!newClient.user || !message.mentions.has(newClient.user.id)) {
                return;
            }

            const userAuthorization = await this.getAccountAuthorizationForChannelAndUser(message);            
            if(!userAuthorization) {                
                // Each guild and channel can only be assigned and enabled on one account

                //Create signed link for zulu-www so user can authorize this channel
                //We probably also want to detect if this channel is brand new, or belongs to an account
                
                // Check if user has ManageGuild permission or if guild is already authorized
                const member = await message.guild?.members.fetch(message.author.id);
                const hasManageGuild = member?.permissions.has(PermissionsBitField.Flags.ManageGuild) ?? false;
                
                // Check if guild is already authorized in channels table
                const { data: existingChannels } = await publicdb
                    .from('channels')
                    .select('*')
                    .eq('guild_id', message.guildId || '')
                    .eq('type', 'discord')
                    .eq('is_active', true);
                
                const isGuildAuthorized = existingChannels && existingChannels.length > 0;
                
                // Allow authorization if user has ManageGuild permission OR guild is already authorized
                if (hasManageGuild || isGuildAuthorized) {
                    try {
                        // Get Discord names for better UX
                        const guildName = message.guild?.name || 'Unknown Server';
                        const channelName = (message.channel as TextChannel)?.name || 'Unknown Channel';
                        const userName = message.author.username || 'Unknown User';

                        const signedLink = this.generateSignedLink(
                            message.author.id,
                            message.guildId || '',
                            message.channelId,
                            guildName,
                            channelName,
                            userName
                        );
                        
                        // First respond in channel to let user know to expect a DM
                        await message.reply(
                            `Hi! I'm sending you a DM with an authorization link to connect this Discord server to your Radsuite account. ` +
                            `Please check your DMs and follow the link to complete the setup.`
                        );
                        
                        // DM the user with the signed link
                        await message.author.send(
                            `To authorize this Discord server for bot access, please visit: ${signedLink}\n\n` +
                            `This link will expire in 1 hour. You'll need to sign in with your account on radsuite.com to complete the authorization.`
                        );
                        
                        log(`Sent authorization link to user ${message.author.id} for guild ${message.guildId}`);
                    } catch (error) {
                        log(`Error sending DM to user ${message.author.id}:`, error);
                        // If DM fails, send a public message
                        await message.reply(
                            `I tried to DM you an authorization link, but couldn't. ` +
                            `Please ensure your DMs are open and try mentioning me again.`
                        );
                    }
                } else {
                    // User doesn't have sufficient permissions
                    await message.reply(
                        `You need Manage Server permission to authorize this bot. ` +
                        `Please ask a server administrator to mention the bot first.`
                    );
                }
                return;
            }
        
            const isListening = userAuthorization !== undefined; //Array.isArray(allowedChannelIds) ? allowedChannelIds.includes(message.channel.id) : allowedChannelIds === message.channel.id;
            const authorizedAccountId = userAuthorization.account_id;

            if (newClient.user && isListening && !message.author.bot && message.mentions.has(newClient.user.id)) {
                const eventId = generateEventId();
                log(`Discord Message received for ${bot.name} (Event ID: ${eventId}): ${message.content}`);
                
                const channelProjects = (await configManager.getProjects(authorizedAccountId)).filter(p => Array.isArray(p.discordChannelIds) && p.discordChannelIds.includes(message.channel.id)).map(p => p.name);

                const discordBotEvent = new DiscordBotEvent({id: generateEventId(),account_id:authorizedAccountId,message:message, channelProjects});
                
                const botInstance = await configManager.getInstanceForBot(authorizedAccountId, bot.id);
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