# RAD Chat Server & Client Specification

## Overview

The RAD (Rapid Application Development) Chat System is an internal chat platform that enables real-time collaboration between team members and AI bots in staging environments. It consists of a Socket.IO-based chat server and a React-based chat client that can be embedded as an iframe in staging sites.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   RAD Client    │    │   RAD Server    │    │   RadManager    │
│   (React/iframe)│◄──►│ (Socket.IO)     │◄──►│ (zulu-team)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                        │                        │
        │                        │                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Staging Site  │    │   Database      │    │   Bot System    │
│   (/RAD iframe) │    │ (Supabase)      │    │   (AI Agents)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## RAD Chat Server Implementation

### Technology Stack
- **Backend**: Node.js with Express and Socket.IO
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: OAuth 2.0 (Google, GitHub, etc.)
- **Real-time**: Socket.IO for bidirectional communication
- **File Storage**: Optional file upload support

### Core Features

#### 1. Real-time Messaging
- Instant message delivery using Socket.IO
- Support for text, markdown, and basic formatting
- Typing indicators
- Message read receipts
- Message editing and deletion

#### 2. Multi-Channel Support
- Project-specific channels
- Staging environment channels
- Direct messaging between users
- Private channels for specific teams

#### 3. OAuth Integration
- Support for multiple OAuth providers
- User profile synchronization
- Permission-based channel access
- Admin role management

#### 4. Bot Integration
- Seamless bot mention detection
- Bot command processing
- Response formatting for bots
- Bot status indicators

#### 5. File Sharing (Optional)
- Image upload and preview
- Code snippet sharing with syntax highlighting
- File attachment support
- Drag-and-drop functionality

### Server API Endpoints

#### Authentication
```javascript
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/user
GET  /api/auth/oauth/:provider
```

#### Channels
```javascript
GET    /api/channels                    // List all channels
POST   /api/channels                    // Create new channel
GET    /api/channels/:id                // Get channel details
PUT    /api/channels/:id                // Update channel
DELETE /api/channels/:id                // Delete channel
POST   /api/channels/:id/join           // Join channel
POST   /api/channels/:id/leave          // Leave channel
```

#### Messages
```javascript
GET  /api/channels/:channelId/messages  // Get message history
POST /api/channels/:channelId/messages  // Send message
PUT  /api/messages/:id                  // Edit message
DELETE /api/messages/:id                // Delete message
```

#### Users
```javascript
GET /api/users                          // List users
GET /api/users/:id                      // Get user profile
PUT /api/users/:id                      // Update user profile
```

### Socket.IO Events

#### Client → Server
```javascript
'connect'                    // Initial connection
'join_channel'               // Join a channel
'leave_channel'              // Leave a channel
'send_message'               // Send a message
'typing_start'               // Start typing indicator
'typing_stop'                // Stop typing indicator
'mark_read'                  // Mark messages as read
'edit_message'               // Edit existing message
'delete_message'             // Delete message
```

#### Server → Client
```javascript
'connect'                    // Connection established
'disconnect'                 // Connection lost
'chat_message'               // New message received
'user_joined'                // User joined channel
'user_left'                  // User left channel
'user_typing'                // User is typing
'message_edited'             // Message was edited
'message_deleted'            // Message was deleted
'channel_updated'            // Channel settings changed
'error'                      // Error occurred
```

### Database Schema

#### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    avatar_url TEXT,
    oauth_provider VARCHAR(50),
    oauth_provider_id VARCHAR(255),
    is_admin BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Channels Table
```sql
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'public', -- public, private, direct
    project_id UUID,
    staging_url TEXT,
    environment VARCHAR(50), -- staging, development, production
    created_by UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Messages Table
```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'text', -- text, system, file, bot_response
    parent_message_id UUID REFERENCES messages(id),
    is_edited BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    metadata JSONB, -- For bot responses, file info, etc.
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Channel Members Table
```sql
CREATE TABLE channel_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- admin, member
    joined_at TIMESTAMP DEFAULT NOW(),
    last_read_at TIMESTAMP,
    UNIQUE(channel_id, user_id)
);
```

## RAD Chat Client Implementation

### Technology Stack
- **Frontend**: React with TypeScript
- **Styling**: Tailwind CSS or styled-components
- **State Management**: React Context or Redux
- **Real-time**: Socket.IO client
- **UI Components**: Headless UI or Material-UI

### Core Components

#### 1. Chat Interface
```typescript
interface ChatInterfaceProps {
    channelId: string;
    stagingUrl?: string;
    projectId?: string;
    isEmbedded?: boolean;
}
```

Features:
- Message list with virtual scrolling
- Message input with markdown support
- Typing indicators
- User avatars and presence
- Message timestamps
- Edit/delete message functionality

#### 2. Channel Sidebar
- Channel list with unread indicators
- User presence indicators
- Channel search and filtering
- Create/join channel functionality

#### 3. User Authentication
- OAuth login buttons
- User profile display
- Permission-based UI elements

#### 4. Bot Integration
- Bot mention autocomplete
- Bot command suggestions
- Bot response formatting
- Bot status indicators

### Client Configuration

#### Environment Variables
```bash
REACT_APP_RAD_SERVER_URL=http://localhost:3002
REACT_APP_STAGING_URL=https://staging-site.com
REACT_APP_PROJECT_ID=project-uuid
REACT_APP_OAUTH_CLIENT_ID=oauth-client-id
```

#### Iframe Integration
```html
<iframe 
    src="https://rad-chat.example.com?stagingUrl=https://staging-site.com&projectId=project-uuid"
    width="400" 
    height="600"
    frameborder="0"
    allow="camera; microphone"
></iframe>
```

### SlashRad Feature

The `/RAD` endpoint on staging sites will serve the chat client as an overlay:

#### Implementation Example
```typescript
// In staging site
const RadChatOverlay = () => {
    const [isOpen, setIsOpen] = useState(false);
    const stagingUrl = window.location.origin;
    const projectId = extractProjectId(stagingUrl);

    return (
        <div className="rad-chat-overlay">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="rad-chat-toggle"
            >
                💬 RAD Chat
            </button>
            
            {isOpen && (
                <div className="rad-chat-container">
                    <iframe
                        src={`${process.env.RAD_CHAT_URL}?stagingUrl=${stagingUrl}&projectId=${projectId}`}
                        className="rad-chat-iframe"
                        title="RAD Chat"
                    />
                </div>
            )}
        </div>
    );
};
```

## Integration with Zulu-Team

### RadManager Integration Points

1. **Message Forwarding**: RadManager receives messages via Socket.IO and forwards them to the bot system
2. **Bot Responses**: Bot responses are sent back through the RAD chat server
3. **Authorization**: Uses the same signed-link system as other platforms
4. **Multi-tenancy**: Supports multiple accounts and projects

### Environment Variables for RadManager
```bash
RAD_CHAT_SERVER_URL=http://localhost:3002
RAD_CHAT_AUTH_TOKEN=your-auth-token
ZULU_LINK_SECRET=your-secret-key
ZULU_WWW_URL=https://zulu-www.warmerise.co
```

## Security Considerations

1. **Authentication**: All users must authenticate via OAuth
2. **Authorization**: Channel-level permissions based on project membership
3. **Rate Limiting**: Implement message rate limiting to prevent spam
4. **Input Validation**: Sanitize all user inputs
5. **CORS**: Proper CORS configuration for iframe embedding
6. **HTTPS**: All communications must be encrypted
7. **Bot Permissions**: Separate permissions for bot actions vs user actions

## Deployment

### Docker Configuration
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3002
CMD ["npm", "start"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  rad-chat-server:
    build: .
    ports:
      - "3002:3002"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/radchat
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=your-jwt-secret
    depends_on:
      - db
      - redis

  db:
    image: postgres:14
    environment:
      - POSTGRES_DB=radchat
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

## Testing

### Unit Tests
- Message formatting
- User authentication
- Channel permissions
- Bot integration

### Integration Tests
- Socket.IO connection handling
- Message persistence
- OAuth flow
- Cross-platform messaging

### Load Testing
- Concurrent user handling
- Message throughput
- Connection stability

## Monitoring

### Metrics to Track
- Active users
- Messages per second
- Connection count
- Response times
- Error rates

### Logging
- User actions
- Bot interactions
- System errors
- Performance metrics

## Future Enhancements

1. **Voice/Video Chat**: WebRTC integration for voice/video calls
2. **Screen Sharing**: Collaborative screen sharing for debugging
3. **Code Editor**: Integrated code editor with live collaboration
4. **AI Assistant**: Built-in AI assistant for development help
5. **Mobile App**: Native mobile applications
6. **File System**: Integrated file system browser for staging sites
7. **Database Browser**: Database query interface for staging databases

## Development Handoff

This specification provides everything needed to implement the RAD Chat Server and Client. The development team should:

1. Set up the basic Socket.IO server structure
2. Implement database models and migrations
3. Create OAuth integration
4. Build the React chat client
5. Implement bot integration endpoints
6. Add security and validation
7. Create the iframe embedding system
8. Test with the RadManager integration

The system should be ready for integration with the existing zulu-team infrastructure and provide a seamless chat experience for rapid application development.