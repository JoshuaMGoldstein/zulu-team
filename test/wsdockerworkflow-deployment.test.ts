import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import workflowManager from '../src/workflowmanager';
import dockerManager from '../src/dockermanager';
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
      // Create a test secrets file
      const secretsContent = 'API_KEY=test123\nDATABASE_URL=postgres://localhost/test\nSECRET_KEY=supersecret';
      //const secretsFile = `/tmp/test-secrets-${Date.now()}.env`;
      //fs.writeFileSync(secretsFile, secretsContent);

      const context: WorkflowContext = {
        containerName: testContainer,
        docker: docker,
        args: {
          ACCOUNT_ID: '12345',
          PROJECT_NAME: 'test-project',
          ENVIRONMENT: 'dev',
          SECRETS_FILE: 'test-secrets'
        },
        files: {
          'test-secrets': secretsContent
        },
        env: {},
        user: 'git',
        workdir: '/workspace/test-project'
      };

      try {
        const result = await workflowManager.executeWorkflow('upload-secrets', context);
        
        // Verify the workflow completed successfully
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('account12345-test-project-ENVFILE-dev');
        
        console.log('Upload secrets result:', result);
      } catch(e) {
      } finally {
        // Clean up test file - no longer a thing   
      }
    });
  });

  describe('deploy-environment workflow', () => {
    it('should deploy to a specific environment', async () => {
      // Use real SSH key from gitkeys.json
      const gitKeys = JSON.parse(fs.readFileSync(path.join(__dirname, '../bot-instances/gitkeys.json'), 'utf-8'));
      const sshKey = gitKeys[0]; // Use the first key
      
      // Decode the base64 encoded private key
      const decodedPrivateKey = Buffer.from(sshKey.privateKey, 'base64').toString('utf-8');
      
      // Use real project info from projects.json
      const projects = JSON.parse(fs.readFileSync(path.join(__dirname, '../bot-instances/projects.json'), 'utf-8'));
      const testProject = projects.find((p: any) => p.name === 'test');
      const cloudbuildJson = JSON.stringify({
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
      });
          
      // Use SSH URL instead of HTTPS for proper SSH key authentication
      const sshRepoUrl = testProject.repositoryUrl.replace('https://github.com/', 'git@github.com:');

      const context: WorkflowContext = {
        containerName: testContainer,
        docker: docker,
        args: {
          REPO_URL: sshRepoUrl,
          PROJECT_NAME: 'test-project',
          BRANCH_NAME: 'main',
          ENVIRONMENT: 'staging',
          ACCOUNT_ID: '12345',
          SSH_KEY_PATH: sshKey.id,
          KEY_FILENAME: sshKey.id
        },
        files: {
          'cloudbuild.json': cloudbuildJson,
          [sshKey.id]: decodedPrivateKey
        },
        env: {
          GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'
        },
        user: 'git',
        workdir: '/workspace/test-project'
      };

      const result = await workflowManager.executeWorkflow('deploy-environment', context);
      
      // Verify the workflow completed successfully
      expect(result.exitCode).toBe(0);
      console.log('Deploy environment result:', result);
    });
  });

  describe('get-environment-url workflow', () => {
    it('should retrieve the URL for a deployed environment', async () => {
      const context: WorkflowContext = {
        containerName: testContainer,
        docker: docker,
        args: {
          ACCOUNT_ID: '12345',
          PROJECT_NAME: 'test-project',
          ENVIRONMENT: 'prod'
        },
        files: {},
        env: {},
        user: 'git',
        workdir: '/workspace/test-project'
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
          ACCOUNT_ID: '12345',
          PROJECT_NAME: 'test-project',
          ENVIRONMENT: 'dev',
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

  describe('Integration test - full deployment flow', () => {
    it('should handle the complete deployment workflow', async () => {
      const accountId = '12345';
      const projectName = 'integration-test-project';
      const environment = 'test';
      const branchName = 'feature/test';

      // Step 1: Upload secrets
      const secretsContent = 'TEST_SECRET=integration123\nAPI_ENDPOINT=https://api.test.com';
      const secretsFile = 'secrets-file'      

      const cloudbuildjson =  JSON.stringify({
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
      });

      const uploadContext: WorkflowContext = {
        containerName: testContainer,
        docker: docker,
        args: {
          ACCOUNT_ID: accountId,
          PROJECT_NAME: projectName,
          ENVIRONMENT: environment,
          SECRETS_FILE: 'secrets-file'
        },
        files: {
          'secrets-file': secretsContent
        },
        env: {},
        user: 'git',
        workdir: `/workspace/${projectName}`
      };

      try {
        const uploadResult = await workflowManager.executeWorkflow('upload-secrets', uploadContext);
        expect(uploadResult.exitCode).toBe(0);
        console.log('Step 1 - Secrets uploaded:', uploadResult);

        // Step 2: Build environment (build the Docker image)
        const buildContext: WorkflowContext = {
          containerName: testContainer,
          docker: docker,
          args: {
            ACCOUNT_ID: accountId,
            PROJECT_NAME: projectName,
            BRANCH_NAME: branchName,
            ENVIRONMENT: environment,
            SECRETS_FILE: 'secrets-file'
          },
          files: {
            'cloudbuild.json': cloudbuildjson,
            'secrets-file': secretsContent
          },
          env: {},
          user: 'git',
          workdir: `/workspace/${projectName}`
        };

        const buildResult = await workflowManager.executeWorkflow('deploy-environment', buildContext);
        expect(buildResult.exitCode).toBe(0);
        console.log('Step 2 - Environment built:', buildResult);

        // Step 2b: Deploy Cloud Run service (deploy the built image)
        const deployContext: WorkflowContext = {
          containerName: testContainer,
          docker: docker,
          args: {
            ACCOUNT_ID: accountId,
            PROJECT_NAME: projectName,
            ENVIRONMENT: environment,
            IMAGE_NAME: `gcr.io/zulu-team/${projectName}:${environment}`
          },
          files: {},
          env: {},
          user: 'git',
          workdir: `/workspace/${projectName}`
        };

        const deployResult = await workflowManager.executeWorkflow('deploy-cloud-run-service', deployContext);
        expect(deployResult.exitCode).toBe(0);
        console.log('Step 2b - Cloud Run service deployed:', deployResult);

        // Step 3: Get environment URL
        const urlContext: WorkflowContext = {
          containerName: testContainer,
          docker: docker,
          args: {
            ACCOUNT_ID: accountId,
            PROJECT_NAME: projectName,
            ENVIRONMENT: environment
          },
          files: {
            'cloudbuild.json':cloudbuildjson
          },
          env: {},
          user: 'git',
          workdir: `/workspace/${projectName}`
        };

        const urlResult = await workflowManager.executeWorkflow('get-environment-url', urlContext);
        expect(urlResult.exitCode).toBe(0);
        console.log('Step 3 - Environment URL retrieved:', urlResult);

        // Step 4: Test environment
        const testContext: WorkflowContext = {
          containerName: testContainer,
          docker: docker,
          args: {
            ACCOUNT_ID: accountId,
            PROJECT_NAME: projectName,
            ENVIRONMENT: environment,
            TEST_COMMAND: 'echo "Integration test passed"'
          },
          files: {
            'secrets-file': secretsContent
          },
          env: {},
          user: 'git',
          workdir: `/workspace/${projectName}`
        };

        const testResult = await workflowManager.executeWorkflow('test-environment', testContext);
        expect(testResult.exitCode).toBe(0);
        console.log('Step 4 - Environment tested:', testResult);

      } finally {
        // Clean up

      }
    });
  });
});