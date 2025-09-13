import { BotFrameworkAdapter, MemoryStorage, ConversationState, UserState, TurnContext, Activity, ActivityTypes } from 'botbuilder';
import { Bot, BotEvent, DelegationBotEvent, TeamsBotEvent } from './bots/types';
import { log } from './utils/log';
import { generateEventId } from './utils/snowflake';
import configManager from './configmanager';
import apiServer from './apiserver';
import { createHmac } from 'crypto';

import { publicdb, PSQLERROR } from './supabase';
import { Database as PublicSchema } from './db/public.types';

type UserAuthorization = PublicSchema["public"]["Tables"]["user_authorizations"]["Row"];
type Channel = PublicSchema["public"]["Tables"]["channels"]["Row"];

class TeamsManager {
    private userAuthorizations: Map<string, UserAuthorization[]> = new Map();
    private channelAccounts: Map<string, Channel> = new Map();
    private teamsAdapters: Map<string, BotFrameworkAdapter> = new Map();
    private conversationStates: Map<string, ConversationState> = new Map();

    constructor() {
        this.fetchAllChannelInfos();
        this.initBots();
    }

    private async fetchAllUserAuthorizations() {
        const { data: user_authorizations, error } = await publicdb
            .from('user_authorizations')
            .select('*')
            .eq('is_active', true)
            .eq('type', 'teams');

        if (!user_authorizations || error) {
            log('TeamsManager: Error fetching user_authorizations from Supabase');
            return;
        }

        user_authorizations.forEach((x) => {
            let authList = this.userAuthorizations.get(x.authorized_identifier);
            if (!authList) authList = [];
            authList.push(x);
            this.userAuthorizations.set(x.authorized_identifier, authList);
        });
    }

    private generateSignedLink(teamsUserId: string, teamId: string, channelId: string, teamName?: string, channelName?: string, userName?: string): string {
        const payload = {
            teams_user_id: teamsUserId,
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
            .eq('type', 'teams');

        if (error) {
            log('TeamsManager: Error fetching teams channels from Supabase');
            return;
        }

        channels.forEach((x) => this.channelAccounts.set(x.channel_id, x));
    }

    public async getAccountAuthorizationForChannelAndUser(context: TurnContext): Promise<UserAuthorization | undefined> {
        if (this.userAuthorizations.size == 0) {
            this.fetchAllUserAuthorizations();
        }
        if (this.channelAccounts.size == 0) {
            this.fetchAllChannelInfos();
        }

        const teamsChannelId = context.activity.conversation?.id;
        const teamsUserId = context.activity.from?.id;

        if (!teamsChannelId || !teamsUserId) return undefined;

        let channel = this.channelAccounts.get(teamsChannelId);
        let account_id = undefined;

        if (channel && channel.account_id) {
            account_id = channel.account_id;
        } else {
            const { data: channels, error } = await publicdb
                .from('channels')
                .select('*')
                .eq('channel_id', teamsChannelId)
                .eq('type', 'teams')
                .eq('active', true);

            if (!channels || channels.length != 1) return undefined;

            this.channelAccounts.set(teamsChannelId, channels[0]);
            channel = channels[0];
            account_id = channel.account_id;
        }

        let storedAuthorizations = this.userAuthorizations.get(teamsUserId);
        let userAuthorization = storedAuthorizations?.find(x => x.account_id == account_id);
        
        if (userAuthorization) {
            return userAuthorization;
        } else {
            const { data: authorizations, error } = await publicdb
                .from('user_authorizations')
                .select('*')
                .eq('type', 'teams')
                .eq('authorized_identifier', teamsUserId);

            if (!authorizations) return undefined;
            this.userAuthorizations.set(teamsUserId, authorizations);
            return authorizations?.find(x => x.account_id == account_id);
        }
    }

    public async initBots() {
        try {
            const { data: teamsBots, error } = await publicdb
                .from('bots')
                .select('*')
                .eq("active", true)
                .limit(27);

            if (error) {
                log('Error fetching teams bots from Supabase:', error);
                return;
            }

            if (!teamsBots || teamsBots.length == 0) {
                log('No teams bots found in Supabase config');
                return;
            }

            teamsBots.forEach((bot) => {
                if (bot.active) {
                    this.initTeamsBot(bot);
                }
            });
        } catch (error) {
            log('Error initializing teams bots:', error);
        }
    }

    private initTeamsBot(bot: any) {
        const existingAdapter = this.teamsAdapters.get(bot.id);
        if (existingAdapter) {
            return;
        }

        const adapter = new BotFrameworkAdapter({
            appId: bot.teams_bot_app_id,
            appPassword: bot.teams_bot_app_password
        });

        const memoryStorage = new MemoryStorage();
        const conversationState = new ConversationState(memoryStorage);
        const userState = new UserState(memoryStorage);

        this.conversationStates.set(bot.id, conversationState);
        this.teamsAdapters.set(bot.id, adapter);

        // Set up activity handler
        const onTurn = async (context: TurnContext) => {
            if (context.activity.type === ActivityTypes.Message) {
                await this.handleMessage(context, bot);
            } else if (context.activity.type === ActivityTypes.ConversationUpdate && context.activity.membersAdded) {
                const membersAdded = context.activity.membersAdded;
                for (let cnt = 0; cnt < membersAdded.length; cnt++) {
                    if (membersAdded[cnt].id !== context.activity.recipient.id) {
                        await context.sendActivity('Welcome to the Radsuite Teams Bot!');
                    }
                }
            }
        };

        log(`Teams bot ${bot.name} initialized successfully`);
    }

    private async handleMessage(context: TurnContext, bot: any) {
        // Check if bot is mentioned
        const mentions = context.activity.entities?.filter(entity => entity.type === 'mention') || [];
        const isBotMentioned = mentions.some(mention => mention.mentioned?.id === context.activity.recipient.id);

        if (!isBotMentioned) {
            return;
        }

        const userAuthorization = await this.getAccountAuthorizationForChannelAndUser(context);
        
        if (!userAuthorization) {
            // Check if team is already authorized
            const tenantId = context.activity.conversation?.tenantId || '';
            const { data: existingChannels } = await publicdb
                .from('channels')
                .select('*')
                .eq('team_id', tenantId)
                .eq('type', 'teams')
                .eq('is_active', true);

            const isTeamAuthorized = existingChannels && existingChannels.length > 0;

            // Check if user is team admin (this would need proper implementation)
            const isUserAdmin = false; // TODO: Implement Teams admin check

            if (isUserAdmin || isTeamAuthorized) {
                try {
                    const teamName = context.activity.conversation?.tenantId || 'Unknown Team';
                    const channelName = context.activity.conversation?.name || 'Unknown Channel';
                    const userName = context.activity.from?.name || 'Unknown User';

                    const signedLink = this.generateSignedLink(
                        context.activity.from?.id || '',
                        context.activity.conversation?.tenantId || '',
                        context.activity.conversation?.id || '',
                        teamName,
                        channelName,
                        userName
                    );

                    // Respond in channel
                    await context.sendActivity(
                        `Hi! I'll send you a DM with an authorization link to connect this Teams workspace to your account. Please check your DMs and follow the link to complete the setup.`
                    );

                    // Send DM with signed link
                    const dmActivity = {
                        type: ActivityTypes.Message,
                        text: `To authorize this Teams workspace for bot access, please visit: ${signedLink}\n\nThis link will expire in 1 hour. You'll need to sign in with your account to complete the authorization.`,
                        recipient: context.activity.from,
                        conversation: { 
                            id: context.activity.from?.id || '',
                            isGroup: false,
                            conversationType: 'personal',
                            name: context.activity.from?.name || 'Direct Message'
                        },
                        from: context.activity.recipient
                    };

                    await context.adapter.sendActivities(context, [dmActivity]);

                    log(`Sent authorization link to user ${context.activity.from?.id} for team ${context.activity.conversation?.tenantId}`);
                } catch (error) {
                    log(`Error sending authorization to user ${context.activity.from?.id}:`, error);
                    await context.sendActivity(
                        `I tried to send you an authorization link, but couldn't. Please ensure your DMs are open and try mentioning me again.`
                    );
                }
            } else {
                await context.sendActivity(
                    `You need admin permissions to authorize this bot. Please ask a workspace administrator to mention the bot first.`
                );
            }
            return;
        }

        const isListening = userAuthorization !== undefined;
        const authorizedAccountId = userAuthorization.account_id;

        if (isListening && context.activity.from?.id && context.activity.recipient?.id) {
            const eventId = generateEventId();
            log(`Teams Message received for ${bot.name} (Event ID: ${eventId}): ${context.activity.text}`);

            const conversationId = context.activity.conversation?.id || '';
            const channelProjects = (await configManager.getProjects(authorizedAccountId))
                .filter(p => p.teamsChannelIds && Array.isArray(p.teamsChannelIds) && p.teamsChannelIds.includes(conversationId))
                .map(p => p.name);

            const teamsBotEvent = new TeamsBotEvent({
                id: generateEventId(),
                account_id: authorizedAccountId,
                context: context,
                channelProjects
            });

            const botInstance = await configManager.getInstanceForBot(authorizedAccountId, bot.id);
            if (!botInstance) {
                log(`Bot Instance not found for bot ${bot.name}`);
                return;
            }

            apiServer.handleBotFlow(botInstance, teamsBotEvent);
        }
    }

    public getTeamsAdapter(instance: Bot): BotFrameworkAdapter | undefined {
        return this.teamsAdapters.get(instance.bot_id);
    }

    public getConversationState(instance: Bot): ConversationState | undefined {
        return this.conversationStates.get(instance.bot_id);
    }

    public async createStatusMessageIfApplicable(targetInstance: Bot, event: BotEvent): Promise<any | undefined> {
        let statusMessage: any | undefined = undefined;

        if (event instanceof TeamsBotEvent) {
            let teamsBotEvent = event as TeamsBotEvent;
            const adapter = this.teamsAdapters.get(targetInstance.bot_id);
            
            if (adapter) {
                try {
                    await teamsBotEvent.context.sendActivity('Processing...');
                    statusMessage = { sent: true, timestamp: new Date() };
                } catch (error) {
                    console.error('Error sending status message to Teams:', error);
                }
            }
        } else if (event instanceof DelegationBotEvent) {
            let commsEvent = event.commsEvent;
            if (commsEvent instanceof TeamsBotEvent) {
                let teamsCommsEvent = commsEvent as TeamsBotEvent;
                const adapter = this.teamsAdapters.get(targetInstance.bot_id);
                
                if (adapter) {
                    try {
                        await teamsCommsEvent.context.sendActivity('Received Delegation Request - Processing...');
                        statusMessage = { sent: true, timestamp: new Date() };
                    } catch (error) {
                        console.error('Error sending delegation status message to Teams:', error);
                    }
                }
            } else {
                console.error('No originating comms event found for delegation event', event);
            }
        }
        
        return statusMessage;
    }
}

export default new TeamsManager();