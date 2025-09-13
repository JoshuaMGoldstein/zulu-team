# Multi-Platform Bot Setup Guide

This guide explains how to set up bots across Discord, Slack, and Microsoft Teams platforms.

## Overview

The system now supports three major communication platforms:
- **Discord** (existing)
- **Slack** (new)
- **Microsoft Teams** (new)

Each platform has its own manager that handles authentication, message processing, and integration with the bot system.

## Platform-Specific Setup

### Discord (Existing)
Already configured and working. Uses `discordmanager.ts`.

**Required Environment Variables:**
```bash
DISCORD_BOT_TOKEN=your_discord_bot_token
```

### Slack Setup

**1. Create a Slack App**
- Go to [api.slack.com/apps](https://api.slack.com/apps)
- Click "Create New App" → "From scratch"
- Name your app and select your workspace

**2. Configure Bot Permissions**
- Go to "OAuth & Permissions"
- Add these Bot Token Scopes:
  - `chat:write` - Send messages
  - `chat:write.public` - Send messages to public channels
  - `channels:read` - Read channel information
  - `users:read` - Read user information
  - `channels:history` - Read channel history

**3. Install App to Workspace**
- Click "Install to Workspace"
- Copy the "Bot User OAuth Token"

**4. Configure Event Subscriptions**
- Go to "Event Subscriptions"
- Enable events and set Request URL to your server endpoint
- Subscribe to these bot events:
  - `message.channels` - Channel messages
  - `message.groups` - Private channel messages
  - `message.im` - Direct messages

**5. Environment Variables**
```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
```

### Microsoft Teams Setup

**1. Create a Bot Registration**
- Go to [Azure Portal](https://portal.azure.com)
- Create a "Bot Channels Registration"
- Fill in required information

**2. Get Application Credentials**
- Note the "Microsoft App ID"
- Generate a client secret (save this securely)

**3. Configure Messaging Endpoint**
- Set the messaging endpoint to your server URL
- Format: `https://your-domain.com/api/messages`

**4. Enable Teams Channel**
- In the bot settings, go to "Channels"
- Enable the "Microsoft Teams" channel

**5. Environment Variables**
```bash
TEAMS_BOT_APP_ID=your-app-id
TEAMS_BOT_APP_PASSWORD=your-app-password
```

## Database Schema Updates

The system expects these fields in the database:

### Bots Table
```sql
-- Add platform-specific fields to existing bots table
ALTER TABLE bots ADD COLUMN slack_bot_token TEXT;
ALTER TABLE bots ADD COLUMN teams_bot_app_id TEXT;
ALTER TABLE bots ADD COLUMN teams_bot_app_password TEXT;
```

### Channels Table
The channels table should support all three platforms:
```sql
-- Ensure channels table has proper fields
-- type column should accept: 'discord', 'slack', 'teams'
-- channel_id should store platform-specific IDs
```

### User Authorizations Table
```sql
-- Ensure user_authorizations table supports all platforms
-- type column should accept: 'discord', 'slack', 'teams'
-- authorized_identifier should store platform user IDs
```

## Project Configuration

Projects can now specify channel IDs for each platform:

```typescript
interface Project {
    // ... existing fields
    discordChannelIds: string[],
    slackChannelIds?: string[],    // New
    teamsChannelIds?: string[],    // New
}
```

## Common Environment Variables

All platforms use these shared variables:
```bash
# For signed authorization links
ZULU_LINK_SECRET=your-secret-key
ZULU_WWW_URL=https://your-zulu-www-domain.com

# Database connection (existing)
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Usage Examples

### Initialize All Platforms
```typescript
import multiPlatformManager from './src/multiplatform-integration';

// Initialize all platform managers
await multiPlatformManager.initialize();
```

### Get Platform-Specific Client
```typescript
// Get Discord client
const discordClient = multiPlatformManager.getClient(botInstance, 'discord');

// Get Slack client
const slackClient = multiPlatformManager.getClient(botInstance, 'slack');

// Get Teams adapter
const teamsAdapter = multiPlatformManager.getClient(botInstance, 'teams');
```

### Send Cross-Platform Status Messages
```typescript
const results = await multiPlatformManager.sendStatusMessage(
    botInstance,
    event,
    'Processing your request...'
);
```

## Security Considerations

1. **Bot Tokens**: Store all platform tokens securely, never commit them to code
2. **Signing Secrets**: Use proper signing secrets for webhook verification
3. **Authorization**: The system uses signed links for user authorization across all platforms
4. **Permissions**: Each platform has different permission models - ensure bots have appropriate access

## Troubleshooting

### Slack Issues
- **Token Invalid**: Ensure bot token starts with `xoxb-`
- **Events Not Received**: Check Request URL is accessible and returns challenge correctly
- **Permission Denied**: Verify bot has required scopes in OAuth settings

### Teams Issues
- **App ID Invalid**: Verify App ID from Azure portal
- **Messaging Endpoint**: Ensure endpoint is HTTPS and accessible
- **Channel Not Enabled**: Check Teams channel is enabled in bot settings

### Common Issues
- **Database Connection**: Ensure all platform-specific fields are properly set
- **Authorization Failures**: Check signed link generation and validation
- **Message Delivery**: Verify bot permissions in each platform

## Next Steps

1. Set up platform-specific bot registrations
2. Configure environment variables
3. Update database schema if needed
4. Test each platform individually
5. Enable cross-platform features as needed

The system is designed to be modular - you can enable just the platforms you need while maintaining the same core functionality across all of them.