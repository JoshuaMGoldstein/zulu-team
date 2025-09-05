#!/usr/bin/env node

import { WSDocker } from '../src/utils/wsdocker';
import { program } from 'commander';
import * as readline from 'readline';
import * as dotenv from 'dotenv';
import proc from 'process'
import fs from 'fs'
import path from 'path'

// Load environment variables from .env file
dotenv.config();

interface ExecOptions {
  volume?: string[];
  file?: string[];
  env?: string[];
  interactive?: boolean;
  tty?: boolean;
  workdir?: string;
  user?: string;
  name?: string;
}

program
  .name('wsexec')
  .description('Execute commands on WebSocket Docker containers')
  .version('1.0.0')
  .argument('<image>', 'Docker image to run')
  .argument('[command...]', 'Command to execute')
  .option('-v, --volume <volume...>', 'Mount volumes (format: gs://bucket/path:/targetpath)', [])
  .option('-f, --file <file...>', 'Mount files (format: localpath:/targetpath)', [])
  .option('-e, --env <env...>', 'Set environment variables (format: KEY=value)', [])
  .option('-i, --interactive', 'Keep STDIN open for interactive input')
  .option('-t, --tty', 'Allocate a pseudo-TTY')
  .option('-w, --workdir <dir>', 'Working directory inside the container')
  .option('-u, --user <user>', 'User to run the command as')
  .option('--name <name>', 'Container name')
  .action(async (image: string, command: string[], options: ExecOptions) => {
    try {
      const wsDocker = new WSDocker();
      
      const cmd = command.length > 0 ? command : ['/bin/bash'];
      
      //Build files
      const files: Record<string, Buffer|string> = {};

      // Build volumes map
      const volumes: Record<string, string> = {};
      
      // Process volume mounts
      if (options.volume) {
        for (const vol of options.volume) {
          const [source, target] = vol.split(':');
          if (!source || !target) {
            console.error(`Invalid volume format: ${vol}. Use gs://bucket/path:/targetpath`);
            proc.exit(1);
          }
          console.log("Got volume: "+source+":"+target)
          volumes[source] = target;
        }
      }
      
      // Process file mounts
      console.log(options.file);
      if (options.file) {
        for (const file of options.file) {
          if(typeof file !== 'string') {
            console.error(`Invalid file format`);
            proc.exit(1);          
          }
          let fileStr = file as string;
          
          const [source, target] = fileStr.split(':');
          if (!source || !target) {
            console.error(`Invalid file format: ${fileStr}. Use localpath:/targetpath`);
            proc.exit(1);
          }
          console.log("Got file : "+source+":"+target)
          files[target] = fs.readFileSync(path.join(proc.cwd(), source));
        }
      }
      
      // Build environment variables
      const env: Record<string, string> = {};
      if (options.env) {
        for (const envVar of options.env) {
          const [key, ...valueParts] = envVar.split('=');
          const value = valueParts.join('=');
          if (!key || value === undefined) {
            console.error(`Invalid environment format: ${envVar}. Use KEY=value`);
            proc.exit(1);
          }
          env[key] = value;
        }
      }
      
      const containerName = options.name || `wsexec-${Date.now()}`;
      
      // First, run the container
      console.log(`Starting container ${containerName} from image ${image}...`);
      await wsDocker.run(containerName, image, {
        //volumes
        //,workdir: options.workdir
      });
      
      if (options.interactive) {
        // Interactive mode - use spawnExec for streaming
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          prompt: `${containerName}> `
        });
        
        console.log(`Starting interactive session with container ${containerName}...`);
        console.log('Type "exit" to quit\n');
        
        let currentProcess: any = null;
        
        const startInteractive = async () => {
          try {
            const process = await wsDocker.spawnExec(containerName, cmd.join(' '), {
              user: options.user,
              env,
              files,
              cwd: options.workdir
            });
            
            currentProcess = process;
            
            // Handle output
            process.stdout?.on('data', (data) => {
              console.log(data.toString());
            });
            
            process.stderr?.on('data', (data) => {
              console.warn(data.toString());
            });
            
            // Handle user input
            rl.on('line', async (input) => {
              if (input.trim() === 'exit') {
                if (currentProcess) {
                  await wsDocker.rm(containerName, true);
                }
                rl.close();
                proc.exit(0);
              }
              
              if (currentProcess) {
                currentProcess.stdin.write(input + '\n');
              }
            });
            
            // Handle process completion
            process.on('close', (code) => {
              console.log(`\nProcess exited with code ${code}`);
              rl.close();
              wsDocker.rm(containerName, true).then(() => {
                proc.exit(code);
              });
            });
            
            process.on('error', (error) => {
              console.error('Process error:', error);
              rl.close();
              wsDocker.rm(containerName, true);
              proc.exit(1);
            });
            
          } catch (error) {
            console.error('Error starting interactive session:', error);
            rl.close();
            await wsDocker.rm(containerName, true);
            proc.exit(1);
          }
        };
        
        startInteractive();
        
      } else {
        // Non-interactive mode - use exec and get result
        const result = await wsDocker.exec(containerName, cmd.join(' '), {
          user: options.user,
          env,
          files,
          cwd: options.workdir
        });
        
        if (result.stdout) {
          console.log(result.stdout);
        }
        
        if (result.stderr) {
          console.error(result.stderr);
        }
        
        // Clean up container
        await wsDocker.rm(containerName, true);
        proc.exit(result.exitCode || 0);
      }
      
    } catch (error) {
      console.error('Error executing command:', error);
      proc.exit(1);
    }
  });

program.parse();