# Git Hooks Setup for Zulu Team Bots

This guide explains how to set up git hooks for automatic post-commit notifications to the Zulu Team API server.

## Overview

The post-commit hook automatically notifies the Zulu Team API server when code is committed by bots, triggering the push workflow to remote repositories. This ensures that all bot commits are properly synchronized.

## Setup Instructions

### 1. Git Template Configuration

The hooks should be set up in the git template directory so they're automatically applied to all cloned repositories. Add this to your Dockerfile:

```dockerfile
# Set up git template with post-commit hook
RUN mkdir -p /usr/share/git-core/templates/hooks

# Create the post-commit hook
RUN cat > /usr/share/git-core/templates/hooks/post-commit << 'EOF'
#!/bin/bash
set -e

# Only run for bot instances (check for required environment variables)
if [ -z "$INSTANCE_ID" ] || [ -z "$API_KEY" ] || [ -z "$EVENT_ID" ]; then
    exit 0
fi

# Get the current branch and commit hash
BRANCH=$(git branch --show-current)
COMMIT_HASH=$(git rev-parse HEAD)

# Determine the project name from the directory
PROJECT_DIR=$(basename "$PWD")

# Map directory to project name (handle both regular and metadata directories)
if [[ "$PROJECT_DIR" == *"-metadata" ]]; then
    PROJECT_NAME="${PROJECT_DIR%-metadata}"
    DIRECTORY="/workspace/${PROJECT_DIR}"
else
    PROJECT_NAME="$PROJECT_DIR"
    DIRECTORY="/workspace/${PROJECT_DIR}"
fi

# API endpoint (adjust if API server runs on different port/host)
API_URL="http://localhost:3001/postcommit"

# Make the API call
curl -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "X-Instance-Id: $INSTANCE_ID" \
    -H "X-Event-Id: $EVENT_ID" \
    -H "X-API-Key: $API_KEY" \
    -d "{
        \"project\": \"$PROJECT_NAME\",
        \"branch\": \"$BRANCH\",
        \"commit_hash\": \"$COMMIT_HASH\",
        \"directory\": \"$DIRECTORY\"
    }" || true

EOF

# Make the hook executable
RUN chmod +x /usr/share/git-core/templates/hooks/post-commit

# Set git to use our template directory
RUN git config --global init.templateDir /usr/share/git-core/templates
```

### 2. Environment Variables

Ensure your bot instances have these environment variables set:

```bash
INSTANCE_ID=your-instance-id
API_KEY=your-api-key
EVENT_ID=your-event-id
```

These are typically set in your bot instance configuration.

### 3. Required Tools

The post-commit hook requires `curl` to be available in the container. Add this to your Dockerfile:

```dockerfile
RUN apt-get update && apt-get install -y curl
```

### 4. Git Configuration

The hook will automatically be applied to all repositories cloned after the template is set up. For existing repositories, you can manually copy the hook:

```bash
cp /usr/share/git-core/templates/hooks/post-commit /workspace/your-project/.git/hooks/
```

## How It Works

1. **Trigger**: The hook runs automatically after each `git commit` command
2. **Validation**: Checks that required environment variables are present
3. **Information Gathering**: Extracts branch name, commit hash, and project name
4. **API Call**: Sends the commit information to the Zulu Team API server
5. **Push Workflow**: The API server triggers the git push workflow to remote repositories

## Supported Directory Structures

The hook supports two directory patterns:

- `/workspace/{project}` - Main project directory
- `/workspace/{project}-metadata` - Metadata directory for the project

## API Endpoint

The hook calls the `/postcommit` endpoint on the API server with:

- **Headers**:
  - `X-Instance-Id`: Bot instance ID
  - `X-Event-Id`: Current event ID
  - `X-API-Key`: Instance API key
  - `Content-Type: application/json`

- **Body**:
  ```json
  {
    "project": "project-name",
    "branch": "branch-name", 
    "commit_hash": "abc123...",
    "directory": "/workspace/project-name"
  }
  ```

## Error Handling

- The hook runs with `|| true` to prevent git commit failures if the API call fails
- API validation includes:
  - Instance authentication
  - Project existence verification
  - Directory path validation
  - Required field validation

## Testing

To test the hook manually:

```bash
# Set up environment variables
export INSTANCE_ID=test-instance
export API_KEY=test-key  
export EVENT_ID=test-event

# Navigate to a project directory
cd /workspace/my-project

# Make a change and commit
echo "test" >> test.txt
git add test.txt
git commit -m "Test commit"

# Check API server logs for the post-commit processing
```

## Troubleshooting

1. **Hook not running**: Check that the hook is executable and in the correct location
2. **API call failing**: Verify API server is running and environment variables are set
3. **Push failures**: Check git credentials and remote repository access
4. **Directory not recognized**: Ensure directory follows expected naming patterns

## Security Considerations

- API keys are validated against instance configuration
- Only commits from authenticated bot instances are processed
- Directory paths are validated to prevent path traversal attacks
- The hook only runs when required environment variables are present