// Multi-platform integration example showing how to use Discord, Slack, Teams, and RAD managers together

import discordManager from './discordmanager';
import slackManager from './slackmanager';
import teamsManager from './msftteamsmanager';
import radManager from './radmanager';
import { log } from './utils/log';

/**
 * Multi-platform bot manager that coordinates across Discord, Slack, Teams, and RAD Chat
 */
class MultiPlatformManager {
    
    /**
     * Initialize all platform managers
     */
    public async initialize() {
        log('Initializing multi-platform bot managers...');
        
        // Discord manager is already initialized via singleton pattern
        log('Discord manager initialized');
        
        // Slack manager is already initialized via singleton pattern  
        log('Slack manager initialized');
        
        // Teams manager is already initialized via singleton pattern
        log('Teams manager initialized');
        
        // RAD manager is already initialized via singleton pattern
        log('RAD manager initialized');
        
        log('All platform managers ready');
    }

    /**
     * Get the appropriate manager based on platform type
     */
    public getManager(platform: 'discord' | 'slack' | 'teams' | 'rad') {
        switch (platform) {
            case 'discord':
                return discordManager;
            case 'slack':
                return slackManager;
            case 'teams':
                return teamsManager;
            case 'rad':
                return radManager;
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
    }

    /**
     * Send status message across all platforms for a bot instance
     */
    public async sendStatusMessage(botInstance: any, event: any, message: string) {
        const results = [];
        
        // Try Discord
        try {
            const discordResult = await discordManager.createStatusMessageIfApplicable(botInstance, event);
            if (discordResult) {
                results.push({ platform: 'discord', result: discordResult });
            }
        } catch (error) {
            log('Error sending Discord status message:', error);
        }
        
        // Try Slack
        try {
            const slackResult = await slackManager.createStatusMessageIfApplicable(botInstance, event);
            if (slackResult) {
                results.push({ platform: 'slack', result: slackResult });
            }
        } catch (error) {
            log('Error sending Slack status message:', error);
        }
        
        // Try Teams
        try {
            const teamsResult = await teamsManager.createStatusMessageIfApplicable(botInstance, event);
            if (teamsResult) {
                results.push({ platform: 'teams', result: teamsResult });
            }
        } catch (error) {
            log('Error sending Teams status message:', error);
        }

        // Try RAD Chat
        try {
            const radResult = await radManager.createStatusMessageIfApplicable(botInstance, event);
            if (radResult) {
                results.push({ platform: 'rad', result: radResult });
            }
        } catch (error) {
            log('Error sending RAD status message:', error);
        }
        
        return results;
    }

    /**
     * Get client/adapter for a specific bot across platforms
     */
    public getClient(botInstance: any, platform: 'discord' | 'slack' | 'teams' | 'rad') {
        const manager = this.getManager(platform);
        
        switch (platform) {
            case 'discord':
                return (manager as any).getDiscordClient?.(botInstance);
            case 'slack':
                return (manager as any).getSlackClient?.(botInstance);
            case 'teams':
                return (manager as any).getTeamsAdapter?.(botInstance);
            case 'rad':
                return (manager as any).getRadConnection?.(botInstance);
            default:
                return null;
        }
    }

    /**
     * Get all active connections for a bot instance
     */
    public getAllConnections(botInstance: any) {
        const connections: { [key: string]: any } = {};
        
        try {
            connections.discord = (discordManager as any).getDiscordClient?.(botInstance);
        } catch (error) {
            log('Error getting Discord connection:', error);
        }
        
        try {
            connections.slack = (slackManager as any).getSlackClient?.(botInstance);
        } catch (error) {
            log('Error getting Slack connection:', error);
        }
        
        try {
            connections.teams = (teamsManager as any).getTeamsAdapter?.(botInstance);
        } catch (error) {
            log('Error getting Teams connection:', error);
        }

        try {
            connections.rad = (radManager as any).getRadConnection?.(botInstance);
        } catch (error) {
            log('Error getting RAD connection:', error);
        }
        
        return connections;
    }

    /**
     * Broadcast message to all platforms where bot is active
     */
    public async broadcastMessage(botInstance: any, message: string, options?: {
        excludePlatforms?: string[];
        includePlatforms?: string[];
    }) {
        const results = [];
        const platforms = ['discord', 'slack', 'teams', 'rad'];
        
        for (const platform of platforms) {
            if (options?.excludePlatforms?.includes(platform)) continue;
            if (options?.includePlatforms && !options.includePlatforms.includes(platform)) continue;
            
            try {
                const client = this.getClient(botInstance, platform as any);
                if (client) {
                    // Platform-specific message sending logic would go here
                    results.push({ platform, status: 'sent', client });
                }
            } catch (error) {
                results.push({ platform, status: 'error', error: (error as Error).message });
            }
        }
        
        return results;
    }

    /**
     * Get platform-specific channel information
     */
    public getChannelInfo(platform: 'discord' | 'slack' | 'teams' | 'rad', channelId: string) {
        const manager = this.getManager(platform);
        
        // Each manager would need to implement getChannelInfo method
        if (typeof (manager as any).getChannelInfo === 'function') {
            return (manager as any).getChannelInfo(channelId);
        }
        
        return null;
    }
}

// Export singleton instance
export default new MultiPlatformManager();

/**
 * Example usage in your main application:
 * 
 * ```typescript
 * import multiPlatformManager from './multiplatform-integration';
 * 
 * // Initialize all platforms
 * await multiPlatformManager.initialize();
 * 
 * // Get Discord client for a bot
 * const discordClient = multiPlatformManager.getClient(botInstance, 'discord');
 * 
 * // Get RAD chat connection for a bot
 * const radConnection = multiPlatformManager.getClient(botInstance, 'rad');
 * 
 * // Send status message across all platforms
 * const results = await multiPlatformManager.sendStatusMessage(
 *   botInstance, 
 *   event, 
 *   'Processing your request...'
 * );
 * 
 * // Broadcast message to specific platforms
 * const broadcastResults = await multiPlatformManager.broadcastMessage(
 *   botInstance,
 *   'Hello from all platforms!',
 *   { includePlatforms: ['discord', 'rad'] }
 * );
 * 
 * // Get all connections for a bot
 * const allConnections = multiPlatformManager.getAllConnections(botInstance);
 * ```
 */

/**
 * Environment Variables Required:
 * 
 * Discord:
 * - DISCORD_BOT_TOKEN (already in discordmanager.ts)
 * 
 * Slack:
 * - SLACK_BOT_TOKEN (for WebClient authentication)
 * - SLACK_SIGNING_SECRET (for event verification)
 * 
 * Teams:
 * - TEAMS_BOT_APP_ID (Microsoft App ID)
 * - TEAMS_BOT_APP_PASSWORD (Microsoft App Password)
 * 
 * RAD Chat:
 * - RAD_CHAT_SERVER_URL (RAD chat server URL)
 * - RAD_CHAT_AUTH_TOKEN (RAD chat authentication token)
 * 
 * Common:
 * - ZULU_LINK_SECRET (for signed link generation)
 * - ZULU_WWW_URL (for authorization links)
 */