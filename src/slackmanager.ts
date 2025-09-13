import { WebClient, LogLevel } from '@slack/web-api';
import { createEventAdapter } from '@slack/events-api';
import { createMessageAdapter } from '@slack/interactive-messages';
import { Bot, BotEvent, DelegationBotEvent, SlackBotEvent } from './bots/types';
import { log } from './utils/log';
import { generateEventId } from './utils/snowflake';
import configManager from './configmanager';
import apiServer from './apiserver';
import { createHmac } from 'crypto';

import { publicdb, PSQLERROR } from './supabase';
import { Database as PublicSchema } from './db/public.types';

type UserAuthorization = PublicSchema["public"]["Tables"]["user_authorizations"]["Row"];
type Channel = PublicSchema["public"]["Tables"]["channels"]["Row"];

class SlackManager {
    private userAuthorizations: Map<string, UserAuthorization[]> = new Map();
    private channelAccounts: Map<string, Channel> = new Map();
    private slackClients: Map<string, WebClient> = new Map();
    private slackEventAdapters: Map<string, any> = new Map();

    constructor() {
        this.fetchAllChannelInfos();
        this.initBots();
    }

    private async fetchAllUserAuthorizations() {
        const { data: user_authorizations, error } = await publicdb
            .from('user_authorizations')
            .select('*')
            .eq('is_active', true)
            .eq('type', 'slack');

        if (!user_authorizations || error) {
            log('SlackManager: Error fetching user_authorizations from Supabase');
            return;
        }

        user_authorizations.forEach((x) => {
            let authList = this.userAuthorizations.get(x.authorized_identifier);
            if (!authList) authList = [];
            authList.push(x);
            this.userAuthorizations.set(x.authorized_identifier, authList);
        });
    }

    private generateSignedLink(slackUserId: string, teamId: string, channelId: string, teamName?: string, channelName?: string, userName?: string): string {
        const payload = {
            slack_user_id: slackUserId,
            team_id: teamId,
            channel_id: channelId,
            team_name: teamName || 'Unknown Team',
            channel_name: channelName || 'Unknown Channel',
            user_name: userName || 'Unknown User',
            timestamp: Date.now(),
            expires_in: 3600000 // 1 hour in milliseconds
        };

        const secret = process.env.ZULU_LINK_SECRET || 'fallback-secret-key';
        const signature = createHmac('sha256', secret)
            .update(JSON.stringify(payload))
            .digest('hex');

        const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
        const encodedPayload = base64Payload.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        const encodedSignature = signature;

        const baseUrl = process.env.ZULU_WWW_URL || 'https://zulu-www.warmerise.co';
        return `${baseUrl}/authorize?payload=${encodedPayload}&signature=${encodedSignature}`;
    }

    private async fetchAllChannelInfos() {
        const { data: channels, error } = await publicdb
            .from('channels')
            .select('*')
            .eq('is_active', true)
            .eq('type', 'slack');

        if (error) {
            log('SlackManager: Error fetching slack channels from Supabase');
            return;
        }

        channels.forEach((x) => this.channelAccounts.set(x.channel_id, x));
    }

    public async getAccountAuthorizationForChannelAndUser(event: any): Promise<UserAuthorization | undefined> {
        if (this.userAuthorizations.size == 0) {
            this.fetchAllUserAuthorizations();
        }
        if (this.channelAccounts.size == 0) {
            this.fetchAllChannelInfos();
        }

        const slackChannelId = event.channel;
        const slackUserId = event.user;

        let channel = this.channelAccounts.get(slackChannelId);
        let account_id = undefined;

        if (channel && channel.account_id) {
            account_id = channel.account_id;
        } else {
            const { data: channels, error } = await publicdb
                .from('channels')
                .select('*')
                .eq('channel_id', slackChannelId)
                .eq('type', 'slack')
                .eq('active', true);

            if (!channels || channels.length != 1) return undefined;

            this.channelAccounts.set(slackChannelId, channels[0]);
            channel = channels[0];
            account_id = channel.account_id;
        }

        let storedAuthorizations = this.userAuthorizations.get(slackUserId);
        let userAuthorization = storedAuthorizations?.find(x => x.account_id == account_id);
        
        if (userAuthorization) {
            return userAuthorization;
        } else {
            const { data: authorizations, error } = await publicdb
                .from('user_authorizations')
                .select('*')
                .eq('type', 'slack')
                .eq('authorized_identifier', slackUserId);

            if (!authorizations) return undefined;
            this.userAuthorizations.set(slackUserId, authorizations);
            return authorizations?.find(x => x.account_id == account_id);
        }
    }

    public async initBots() {
        try {
            const { data: slackBots, error } = await publicdb
                .from('bots')
                .select('*')
                .eq("active", true)
                .limit(27);

            if (error) {
                log('Error fetching slack bots from Supabase:', error);
                return;
            }

            if (!slackBots || slackBots.length == 0) {
                log('No slack bots found in Supabase config');
                return;
            }

            slackBots.forEach((bot) => {
                if (bot.active) {
                    this.initSlackBot(bot);
                }
            });
        } catch (error) {
            log('Error initializing slack bots:', error);
        }
    }

    private initSlackBot(bot: any) {
        const existingClient = this.slackClients.get(bot.id);
        if (existingClient) {
            return;
        }

        const client = new WebClient(bot.slack_bot_token, {
            logLevel: LogLevel.DEBUG
        });

        this.slackClients.set(bot.id, client);

        // Set up event handling using Slack Events API
        const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET || '');
        this.slackEventAdapters.set(bot.id, slackEvents);

        slackEvents.on('message', async (event) => {
            // Only respond to messages that mention the bot
            if (!event.text || !event.text.includes(`<@${bot.id}>`)) {
                return;
            }

            const userAuthorization = await this.getAccountAuthorizationForChannelAndUser(event);
            
            if (!userAuthorization) {
                // Check if user is admin or if team is already authorized
                const { data: existingChannels } = await publicdb
                    .from('channels')
                    .select('*')
                    .eq('team_id', event.team)
                    .eq('type', 'slack')
                    .eq('is_active', true);

                const isTeamAuthorized = existingChannels && existingChannels.length > 0;

                // Check if user is admin (this would need to be implemented based on Slack's admin checks)
                const isUserAdmin = false; // TODO: Implement Slack admin check

                if (isUserAdmin || isTeamAuthorized) {
                    try {
                        const teamName = event.team || 'Unknown Team';
                        const channelName = event.channel || 'Unknown Channel';
                        const userName = event.user || 'Unknown User';

                        const signedLink = this.generateSignedLink(
                            event.user,
                            event.team,
                            event.channel,
                            teamName,
                            channelName,
                            userName
                        );

                        // Respond in channel
                        await client.chat.postMessage({
                            channel: event.channel,
                            text: `Hi! I'll send you a DM with an authorization link to connect this Slack workspace to your account. Please check your DMs and follow the link to complete the setup.`
                        });

                        // DM the user
                        await client.chat.postMessage({
                            channel: event.user,
                            text: `To authorize this Slack workspace for bot access, please visit: ${signedLink}\n\nThis link will expire in 1 hour. You'll need to sign in with your account to complete the authorization.`
                        });

                        log(`Sent authorization link to user ${event.user} for team ${event.team}`);
                    } catch (error) {
                        log(`Error sending authorization to user ${event.user}:`, error);
                        await client.chat.postMessage({
                            channel: event.channel,
                            text: `I tried to send you an authorization link, but couldn't. Please ensure your DMs are open and try mentioning me again.`
                        });
                    }
                } else {
                    await client.chat.postMessage({
                        channel: event.channel,
                        text: `You need admin permissions to authorize this bot. Please ask a workspace administrator to mention the bot first.`
                    });
                }
                return;
            }

            const isListening = userAuthorization !== undefined;
            const authorizedAccountId = userAuthorization.account_id;

            if (isListening && event.user && event.text.includes(`<@${bot.id}>`)) {
                const eventId = generateEventId();
                log(`Slack Message received for ${bot.name} (Event ID: ${eventId}): ${event.text}`);

                const channelProjects = (await configManager.getProjects(authorizedAccountId))
                    .filter(p => p.slackChannelIds && Array.isArray(p.slackChannelIds) && p.slackChannelIds.includes(event.channel))
                    .map(p => p.name);

                const slackBotEvent = new SlackBotEvent({
                    id: generateEventId(),
                    account_id: authorizedAccountId,
                    event: event,
                    channelProjects
                });

                const botInstance = await configManager.getInstanceForBot(authorizedAccountId, bot.id);
                if (!botInstance) {
                    log(`Bot Instance not found for bot ${bot.name}`);
                    return;
                }

                apiServer.handleBotFlow(botInstance, slackBotEvent);
            }
        });

        log(`Slack bot ${bot.name} initialized successfully`);
    }

    public getSlackClient(instance: Bot): WebClient | undefined {
        return this.slackClients.get(instance.bot_id);
    }

    public async createStatusMessageIfApplicable(targetInstance: Bot, event: BotEvent): Promise<any | undefined> {
        let statusMessage: any | undefined = undefined;

        if (event instanceof SlackBotEvent) {
            let slackBotEvent = event as SlackBotEvent;
            const client = this.slackClients.get(targetInstance.bot_id);
            
            if (client) {
                try {
                    statusMessage = await client.chat.postMessage({
                        channel: slackBotEvent.event.channel,
                        text: 'Processing...'
                    });
                } catch (error) {
                    console.error('Error sending status message to Slack:', error);
                }
            }
        } else if (event instanceof DelegationBotEvent) {
            let commsEvent = event.commsEvent;
            if (commsEvent instanceof SlackBotEvent) {
                let slackCommsEvent = commsEvent as SlackBotEvent;
                const client = this.slackClients.get(targetInstance.bot_id);
                
                if (client) {
                    try {
                        statusMessage = await client.chat.postMessage({
                            channel: slackCommsEvent.event.channel,
                            text: 'Received Delegation Request - Processing...'
                        });
                    } catch (error) {
                        console.error('Error sending delegation status message to Slack:', error);
                    }
                }
            } else {
                console.error('No originating comms event found for delegation event', event);
            }
        }
        
        return statusMessage;
    }
}

export default new SlackManager();