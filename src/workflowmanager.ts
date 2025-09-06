import { envsubParser, SYNTAX } from './utils/envsub';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './utils/log';
import { IDocker, ExecOptions, ExecResult } from './utils/idocker';
import { publicdb } from './supabase';
import {Bot} from './bots/types'
import configManager from './configmanager'
import { config } from 'dotenv';

export interface WorkflowStep {
  type: 'ARG' | 'USER' | 'ENV' | 'COPY' | 'WORKDIR' | 'RUN';
  args: string[];
}

export interface WorkflowResult {
  exitCode: number,
  stdout: string[] //the final stdout may be useful as a result if a return value is needed, such as a commit-hash  
  stderr: string[]
}

export interface WorkflowContext {
  containerName: string;
  docker: IDocker;
  args: Record<string, string>;
  files: Record<string, string|Buffer>;
  env: Record<string, string>;
  user: string;
  workdir: string;
}

export class WorkflowManager {
  private workflowsPath: string;

  constructor() {
    this.workflowsPath = path.join(__dirname, '../workflows');
    // Ensure workflows directory exists
    if (!fs.existsSync(this.workflowsPath)) {
      fs.mkdirSync(this.workflowsPath, { recursive: true });
    }
  }

  /**
   * Build a context for GCSFuse mounting with all necessary arguments and files
   **/
  public async buildGCSFuseContexts(docker:IDocker, containerName: string, instance: Bot): Promise<WorkflowContext[]> {
        const account = await configManager.getAccount(instance.account_id);
        if(!account) throw new Error("Account not found "+instance.account_id);

        const serviceAccount = await configManager.getServiceAccount(instance.account_id);

        if(!account.defaultBucketId) throw new Error ("Account "+instance.account_id + " has no default bucket -- cannot build GCSFuseContext");

        let bucket = account.buckets?.find(x=>x.id == account.defaultBucketId);

        if(!bucket) throw new Error (`Default bucket ${account.defaultBucketId} not found for account ${instance.account_id}`);
        
        let cxt = {
          user: "root",
          files: {
            'service-account-key.json': JSON.stringify(serviceAccount)         // Add service account key
          },
          args: {},
          containerName: containerName,
          workdir: '/root',
          docker: docker,
          env: {
            "GOOGLE_APPLICATION_CREDENTIALS": "/root/service-account-key.json"
          }
        };

        let cxts = [];


        //Always mount the homedir/.gemini folder for the bot so we can have conversation histories stored.
        
        const args = {
          ACCOUNT_ID: instance.account_id,
          BUCKET_NAME: bucket.bucket_name,
          SUB_PATH: `bot-instances/${instance.id}/homedir/.gemini`,
          MOUNT_POINT: "/home/exec/.gemini",
          READ_ONLY: ""
        }
        
        cxt.args = args;
        cxts.push(cxt);

        //Mount default bucket for both RO Access to bot-instances - IF the bot has this privilege
        let appliedSettings = await configManager.getBotInstanceAppliedSettings(instance);
        if(appliedSettings.mountBotInstances) {
          const args2: Record<string, string> = {
            ACCOUNT_ID: instance.account_id,
            BUCKET_NAME: bucket.bucket_name,
            SUB_PATH: "bot-instances",
            MOUNT_POINT: "/workspace/bot-instances",
            READ_ONLY: "true"          
          };
          const cxt2 = Object.assign({}, cxt);
          cxt2.args = args2;
          cxts.push(cxt2);
        }


        // Add GCS mounts
        /*if (account.mounts && account.mounts.length > 0) {
            // runOptions.privileged = true; // GCS FUSE mounts might not require privileged containers with --execution-environment=gen2
            for (const mount of account.mounts) {
                const bucket = account.buckets.find(b => b.id === mount.bucket_id);
                if (bucket) {
                    execOptions.volumes![`gs://${bucket.bucket_name}${mount.gcs_path}`] = mount.container_path;
                }
            }
        }*/

        return cxts;
  }


  /**
   * Build a context for Git-based workflows with all necessary arguments and files
   */
  public async buildGitContext(docker: IDocker, containerName: string, project: any, branch?: string, commit_hash?:string): Promise<WorkflowContext> {
    // Fetch git key data from database using project.account_id
    const { data: gitKeys, error: gitKeysError } = await publicdb
      .from('git_keys')
      .select('*')
      .eq('account_id', project.account_id);
    
    if (gitKeysError || !gitKeys || gitKeys.length === 0) {
      throw new Error(`No git keys found for account ${project.account_id}`);
    }
    
    const sshKey = gitKeys.find((key: any) => key.id === project.git_key_id) || gitKeys[0];
    
    // Decode the base64 encoded private key
    if (!sshKey.private_key) {
      throw new Error(`No private key found for git key ${sshKey.id}`);
    }
    const decodedPrivateKey = Buffer.from(sshKey.private_key, 'base64').toString('utf-8');
    
    const args: Record<string, string> = {
      REPO_URL: project.repositoryUrl,
      PROJECT_NAME: project.name,
      SSH_KEY_PATH: sshKey.id,
      KEY_FILENAME: sshKey.id,
      ACCOUNT_ID: project.account_id || 'default',
      PROJECT_ID: project.name
    };
    
    if (branch) {
      args.BRANCH_NAME = branch;
    }
    if(commit_hash) {
      args.COMMIT_HASH = commit_hash;
    }
    
    return {
      containerName,
      docker,
      args,
      files: {
        [sshKey.id]: decodedPrivateKey
      },
      env: {
        GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'
      },
      user: 'git',
      workdir: '/workspace'
    };
  }

  /**
   * Process workflow content to handle line continuations with backslash
   */
  private processMultilineContent(content: string): string[] {
    const lines = content.split('\n');
    const processedLines: string[] = [];
    let currentLine = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) {
        if (currentLine) {
          processedLines.push(currentLine.trim());
          currentLine = '';
        }
        continue;
      }
      
      // Skip comments
      if (trimmedLine.startsWith('#')) {
        continue;
      }
      
      // Check for line continuation with backslash
      if (line.endsWith('\\')) {
        // Remove the backslash and add to current line
        currentLine += line.slice(0, -1) + ' ';
      } else {
        // End of current line
        currentLine += line;
        processedLines.push(currentLine.trim());
        currentLine = '';
      }
    }
    
    // Handle any remaining line
    if (currentLine.trim()) {
      processedLines.push(currentLine.trim());
    }
    
    return processedLines;
  }

  /**
   * Parse a workflow file into steps with multiline support
   */
  private parseWorkflow(content: string): WorkflowStep[] {
    const processedLines = this.processMultilineContent(content);
    const steps: WorkflowStep[] = [];
    
    for (const line of processedLines) {
      const trimmedLine = line.trim();
      
      // Skip FROM directive as it's handled separately
      if (trimmedLine.toUpperCase().startsWith('FROM ')) {
        continue;
      }
      
      const firstSpaceIndex = trimmedLine.indexOf(' ');
      const command = firstSpaceIndex === -1 ? trimmedLine : trimmedLine.substring(0, firstSpaceIndex);
      const rawArgs = firstSpaceIndex === -1 ? '' : trimmedLine.substring(firstSpaceIndex + 1).trim();

      if (command) {
        steps.push({
          type: command.toUpperCase() as WorkflowStep['type'],
          args: [rawArgs] // Store as a single raw argument string
        });
      }
    }
    
    return steps;
  }

  /**
   * Substitute variables in a string using envsubParser
   */
  private substituteVariables(str: string, context: WorkflowContext): string {
    const variables = { ...context.env, ...context.args };
    return envsubParser(str, { options: { env: variables, syntax: SYNTAX.DOLLAR_BOTH } });
  }

  /**
   * Execute a workflow by name
   */
  public async executeWorkflow(
    workflowName: string,
    context: WorkflowContext,
    includeFromSteps: boolean = true
  ): Promise<WorkflowResult> {
    const workflowPath = path.join(this.workflowsPath, `${workflowName}.workflow`);
    
    if (!fs.existsSync(workflowPath)) {
      throw new Error(`Workflow ${workflowName} not found at ${workflowPath}`);
    }
    
    const content = fs.readFileSync(workflowPath, 'utf-8');
    const lines = content.split('\n');
    
    // Check for FROM directive (should be first line if present)
    let stepsStartIndex = 0;
    if (includeFromSteps && lines[0] && lines[0].trim().toUpperCase().startsWith('FROM ')) {
      const baseWorkflow = lines[0].trim().substring(5).trim(); // Extract workflow name after FROM
      stepsStartIndex = 1; // Skip the FROM line when parsing steps
      
      // Handle special case of 'scratch' - it's an empty base workflow
      if (baseWorkflow !== 'scratch') {
        log(`Executing base workflow: ${baseWorkflow} for ${workflowName}`);
        // Execute the base workflow with the same context
        await this.executeWorkflow(baseWorkflow, context, true);
      }
    }
    
    const stepsContent = lines.slice(stepsStartIndex).join('\n');
    const steps = this.parseWorkflow(stepsContent);
    
    log(`Executing workflow: ${workflowName} with ${steps.length} steps`);
    

    let workflowResult:WorkflowResult = {
      exitCode:0,
      stdout: [],
      stderr: []
    }

    for (const step of steps) {
      let result = await this.executeStep(step, context);
      if(result) {
        workflowResult.exitCode = result.exitCode;
        if(result.stdout) workflowResult.stdout.push(result.stdout);
        if(result.stderr) workflowResult.stderr.push(result.stderr);
      }

    }

    return workflowResult;
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(step: WorkflowStep, context: WorkflowContext): Promise<ExecResult|undefined> {
    
    
    const rawArgs = step.args[0] || ''; // Get the single raw argument string
    let finalArgs: string[];

    // Apply substitution only for specific step types
    if (['ARG', 'ENV', 'COPY', 'WORKDIR'].includes(step.type)) {
      const substitutedRawArgs = this.substituteVariables(rawArgs, context);
      finalArgs = substitutedRawArgs.split(/\s+/).filter(arg => arg !== '');
    } else {
      finalArgs = rawArgs.split(/\s+/).filter(arg => arg !== '');
    }

    const substitutedStep: WorkflowStep = {
      type: step.type,
      args: finalArgs
    };



    let value = substitutedStep.type== 'ARG'? context.args[substitutedStep.args.join(' ')] : '';
    log(`Executing step: ${substitutedStep.type} ${substitutedStep.args.join(' ')} ${value?'('+value+')':''}`);
    
    switch (substitutedStep.type) {
      case 'ARG':
        this.handleArg(substitutedStep, context);
        
        break;
      case 'USER':
        this.handleUser(substitutedStep, context);
        break;
      case 'ENV':
        this.handleEnv(substitutedStep, context);
        break;
      case 'COPY':
        await this.handleCopy(substitutedStep, context);
        break;
      case 'WORKDIR':
        this.handleWorkdir(substitutedStep, context);
        break;
      case 'RUN':
        let result = await this.handleRun(substitutedStep, context);
        return result;
        break;
      default:
        throw new Error(`Unknown workflow step type: ${substitutedStep.type}`);
    }
    return undefined;
  }

  /**
   * Handle ARG step - set argument values
   */
  private handleArg(step: WorkflowStep, context: WorkflowContext): void {
    if (step.args.length < 1) {
      throw new Error('ARG step requires at least 1 argument: name[=value]');
    }
    
    const arg = step.args[0];
    const parts = arg.split('=');
    if (parts.length === 2) {
      // ARG NAME=value format
      if(typeof context.args[parts[0]] === "undefined") {
        context.args[parts[0]] = parts[1];
      }
    } else {
      // ARG NAME format - value should come from context.args
      // If not present, leave it as is (will be substituted later)
    }
  }

  /**
   * Handle USER step - set user for subsequent commands
   */
  private handleUser(step: WorkflowStep, context: WorkflowContext): void {
    if (step.args.length < 1) {
      throw new Error('USER step requires at least 1 argument: username');
    }
    
    context.user = step.args[0];
  }

  /**
   * Handle ENV step - set environment variables
   */
  private handleEnv(step: WorkflowStep, context: WorkflowContext): void {
    if (step.args.length < 2) {
      throw new Error('ENV step requires at least 2 arguments: key and value');
    }
    
    const [key, value] = step.args;
    context.env[key] = value;
  }

  /**
   * Handle COPY step - copy files to container
   */
  private async handleCopy(step: WorkflowStep, context: WorkflowContext): Promise<void> {
    if (step.args.length < 2) {
      throw new Error('COPY step requires at least 2 arguments: source and destination');
    }
    
    const [source, destination] = step.args;
    
    // Check if source is in the provided files
    if (context.files[source]) {
      const content = context.files[source];
      // Respect the current working directory and expand ~/
      let resolvedDestination = destination;
      if (destination.startsWith('~/') || destination.startsWith('/')) {
        resolvedDestination = destination;
      } else if (!path.posix.isAbsolute(destination)) {
        resolvedDestination = path.posix.join(context.workdir || '~/', destination);
      }
      await context.docker.fsWriteFile(context.containerName, resolvedDestination, content, undefined, { user: context.user });
    } else {
      throw new Error(`COPY source ${source} not found in provided files`);
    }
  }

  /**
   * Handle WORKDIR step - set working directory
   */
  private handleWorkdir(step: WorkflowStep, context: WorkflowContext): void {
    if (step.args.length < 1) {
      throw new Error('WORKDIR step requires at least 1 argument: directory path');
    }
    
    context.workdir = step.args[0];
  }

  /**
   * Handle RUN step - execute command in container
   */
  private async handleRun(step: WorkflowStep, context: WorkflowContext): Promise<ExecResult> {
    const command = step.args.join(' ');
    // For RUN commands, we don't pass files since they should already be written to the container
    const result = await context.docker.exec(context.containerName, command, {
      user: context.user,
      cwd: context.workdir,
      env: { ...context.env, ...context.args }
    });
    
    if (result.exitCode !== 0) {
      throw new Error(`Command failed with exit code ${result.exitCode}: ${result.stderr || result.stdout}`);
    }

    return result;
  }
}

export default new WorkflowManager();