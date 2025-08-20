# Gemini Docker Server Protocol

This server provides a WebSocket-based protocol for executing commands as different users within a Docker container, specifically designed for Git operations and AI-assisted development workflows.

## WebSocket Endpoint

**URL:** `ws://localhost:8088/ws`
**Cloud URL**: `wss://zulu-gemini-docker-364383558242.us-east4.run.app/ws`

**Query Parameters:**
- `clientid`: Unique client identifier
- `token`: Authentication token

## Protocol Format

### Connection
Clients establish a WebSocket connection with the required query parameters.

### Command Execution
Commands are sent as JSON messages with the following structure:

```json
{
  "command": "git clone git@github.com:user/repo /workspace/project",
  "user": "git",
  "cwd": "/workspace",
  "env": {},
  "files": {
    "~/.ssh/id_rsa": "base64-encoded-ssh-key"
  }  
}
```

### INITIAL STDIN
```json
Additionally, it is possible to pass initial STDIN to the process by specifying it as follows. The STDIN will be terminated with the EOF signal similar using child.stdin.write(message) child.stdin.end()  on the server.
{
  "command": "gemini --autosave --resume --model 'kimi-k2-turbo-preview'",
  "user": "exec",
  "cwd": "/workspace/test-project",
  "env": {},  
  "stdin": "please create or update count.txt in the /workspace/test-project/ git repository and commit it with the message: 'updated count!'"
}
```


### Response Format
The server responds with JSON messages indicating command execution status. Note it will send "type": "error" instead, if it fails to spawn the process.

```json
{
  "type": "open",
  "pid": 123
}

{
  "type": "stdout",
  "data": "Cloning into 'project'...",
  "pid": 123
}

{
  "type": "stderr",
  "data": "error message",
  "pid": 123
}

{
  "type": "stdclose",
  "data": "0",
  "pid": 123
}
```

## STDIN

It is possible to follow up to an existing open PID by sending a stdin message as follows
```json
{
  "type": "stdin",
  "data": "message to send",
  "pid": 123
}
```


## Supported Users

- **git**: Git operations (clone, commit, push)
- **exec**: General command execution and AI tool usage

## Directory Structure

- `/workspace`: Shared workspace directory with workspace group permissions
- `/home/git`: Git user home directory
- `/home/exec`: Exec user home directory

## Security Model

- Uses workspace group (gid 2000) for shared directory access
- SSH keys configured for GitHub access
- Safe directory configuration for git operations
- User switching via `su - [user]` for command execution

## Example Workflow

### 1. Clone Repository
**WebSocket Message:**
```json
{
  "command": "git clone git@github.com:JoshuaMGoldstein/devteam-test /workspace/test-project",
  "user": "git",
  "cwd": "/workspace",
  "env": {},
  "files": {
    "~/.ssh/id_rsa": "base64-encoded-ssh-key"
  }
}
```

### 2. Checkout Branch
**WebSocket Message:**
```json
{
  "command": "cd /workspace/test-project && git fetch && git checkout -b test origin/test && git pull",
  "user": "git",
  "cwd": "/workspace/test-project",
  "env": {},
  "files": {
    "~/.ssh/id_rsa": "base64-encoded-ssh-key"
  }
}
```

### 3. Fix Permissions
**WebSocket Message:**
```json
{
  "command": "chmod -R g+srwx /workspace/test-project",
  "user": "git",
  "cwd": "/workspace/test-project",
  "env": {},
  "files": {}
}
```

### 4. AI-Assisted Development
**WebSocket Message:**
```json
{
  "command": "cd /workspace/test-project && gemini --model 'kimi-k2-turbo-preview' --yolo --prompt 'please create or update count.txt in the /workspace/test-project/ git repository and commit it with the message: updated count!'",
  "user": "exec",
  "cwd": "/workspace/test-project",
  "env": {
    "OPENAI_BASE_URL": "https://api.openai.com/v1",
    "OPENAI_API_KEY": "your-api-key",
    "GEMINI_API_KEY": "your-api-key",
    "HOME": "/home/exec",
    "XDG_CONFIG_HOME": "/home/exec/.config"
  },
  "files": {}
}
```

### 5. Git Push
**WebSocket Message:**
```json
{
  "command": "cd /workspace/test-project && git push -u origin test",
  "user": "git",
  "cwd": "/workspace/test-project",
  "env": {},
  "files": {
    "~/.ssh/id_rsa": "base64-encoded-ssh-key"
  }
}
```

## Error Handling

- Exit codes are returned in `stdclose` messages
- Permission errors are handled via workspace group membership
- SSH key authentication for Git operations
- Safe directory configuration prevents git security warnings