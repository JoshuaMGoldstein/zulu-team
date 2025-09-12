import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WSDocker } from '../src/utils/wsdocker';
import { WorkflowContext, WorkflowManager } from '../src/workflowmanager';
import * as fs from 'fs';
import * as path from 'path';

describe('WorkflowManager with WSDocker', () => {
  let docker: WSDocker;
  let workflowManager: WorkflowManager;

  beforeEach(async () => {
    // Load environment variables from .env file
    require('dotenv').config();
    
    docker = new WSDocker();
    workflowManager = new WorkflowManager();
    
    // Start a real container for tests
    await docker.run('test-container', 'gemini-docker');
    
    // Clean the workspace directory inside the container    
    await docker.exec('test-container', 'rm -rf /workspace/test-project', {user:"root"});
  });

  afterEach(async () => {
    // Clean up the container after each test
    try { 
      await docker.rm('test-container');
    } catch(e) {
      //Ignore if container doesn't exist
    }
    await new Promise(resolve => setTimeout(resolve, 2500)); //await container reboot
  });

  describe('install-git-key workflow', () => {
    it('should install SSH key correctly', async () => {
      // Use real SSH key from gitkeys.json
      const gitKeys = JSON.parse(fs.readFileSync(path.join(__dirname, '../../bot-instances/gitkeys.json'), 'utf-8'));
      const sshKey = gitKeys[0]; // Use the first key
      
      // Decode the base64 encoded private key
      const decodedPrivateKey = Buffer.from(sshKey.privateKey, 'base64').toString('utf-8');
      
      const context = {
        containerName: 'test-container',
        docker: docker,
        args: {
          SSH_KEY_PATH: sshKey.id,
          KEY_FILENAME: 'id_ed25519'
        },
        files: {
          [sshKey.id]: decodedPrivateKey
        },
        env: {},
        user: 'git',
        workdir: '/workspace'
      };
      
      // Execute the workflow
      await workflowManager.executeWorkflow('install-git-key', context);
      
      // Check if the SSH key file was created (as git user)
      const keyCheckResult = await docker.exec('test-container', '[ -f "/home/git/.ssh/id_ed25519" ] && echo "exists" || echo "not found"', { user: 'git' });
      expect(keyCheckResult.stdout.trim()).toBe('exists');
      
      // Check if SSH config was created (as git user)
      const configCheckResult = await docker.exec('test-container', '[ -f "/home/git/.ssh/config" ] && echo "exists" || echo "not found"', { user: 'git' });
      expect(configCheckResult.stdout.trim()).toBe('exists');
    });
  });

  describe('clone-project workflow', () => {
    it('should setup SSH and prepare for cloning', async () => {
      // Use real SSH key from gitkeys.json
      const gitKeys = JSON.parse(fs.readFileSync(path.join(__dirname, '../../bot-instances/gitkeys.json'), 'utf-8'));
      const sshKey = gitKeys[0]; // Use the first key
      
      // Decode the base64 encoded private key
      const decodedPrivateKey = Buffer.from(sshKey.privateKey, 'base64').toString('utf-8');
      
      // Use real project info from projects.json
      const projects = JSON.parse(fs.readFileSync(path.join(__dirname, '../../bot-instances/projects.json'), 'utf-8'));
      const testProject = projects.find((p: any) => p.name === 'test');
      
      // Use SSH URL instead of HTTPS for proper SSH key authentication
      const sshRepoUrl = testProject.repositoryUrl;
      
      const context = {
        containerName: 'test-container',
        docker: docker,
        args: {
          REPO_URL: sshRepoUrl,
          BRANCH_NAME: '', // Remove branch specification to use default branch
          SSH_KEY_PATH: sshKey.id,
          PROJECT_NAME: 'test-project',
          KEY_FILENAME: sshKey.id
        },
        files: {
          [sshKey.id]: decodedPrivateKey
        },
        env: {},
        user: 'exec',
        workdir: '/workspace'
      };
      
      // Execute the full workflow including the FROM directive
      await workflowManager.executeWorkflow('clone-project', context, true);
      
      // Check if repository was cloned to the correct subdirectory
      const repoCheckResult = await docker.exec('test-container', '[ -d "/workspace/test-project/.git" ] && echo "exists" || echo "not found"', { user: 'exec' });
      expect(repoCheckResult.stdout.trim()).toBe('exists');
    });
  });

  describe('set-branch workflow', () => {
    it('should create a test repo and checkout a branch', async () => {
      // Use real project info from projects.json
      const projects = JSON.parse(fs.readFileSync(path.join(__dirname, '../../bot-instances/projects.json'), 'utf-8'));
      const testProject = projects.find((p: any) => p.name === 'test');
      
      // Load SSH keys from gitkeys.json
      const sshKeys = JSON.parse(fs.readFileSync(path.join(__dirname, '../../bot-instances/gitkeys.json'), 'utf-8'));
      const sshKey = sshKeys[0]; // Use the first key for testing
      
      // Decode the private key
      const decodedPrivateKey = Buffer.from(sshKey.privateKey, 'base64').toString('utf-8');
      
      // Use SSH URL instead of HTTPS for proper SSH key authentication
      const sshRepoUrl = testProject.repositoryUrl;
      
      const context = {
        containerName: 'test-container',
        docker: docker,
        args: {
          BRANCH_NAME: 'test-branch',
          REPO_URL: sshRepoUrl,
          SSH_KEY_PATH: sshKey.id,
          PROJECT_NAME: 'test-project',
          KEY_FILENAME: sshKey.id
        },
        files: {
          [sshKey.id]: decodedPrivateKey
        },
        env: {},
        user: 'exec',
        workdir: '/workspace/test-project'
      };
      
      // Execute the workflow with correct working directory
      await workflowManager.executeWorkflow('clone-project', context, true);
      await workflowManager.executeWorkflow('set-branch', context);
      
      // Check current branch - the workflow should have created a new local branch tracking the remote
      const result = await docker.exec('test-container', 'cd /workspace/test-project && git branch --show-current', {user: 'git'});
      expect(result.stdout.trim()).toBe('test-branch');
    });
  });

  describe('push-branch workflow', () => {
    it('should push a branch with upstream tracking', async () => {
      // Use real project info from projects.json
      const projects = JSON.parse(fs.readFileSync(path.join(__dirname, '../../bot-instances/projects.json'), 'utf-8'));
      const testProject = projects.find((p: any) => p.name === 'test');
      
      // Load SSH keys from gitkeys.json
      const sshKeys = JSON.parse(fs.readFileSync(path.join(__dirname, '../../bot-instances/gitkeys.json'), 'utf-8'));
      const sshKey = sshKeys[0]; // Use the first key for testing
      
      // Decode the private key
      const decodedPrivateKey = Buffer.from(sshKey.privateKey, 'base64').toString('utf-8');
      
      // Use SSH URL instead of HTTPS for proper SSH key authentication
      const sshRepoUrl = testProject.repositoryUrl.replace('https://github.com/', 'git@github.com:');
      
      // Context with all necessary arguments
      const context:WorkflowContext = {
        containerName: 'test-container',
        docker: docker,
        args: {
          BRANCH_NAME: 'test-branch',
          REPO_URL: sshRepoUrl,
          SSH_KEY_PATH: sshKey.id,
          PROJECT_NAME: 'test-project',
          KEY_FILENAME: sshKey.id
        },
        files: {
          [sshKey.id]: decodedPrivateKey
        },
        env: {},
        user: 'git',
        workdir: '/workspace/test-project'
      };
      
      // First, set up the environment by running the set-branch workflow
      await workflowManager.executeWorkflow('clone-project', context);
      await workflowManager.executeWorkflow('set-branch', context);
      
      context.user = 'exec'; 
      context.args['FILENAME'] = 'count.txt';
      await workflowManager.executeWorkflow('touch-increment-file', context);

      context.args['COMMIT_MESSAGE'] = 'Test commit';

      let workflowResult = await workflowManager.executeWorkflow('commit-all', context);      
      let commit_hash = workflowResult.stdout[workflowResult.stdout.length-1];
      expect(commit_hash).toBeDefined();
      expect(commit_hash).toBeTypeOf("string");
      //get output.messages[output.messages.length-1] which contains the commit hash

      // Update context for push-branch (remove unnecessary args)
      const pushContext = {
        ...context,
        user: 'git',
        args: {
          BRANCH_NAME: 'test-branch',
          PROJECT_NAME: 'test-project',
          COMMIT_HASH: commit_hash          
        },
        files: {}
      };
      
      // Execute the workflow with correct working directory
      await workflowManager.executeWorkflow('push-branch', pushContext);
      
      // Check if branch has upstream tracking set
      const result = await docker.exec('test-container', 'cd /workspace/test-project && git rev-parse --abbrev-ref --symbolic-full-name @{u}', {user: 'git'});
      expect(result.stdout.trim()).toBe('origin/test-branch');
    });
  });
});