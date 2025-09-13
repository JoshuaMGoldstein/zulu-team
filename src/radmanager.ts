import { io, Socket } from 'socket.io-client';
import { Bot, BotEvent, DelegationBotEvent, RadBotEvent } from './bots/types';
import { log } from './utils/log';
import { generateEventId } from './utils/snowflake';
import configManager from './configmanager';
import apiServer from './apiserver';
import { createHmac } from 'crypto';

import { publicdb, PSQLERROR } from './supabase';
import { Database as PublicSchema } from './db/public.types';

type UserAuthorization = PublicSchema["public"]["Tables"]["user_authorizations"]["Row"];
type Channel = PublicSchema["public"]["Tables"]["channels"]["Row"];

interface RadChatMessage {
    id: string;
    channelId: string;
    userId: string;
    username: string;
    message: string;
    timestamp: number;
    channelName: string;
    channelType: 'staging' | 'development' | 'production';
    environment: string;
    projectId?: string;
    stagingUrl?: string;
    metadata?: {
        oauthProvider?: string;
        oauthEmail?: string;
        permissions?: string[];
        isAdmin?: boolean;
    };
}

interface RadChatServerConfig {
    url: string;
    authToken?: string;
    reconnectInterval: number;
    maxReconnectAttempts: number;
}

class RadManager {
    private userAuthorizations: Map<string, UserAuthorization[]> = new Map();
    private channelAccounts: Map<string, Channel> = new Map();
    private radConnections: Map<string, Socket> = new Map(); // map from bot_id to socket connection
    private reconnectAttempts: Map<string, number> = new Map();
    private config: RadChatServerConfig;

    constructor() {
        this.config = {
            url: process.env.RAD_CHAT_SERVER_URL || 'http://localhost:3002',
            authToken: process.env.RAD_CHAT_AUTH_TOKEN,
            reconnectInterval: 5000, // 5 seconds
            maxReconnectAttempts: 10
        };
        
        this.fetchAllChannelInfos();
        this.initBots();
    }

    private async fetchAllUserAuthorizations() {
        const { data: user_authorizations, error } = await publicdb
            .from('user_authorizations')
            .select('*')
            .eq('is_active', true)
            .eq('type', 'rad');

        if (!user_authorizations || error) {
            log('RadManager: Error fetching user_authorizations from Supabase');
            return;
        }

        user_authorizations.forEach((x) => {
            let authList = this.userAuthorizations.get(x.authorized_identifier);
            if (!authList) authList = [];
            authList.push(x);
            this.userAuthorizations.set(x.authorized_identifier, authList);
        });
    }

    private generateSignedLink(radUserId: string, channelId: string, projectId?: string, stagingUrl?: string, username?: string): string {
        const payload = {
            rad_user_id: radUserId,
            channel_id: channelId,
            project_id: projectId || 'unknown',
            staging_url: stagingUrl || 'unknown',
            username: username || 'Unknown User',
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
            .eq('type', 'rad');

        if (error) {
            log('RadManager: Error fetching RAD channels from Supabase');
            return;
        }

        channels.forEach((x) => this.channelAccounts.set(x.channel_id, x));
    }

    public async getAccountAuthorizationForChannelAndUser(message: RadChatMessage): Promise<UserAuthorization | undefined> {
        if (this.userAuthorizations.size == 0) {
            this.fetchAllUserAuthorizations();
        }
        if (this.channelAccounts.size == 0) {
            this.fetchAllChannelInfos();
        }

        const radChannelId = message.channelId;
        const radUserId = message.userId;

        let channel = this.channelAccounts.get(radChannelId);
        let account_id = undefined;

        if (channel && channel.account_id) {
            account_id = channel.account_id;
        } else {
            const { data: channels, error } = await publicdb
                .from('channels')
                .select('*')
                .eq('channel_id', radChannelId)
                .eq('type', 'rad')
                .eq('active', true);

            if (!channels || channels.length != 1) return undefined;

            this.channelAccounts.set(radChannelId, channels[0]);
            channel = channels[0];
            account_id = channel.account_id;
        }

        let storedAuthorizations = this.userAuthorizations.get(radUserId);
        let userAuthorization = storedAuthorizations?.find(x => x.account_id == account_id);
        
        if (userAuthorization) {
            return userAuthorization;
        } else {
            const { data: authorizations, error } = await publicdb
                .from('user_authorizations')
                .select('*')
                .eq('type', 'rad')
                .eq('authorized_identifier', radUserId);

            if (!authorizations) return undefined;
            this.userAuthorizations.set(radUserId, authorizations);
            return authorizations?.find(x => x.account_id == account_id);
        }
    }

    public async initBots() {
        try {
            const { data: radBots, error } = await publicdb
                .from('bots')
                .select('*')
                .eq("active", true)
                .limit(27);

            if (error) {
                log('Error fetching RAD bots from Supabase:', error);
                return;
            }

            if (!radBots || radBots.length == 0) {
                log('No RAD bots found in Supabase config');
                return;
            }

            radBots.forEach((bot) => {
                if (bot.active) {
                    this.initRadBot(bot);
                }
            });
        } catch (error) {
            log('Error initializing RAD bots:', error);
        }
    }

    private initRadBot(bot: any) {
        const existingConnection = this.radConnections.get(bot.id);
        if (existingConnection && existingConnection.connected) {
            return;
        } else if (existingConnection) {
            existingConnection.disconnect();
            this.radConnections.delete(bot.id);
        }

        this.connectToRadServer(bot);
    }

    private connectToRadServer(bot: any) {
        const socket = io(this.config.url, {
            auth: {
                token: this.config.authToken,
                botId: bot.id,
                botName: bot.name
            },
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: this.config.maxReconnectAttempts,
            reconnectionDelay: this.config.reconnectInterval
        });

        socket.on('connect', () => {
            log(`RAD Bot ${bot.name} connected to chat server at ${this.config.url}`);
            this.reconnectAttempts.set(bot.id, 0);
            
            // Join relevant channels for this bot
            this.joinBotChannels(socket, bot);
        });

        socket.on('disconnect', (reason) => {
            log(`RAD Bot ${bot.name} disconnected: ${reason}`);
            this.handleReconnection(bot);
        });

        socket.on('chat_message', async (message: RadChatMessage) => {
            await this.handleRadMessage(message, bot);
        });

        socket.on('user_joined', (data: { channelId: string; userId: string; username: string }) => {
            log(`User ${data.username} joined RAD channel ${data.channelId}`);
        });

        socket.on('user_left', (data: { channelId: string; userId: string; username: string }) => {
            log(`User ${data.username} left RAD channel ${data.channelId}`);
        });

        socket.on('error', (error) => {
            log(`RAD Bot ${bot.name} socket error:`, error);
        });

        this.radConnections.set(bot.id, socket);
    }

    private async joinBotChannels(socket: Socket, bot: any) {
        // Get channels this bot should join based on configuration
        const { data: channels, error } = await publicdb
            .from('channels')
            .select('*')
            .eq('type', 'rad')
            .eq('is_active', true);

        if (channels && !error) {
            channels.forEach(channel => {
                socket.emit('join_channel', {
                    channelId: channel.channel_id,
                    channelName: `rad-channel-${channel.channel_id}`
                });
                log(`RAD Bot ${bot.name} joined channel: ${channel.channel_id}`);
            });
        }
    }

    private async handleRadMessage(message: RadChatMessage, bot: any) {
        try {
            // Check if message mentions this bot
            if (!this.isBotMentioned(message, bot)) {
                return;
            }

            const userAuthorization = await this.getAccountAuthorizationForChannelAndUser(message);
            
            if (!userAuthorization) {
                // Handle unauthorized user
                await this.handleUnauthorizedUser(message, bot);
                return;
            }

            const isListening = userAuthorization !== undefined;
            const authorizedAccountId = userAuthorization.account_id;

            if (isListening) {
                const eventId = generateEventId();
                log(`RAD Message received for ${bot.name} (Event ID: ${eventId}): ${message.message}`);

                const channelProjects = (await configManager.getProjects(authorizedAccountId))
                .filter(p => p.radChannelIds && Array.isArray(p.radChannelIds) && p.radChannelIds.includes(message.channelId))
                .map(p => p.name);

                const radBotEvent = new RadBotEvent({
                    id: generateEventId(),
                    account_id: authorizedAccountId,
                    message: message,
                    channelProjects
                });

                const botInstance = await configManager.getInstanceForBot(authorizedAccountId, bot.id);
                if (!botInstance) {
                    log(`Bot Instance not found for bot ${bot.name}`);
                    return;
                }

                apiServer.handleBotFlow(botInstance, radBotEvent);
            }
        } catch (error) {
            log(`Error handling RAD message:`, error);
        }
    }

    private isBotMentioned(message: RadChatMessage, bot: any): boolean {
        // Check if message contains bot mention
        // Format could be @botName or other mention syntax
        const mentionPattern = new RegExp(`@${bot.name}\\b|\\b${bot.name}\\b`, 'i');
        return mentionPattern.test(message.message);
    }

    private async handleUnauthorizedUser(message: RadChatMessage, bot: any) {
        try {
            // Check if user has admin permissions or if channel is already authorized
            const isChannelAuthorized = message.channelId && this.channelAccounts.has(message.channelId);
            const isUserAdmin = message.metadata?.isAdmin || false;

            if (isUserAdmin || isChannelAuthorized) {
                const signedLink = this.generateSignedLink(
                    message.userId,
                    message.channelId,
                    message.projectId,
                    message.stagingUrl,
                    message.username
                );

                // Send authorization message to RAD chat
                const socket = this.radConnections.get(bot.id);
                if (socket) {
                    socket.emit('send_message', {
                        channelId: message.channelId,
                        message: `Hi ${message.username}! To authorize this RAD chat for bot access, please visit: ${signedLink}\n\nThis link will expire in 1 hour.`,
                        type: 'system'
                    });
                }

                log(`Sent authorization link to RAD user ${message.userId} for channel ${message.channelId}`);
            } else {
                // Send unauthorized message
                const socket = this.radConnections.get(bot.id);
                if (socket) {
                    socket.emit('send_message', {
                        channelId: message.channelId,
                        message: `Hi ${message.username}! You need admin permissions to authorize this bot. Please ask a workspace administrator to mention the bot first.`,
                        type: 'system'
                    });
                }
            }
        } catch (error) {
            log(`Error handling unauthorized RAD user:`, error);
        }
    }

    private handleReconnection(bot: any) {
        const attempts = this.reconnectAttempts.get(bot.id) || 0;
        
        if (attempts < this.config.maxReconnectAttempts) {
            this.reconnectAttempts.set(bot.id, attempts + 1);
            log(`RAD Bot ${bot.name} will attempt reconnection ${attempts + 1}/${this.config.maxReconnectAttempts}`);
            
            setTimeout(() => {
                this.connectToRadServer(bot);
            }, this.config.reconnectInterval);
        } else {
            log(`RAD Bot ${bot.name} max reconnection attempts reached`);
        }
    }

    public getRadConnection(instance: Bot): Socket | undefined {
        return this.radConnections.get(instance.bot_id);
    }

    public async createStatusMessageIfApplicable(targetInstance: Bot, event: BotEvent): Promise<any | undefined> {
        let statusMessage: any | undefined = undefined;

        if (event instanceof RadBotEvent) {
            let radBotEvent = event as RadBotEvent;
            const socket = this.radConnections.get(targetInstance.bot_id);
            
            if (socket) {
                try {
                    socket.emit('send_message', {
                        channelId: radBotEvent.message.channelId,
                        message: 'Processing...',
                        type: 'system'
                    });
                    statusMessage = { sent: true, timestamp: new Date() };
                } catch (error) {
                    console.error('Error sending status message to RAD chat:', error);
                }
            }
        } else if (event instanceof DelegationBotEvent) {
            let commsEvent = event.commsEvent;
            if (commsEvent instanceof RadBotEvent) {
                let radCommsEvent = commsEvent as RadBotEvent;
                const socket = this.radConnections.get(targetInstance.bot_id);
                
                if (socket) {
                    try {
                        socket.emit('send_message', {
                            channelId: radCommsEvent.message.channelId,
                            message: 'Received Delegation Request - Processing...',
                            type: 'system'
                        });
                        statusMessage = { sent: true, timestamp: new Date() };
                    } catch (error) {
                        console.error('Error sending delegation status message to RAD chat:', error);
                    }
                }
            } else {
                console.error('No originating comms event found for delegation event', event);
            }
        }
        
        return statusMessage;
    }
}

export default new RadManager();