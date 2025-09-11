import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import workflowManager from '../src/workflowmanager';
import dockerManager from '../src/dockermanager';
import configManager from '../src/configmanager';
import { WSDocker } from '../src/utils/wsdocker';
import { WorkflowContext } from '../src/workflowmanager';
import * as fs from 'fs';
import * as path from 'path';

describe('WorkflowManager with WSDocker - Deployment Workflows', () => {
  let docker: WSDocker;
  const testContainer = 'test-deployment-container';

  beforeEach(async () => {
    // Load environment variables from .env file
    require('dotenv').config();
    
    docker = new WSDocker();
    
    // Start a real container for tests
    await docker.run(testContainer, 'buildserver-docker');
    
    // Clean the workspace directory inside the container    
    await docker.exec(testContainer, 'rm -rf /workspace/test-project', {user:"root"});
    await docker.exec(testContainer, 'mkdir /workspace/test-project', {user:"git"});
    await docker.exec(testContainer, 'rm -rf /workspace/integration-test-project', {user:"root"});
    await docker.exec(testContainer, 'mkdir /workspace/integration-test-project', {user:"git"});
  });

  afterEach(async () => {
    try {
      await docker.rm(testContainer);
    } catch (error) {
      // Container might not exist, that's okay
    }
    await new Promise(resolve => setTimeout(resolve, 2500)); //await container reboot
  });

  describe('upload-secrets workflow', () => {
    it('should upload secrets to Google Secret Manager', async () => {
      // Create a test secrets content
      const secretsContent = 'API_KEY=test123\nDATABASE_URL=postgres://localhost/test\nSECRET_KEY=supersecret';

      const context: WorkflowContext = {
        containerName: testContainer,
        docker: docker,
        args: {
          ACCOUNT_ID: '12345',
          PROJECT_NAME: 'test-project',
          ENVIRONMENT: 'dev',
          SECRETS_CONTENT: secretsContent
        },
        files: {},
        env: {},
        user: 'git',
        workdir: '/workspace'
      };

      try {
        const result = await workflowManager.executeWorkflow('upload-secrets', context);
        
        console.log("RESUKT: "+JSON.stringify(result));   
        // Verify the workflow completed successfully
        expect(result.exitCode).toBe(0);             
        expect(JSON.stringify(result.stdout)).toContain('account12345-test-project-ENVFILE-dev');
        
        console.log('Upload secrets result:', result);
      } catch(e) {
        console.error('Upload secrets failed:', e);
        throw e;
      }
    });
  });

  describe('build-image workflow', () => {
    it('should build a image in the cloud artifact repository', async () => {
      // Use real SSH key from gitkeys.json
      const gitKeys = JSON.parse(fs.readFileSync(path.join(__dirname, '../bot-instances/gitkeys.json'), 'utf-8'));
      const sshKey = gitKeys[0]; // Use the first key
      
      // Decode the base64 encoded private key
      const decodedPrivateKey = Buffer.from(sshKey.privateKey, 'base64').toString('utf-8');
      
      // Use real project info from projects.json
      //const projects = JSON.parse(fs.readFileSync(path.join(__dirname, '../bot-instances/projects.json'), 'utf-8'));
      //const testProject = projects.find((p: any) => p.name === 'zulu-www');
      const account_id = 'b9955f70-eeb0-4ba6-85a6-4f7e0e1f85b2';
      let project = 'traefik-proxy';
      const projectObject = (await configManager.getProjects(account_id)).find(p => p.name === project);
      if(projectObject == null) throw new Error(`Project ${project} not found`);
      const cloudbuildJson = fs.readFileSync(path.join(__dirname, '../blueprints/cloudbuild.json'), 'utf-8');
      const cloudbuildNoSecretsJson = fs.readFileSync(path.join(__dirname, '../blueprints/cloudbuild-nosecrets.json'), 'utf-8');
       /*JSON.stringify({
        "steps": [
          {
            "name": "gcr.io/cloud-builders/docker",
            "args": ["build", "-t", "us-east4-docker.pkg.dev/zulu-team/account${ACCOUNT_ID}/${PROJECT_NAME}:${BRANCH_NAME}-latest", "."],
            "env": ["DOCKER_BUILDKIT=1"]
          }
        ],
        "images": ["us-east4-docker.pkg.dev/zulu-team/account${ACCOUNT_ID}/${PROJECT_NAME}:${BRANCH_NAME}-latest"],
        "serviceAccount": "projects/zulu-team/serviceAccounts/gcloud-build@zulu-team.iam.gserviceaccount.com",
        "options": {
          "defaultLogsBucketBehavior": "REGIONAL_USER_OWNED_BUCKET"
        }
      });*/
          
      // Use SSH URL instead of HTTPS for proper SSH key authentication
      const sshRepoUrl = projectObject.repositoryUrl.replace('https://github.com/', 'git@github.com:');

      const context: WorkflowContext = {
        containerName: testContainer,
        docker: docker,
        args: {
          REPO_URL: sshRepoUrl,
          PROJECT_NAME: project,
          BRANCH_NAME: 'master',
          ENVIRONMENT: 'staging',
          ACCOUNT_ID: account_id,
          SSH_KEY_PATH: sshKey.id,
          KEY_FILENAME: sshKey.id
        },
        files: {
          'cloudbuild.json': cloudbuildJson,
          'cloudbuild-nosecrets.json': cloudbuildNoSecretsJson,
          [sshKey.id]: decodedPrivateKey
        },
        env: {
          GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'
        },
        user: 'git',
        workdir: '/workspace'
      };

      const result = await workflowManager.executeWorkflow('build-image', context);
      
      // Verify the workflow completed successfully
      expect(result.exitCode).toBe(0);
      console.log('Build image result:', result);
    });
  });

  describe('get-environment-url workflow', () => {
    it('should retrieve the URL for a deployed environment', async () => {
      const context: WorkflowContext = {
        containerName: testContainer,
        docker: docker,
        args: {
          PROJECT_NAME: 'test',
          ACCOUNT_ID: 'b9955f70-eeb0-4ba6-85a6-4f7e0e1f85b2',
          BRANCH_NAME: 'master',
          ENVIRONMENT: 'staging',
        },
        files: {},
        env: {},
        user: 'git',
        workdir: '/workspace'
      };

      const result = await workflowManager.executeWorkflow('get-environment-url', context);
      
      // Verify the workflow completed successfully
      expect(result.exitCode).toBe(0);
      console.log('Get environment URL result:', result);
    });
  });

  describe('test-environment workflow', () => {
    it('should test a deployed environment', async () => {
      const context: WorkflowContext = {
        containerName: testContainer,
        docker: docker,
        args: {
          PROJECT_NAME: 'test',
          ACCOUNT_ID: 'b9955f70-eeb0-4ba6-85a6-4f7e0e1f85b2',
          BRANCH_NAME: 'master',
          ENVIRONMENT: 'staging',
          TEST_COMMAND: 'curl -f ${SERVICE_URL}/health || echo "Health check not available"'
        },
        files: {},
        env: {},
        user: 'git',
        workdir: '/workspace/test-project'
      };

      const result = await workflowManager.executeWorkflow('test-environment', context);
      
      // Verify the workflow completed successfully
      expect(result.exitCode).toBe(0);
      console.log('Test environment result:', result);
    });
  });

  describe('deploy-service workflow', () => {
    it('should deploy a Cloud Run service', async () => {
      // Use the same parameters as the build-image test to ensure the image exists
      const accountId = 'b9955f70-eeb0-4ba6-85a6-4f7e0e1f85b2';
      const projectName = 'traefik-proxy';
      const environment = 'staging';
      const branchName = 'master';
      
      // The image name should match what was built in the build-image test
      const imageName = `${projectName}:${branchName}-latest`;

      const context: WorkflowContext = {
        containerName: testContainer,
        docker: docker,
        args: {
          ACCOUNT_ID: accountId,
          PROJECT_NAME: projectName,
          ENVIRONMENT: environment,
          IMAGE_NAME: imageName
        },
        files: {},
        env: {},
        user: 'git',
        workdir: `/workspace/${projectName}`
      };

      const result = await workflowManager.executeWorkflow('deploy-service', context);
      
      // Verify the workflow completed successfully
      expect(result.exitCode).toBe(0);
      expect(JSON.stringify(result.stdout)).toContain(`${accountId}-${projectName}-${environment}`);
      console.log('Deploy service result:', result);
    });
  });

});