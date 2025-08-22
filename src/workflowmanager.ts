import * as fs from 'fs';
import * as path from 'path';
import { log } from './utils/log';
import { IDocker, ExecOptions } from './utils/idocker';

export interface WorkflowStep {
  type: 'ARG' | 'USER' | 'ENV' | 'COPY' | 'WORKDIR' | 'RUN';
  args: string[];
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
   * Process workflow content to handle line continuations with backslash
   */
  private processMultilineContent(content: string): string[] {
    const lines = content.split('\n');
    const processedLines: string[] = [];
    let currentLine = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        if (currentLine) {
          processedLines.push(currentLine.trim());
          currentLine = '';
        }
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
      
      const [command, ...args] = trimmedLine.split(/\s+/);
      if (command) {
        steps.push({
          type: command.toUpperCase() as WorkflowStep['type'],
          args
        });
      }
    }
    
    return steps;
  }

  /**
   * Substitute variables in a string
   */
  private substituteVariables(str: string, context: WorkflowContext): string {
    // Substitute ARG variables
    for (const [key, value] of Object.entries(context.args)) {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      str = str.replace(regex, value);
    }
    
    // Substitute environment variables
    for (const [key, value] of Object.entries(context.env)) {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      str = str.replace(regex, value);
    }
    
    return str;
  }

  /**
   * Execute a workflow by name
   */
  public async executeWorkflow(
    workflowName: string,
    context: WorkflowContext,
    executeFromSteps: boolean = true
  ): Promise<void> {
    const workflowPath = path.join(this.workflowsPath, `${workflowName}.workflow`);
    
    if (!fs.existsSync(workflowPath)) {
      throw new Error(`Workflow ${workflowName} not found at ${workflowPath}`);
    }
    
    const content = fs.readFileSync(workflowPath, 'utf-8');
    const lines = content.split('\n');
    
    // Check for FROM directive (should be first line if present)
    let stepsStartIndex = 0;
    if (executeFromSteps && lines[0] && lines[0].trim().toUpperCase().startsWith('FROM ')) {
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
    
    for (const step of steps) {
      await this.executeStep(step, context);
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(step: WorkflowStep, context: WorkflowContext): Promise<void> {
    log(`Executing step: ${step.type} ${step.args.join(' ')}`);
    
    // Create a copy of the step with substituted variables
    const substitutedArgs = step.args.map(arg => this.substituteVariables(arg, context));
    const substitutedStep: WorkflowStep = {
      type: step.type,
      args: substitutedArgs
    };
    
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
        await this.handleRun(substitutedStep, context);
        break;
      default:
        throw new Error(`Unknown workflow step type: ${substitutedStep.type}`);
    }
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
      context.args[parts[0]] = parts[1];
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
      await context.docker.fsWriteFile(context.containerName, destination, content, undefined, { user: context.user });
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
  private async handleRun(step: WorkflowStep, context: WorkflowContext): Promise<void> {
    const command = step.args.join(' ');
    // For RUN commands, we don't pass files since they should already be written to the container
    const result = await context.docker.exec(context.containerName, command, {
      user: context.user,
      cwd: context.workdir,
      env: context.env
    });
    
    if (result.exitCode !== 0) {
      throw new Error(`Command failed with exit code ${result.exitCode}: ${result.stderr || result.stdout}`);
    }
  }
}

export default new WorkflowManager();