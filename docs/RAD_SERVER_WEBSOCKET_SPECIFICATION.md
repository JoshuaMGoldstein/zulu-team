# RAD Server WebSocket Specification

## Overview

This specification defines the exact WebSocket messages required for communication between the RadManager (zulu-team) and the RAD Chat Server. The RAD Server only needs to implement these specific WebSocket messages - no REST endpoints are required.

## Connection

### Connection URL
```
ws://rad-server:3002/socket.io/?token=<auth_token>&botId=<bot_id>&botName=<bot_name>
```

### Connection Parameters
- `token`: Authentication token (optional, from RAD_CHAT_AUTH_TOKEN env var)
- `botId`: Bot instance ID from zulu-team database
- `botName`: Bot display name

## Message Protocol

All messages use Socket.IO event names with JSON payloads.

### Client → Server (RadManager → RAD Server)

#### 1. Join Channel
**Event**: `join_channel`
**Purpose**: Bot joins a channel to receive messages
**Payload**:
```json
{
  "channelId": "channel-uuid-or-name",
  "channelName": "human-readable-channel-name"
}
```

#### 2. Send Message
**Event**: `send_message`
**Purpose**: Bot sends a message to a channel
**Payload**:
```json
{
  "channelId": "channel-uuid-or-name",
  "message": "message content",
  "type": "system" | "bot_response" | "text"
}
```

#### 3. Update Message (Optional)
**Event**: `update_message`
**Purpose**: Bot updates an existing message
**Payload**:
```json
{
  "messageId": "message-uuid",
  "channelId": "channel-uuid-or-name",
  "message": "updated message content"
}
```

#### 4. Typing Indicator (Optional)
**Event**: `typing_start`
**Purpose**: Bot indicates it's typing/generating response
**Payload**:
```json
{
  "channelId": "channel-uuid-or-name"
}
```

#### 5. Typing Stop (Optional)
**Event**: `typing_stop`
**Purpose**: Bot stops typing indicator
**Payload**:
```json
{
  "channelId": "channel-uuid-or-name"
}
```

### Server → Client (RAD Server → RadManager)

#### 1. Chat Message
**Event**: `chat_message`
**Purpose**: User sent a message in a channel
**Payload**:
```json
{
  "id": "message-uuid",
  "channelId": "channel-uuid-or-name",
  "userId": "user-uuid-or-id",
  "username": "display-name",
  "message": "message content",
  "timestamp": 1640995200000,
  "channelName": "human-readable-name",
  "channelType": "staging" | "development" | "production",
  "environment": "staging-url-or-env-name",
  "projectId": "project-uuid",
  "stagingUrl": "https://staging-site.com",
  "metadata": {
    "oauthProvider": "google" | "github" | "etc",
    "oauthEmail": "user@example.com",
    "permissions": ["read", "write", "admin"],
    "isAdmin": false
  }
}
```

#### 2. Connection Status
**Event**: `connect`
**Purpose**: Connection established
**Payload**: Socket.IO standard connection event (no custom payload)

#### 3. Disconnection
**Event**: `disconnect`
**Purpose**: Connection lost
**Payload**: Socket.IO standard disconnection event with reason

#### 4. User Joined (Optional)
**Event**: `user_joined`
**Purpose**: User joined the channel
**Payload**:
```json
{
  "channelId": "channel-uuid-or-name",
  "userId": "user-uuid-or-id",
  "username": "display-name"
}
```

#### 5. User Left (Optional)
**Event**: `user_left`
**Purpose**: User left the channel
**Payload**:
```json
{
  "channelId": "channel-uuid-or-name",
  "userId": "user-uuid-or-id",
  "username": "display-name"
}
```

#### 6. Error
**Event**: `error`
**Purpose**: Server error occurred
**Payload**:
```json
{
  "error": "error message",
  "code": "ERROR_CODE"
}
```

## Message Flow Examples

### Bot Receives User Message
```
1. User types: "@bot-name deploy the latest changes"
2. Server sends: chat_message { id: "msg-123", channelId: "channel-1", userId: "user-456", username: "Alice", message: "@bot-name deploy the latest changes", ... }
3. RadManager processes message and triggers bot flow
```

### Bot Sends Response
```
1. Bot generates response: "Deploying changes..."
2. RadManager sends: send_message { channelId: "channel-1", message: "Deploying changes...", type: "bot_response" }
3. Server broadcasts to all users in channel
```

### Bot Updates Status
```
1. Bot starts processing: sends typing_start { channelId: "channel-1" }
2. Bot completes: sends typing_stop { channelId: "channel-1" }
3. Bot sends final message: send_message { channelId: "channel-1", message: "Deployment complete!", type: "bot_response" }
```

## Required Server Implementation

### 1. Socket.IO Setup
```javascript
const io = require('socket.io')(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  const { token, botId, botName } = socket.handshake.auth;
  
  // Handle bot authentication
  if (botId) {
    handleBotConnection(socket, botId, botName);
  }
});
```

### 2. Message Handler
```javascript
function handleBotConnection(socket, botId, botName) {
  // Join bot to its configured channels
  socket.on('join_channel', (data) => {
    socket.join(`channel:${data.channelId}`);
    console.log(`Bot ${botName} joined channel ${data.channelId}`);
  });
  
  // Handle bot messages
  socket.on('send_message', (data) => {
    // Broadcast to all users in channel
    socket.to(`channel:${data.channelId}`).emit('chat_message', {
      id: generateMessageId(),
      channelId: data.channelId,
      userId: botId,
      username: botName,
      message: data.message,
      timestamp: Date.now(),
      type: data.type || 'bot_response'
    });
  });
  
  // Handle user messages and forward to bot
  socket.on('user_message', (data) => {
    // Check if message mentions bot
    if (data.message.includes(`@${botName}`)) {
      socket.emit('chat_message', {
        id: data.id,
        channelId: data.channelId,
        userId: data.userId,
        username: data.username,
        message: data.message,
        timestamp: data.timestamp,
        // Include all required fields from chat_message spec
        ...data
      });
    }
  });
}
```

### 3. User Message Broadcasting
When a user sends a message, the server must:
1. Check if message mentions any bots
2. Forward matching messages to those bots via `chat_message` event
3. Store message in database (optional)
4. Broadcast to other users in channel

## Error Handling

### Connection Errors
- Invalid authentication: Disconnect with error message
- Network issues: Automatic reconnection (handled by Socket.IO)
- Server errors: Send `error` event with details

### Message Errors
- Invalid channel: Send error event
- Missing required fields: Send error event
- Rate limiting: Send error event with retry time

## Security Considerations

1. **Authentication**: Validate bot tokens on connection
2. **Channel Access**: Verify bot has permission to join channels
3. **Rate Limiting**: Implement message rate limits per bot
4. **Input Validation**: Sanitize all message content
5. **CORS**: Configure appropriate CORS settings

## Testing

### Basic Connection Test
```javascript
const socket = io('ws://localhost:3002', {
  auth: { botId: 'test-bot', botName: 'TestBot' }
});

socket.on('connect', () => {
  console.log('Connected');
  socket.emit('join_channel', { channelId: 'test-channel' });
});

socket.on('chat_message', (data) => {
  console.log('Received message:', data);
});
```

### Message Echo Test
```javascript
// Send a message and verify it comes back
socket.emit('send_message', {
  channelId: 'test-channel',
  message: 'Hello from bot',
  type: 'bot_response'
});
```

## Minimal Implementation Checklist

✅ Socket.IO server setup  
✅ Bot connection handling  
✅ `join_channel` event handler  
✅ `send_message` event handler  
✅ `chat_message` event broadcaster  
✅ User message mention detection  
✅ Basic error handling  

Optional for later: typing indicators, message updates, user join/leave events

This specification provides exactly what RadManager needs to function - no more, no less. The server can be extended later with additional features as needed.