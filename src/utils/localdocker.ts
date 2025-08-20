import { IDocker, RunOptions, ExecOptions, ExecResult, ProcessInfo, ContainerInfo, ContainerList, PsOptions, IChildProcess } from './idocker';
import { spawn, ChildProcess } from 'child_process';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { log } from '../utils/log';
import { randomUUID } from 'crypto';

// Custom promisify for exec to ensure consistent output
const execPromise = (command: string): Promise<{ stdout: string; stderr: string }> => {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
};

/**
 * Local Docker implementation using Docker CLI commands
 * Provides container operations via direct Docker CLI interaction
 */
export class LocalDocker implements IDocker {
    
    async fsExists(containerName: string, filePath: string): Promise<boolean> {
        try {
            log(`Checking if file exists: ${filePath} in container: ${containerName}`);
            const command = `docker exec -i ${containerName} [ -e ${filePath} ] && echo exists || echo not found`;
            log(`Executing command: ${command}`);
            const result = await execPromise(command);
            log(`Raw execPromise result: ${JSON.stringify(result)}`);
            log(`Command output: ${result.stdout}`);
            return result.stdout.trim() === 'exists';
        } catch (error) {
            log(`Error checking file existence: ${error}`);
            return false;
        }
    }

    

    async fsWriteFile(containerName: string, filePath: string, content: string, mode?: number, options?:ExecOptions): Promise<void> {
        const tempFileName = `/tmp/${randomUUID()}`;
        const tempFilePath = path.join(process.cwd(), tempFileName); // Ensure absolute path for host
        
        try {
            // Ensure the temporary directory exists
            await fs.promises.mkdir(path.dirname(tempFilePath), { recursive: true });

            log(`Writing content to temporary file: ${tempFilePath}`);
            await fs.promises.writeFile(tempFilePath, content);

            if(filePath.startsWith("~/.ssh")) {
                mode=0o600;                
            }

            let userArg = (options?.user)?`-u ${options.user}`:'';

            var dirname = path.dirname(filePath);
            await execPromise(`docker exec ${userArg} ${containerName} sh -c 'mkdir -p ${dirname}'`);
            //await this.exec(containerName, `mkdir -p ${dirname}`, options);

            log(`Copying ${tempFilePath} to ${containerName}:${filePath}`);

            if(filePath.startsWith("~/") && options?.user) {
                filePath = "/home/"+options.user+"/"+filePath.slice(2);
            }
            await execPromise(`docker cp "${tempFilePath}" "${containerName}:${filePath}"`);

            

            if(options?.user) {
                //Do not use userArg since root needs to change ownership of the new file.
                //Issue: What if the file wasnt copied succesfully
                await execPromise(`docker exec ${containerName} sh -c 'chown ${options.user} ${filePath}'`);
                //await this.exec(containerName, `chown ${options.user} ${filePath}`);
            }

            if (mode !== undefined) {
                const chmodCommand = `sh -c 'chmod ${mode.toString(8)} "${filePath}"'`;
                log(`Setting permissions for ${filePath} in ${containerName} to ${mode.toString(8)}`);
                                
                await execPromise(`docker exec ${userArg} ${containerName} ${chmodCommand}`);
                //await this.exec(containerName, chmodCommand, options)
                //await execPromise(`docker exec ${containerName} ${chmodCommand}`);
            }
        } catch(e) {
            log(`Error writing file ${filePath} to container ${containerName} `, e);
        } finally {
            // Clean up the temporary file on the host
            
            if (fs.existsSync(tempFilePath)) {
                log(`Deleting temporary file: ${tempFilePath}`);
                await fs.promises.unlink(tempFilePath);
            }
        }
    }

    async fsChmod(containerName: string, filePath: string, mode: number): Promise<void> {
        log(`Changing file permissions in container: ${containerName}, path: ${filePath}, mode: ${mode.toString(8)}`);
        const command = `docker exec ${containerName} chmod ${mode.toString(8)} "${filePath}"`;
        log(`Executing command: ${command}`);
        await execPromise(command);
    }

    async run(containerName: string, imageName: string, options?: RunOptions): Promise<ContainerInfo> {
        const volumeArgs: string[] = [];

        //Assume volumes and files are for *exec* user.
        if (options?.volumes) {
            for (const [source, destination] of Object.entries(options.volumes)) {
                volumeArgs.push('-v', `"${source}:${destination}"`);
            }
        }


        const envArgs: string[] = [];
        if(options?.env) {
            for (const [key,value] of Object.entries(options.env)) {
                envArgs.push('-e', `${key}=${value}`);
            }
        }

        const command = `docker run -d --name "${containerName}" ${volumeArgs.join(' ')} ${envArgs.join(' ')} "${imageName}" sleep infinity`;
        log(`Running container: ${containerName} with image: ${imageName}`);
        log(`Executing command: ${command}`);
        await execPromise(command);
        
        // Poll until the container is running
        let containerInfo: ContainerInfo | null = null;
        for (let i = 0; i < 10; i++) {
            try {
                containerInfo = await this.inspect(containerName);
                if (containerInfo.status === 'running') {
                    break;
                }
            } catch (error) {
                // Ignore errors, container might not be ready yet
            }
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retrying
        }

        if (!containerInfo || containerInfo.status !== 'running') {
            throw new Error(`Container ${containerName} did not start in time.`);
        }

        if (options?.files) {
            for (const [filePath, base64Content] of Object.entries(options.files)) {
                // Decode base64 content before writing
                const decodedContent = Buffer.from(base64Content, 'base64').toString('utf-8'); 
                const execOptions: ExecOptions = {
                    user: 'exec',
                    cwd: '/workspace',
                    stdin: false,
                };
                console.log(`calling fsWRitefile for containter ${containerName} with file: ${filePath}`);
                await this.fsWriteFile(containerName, filePath, decodedContent, undefined, execOptions);
            }
        }

        return containerInfo;
    }

    async rm(containerName: string, force: boolean = true): Promise<void> {
        log(`Attempting to stop container: ${containerName}`);
        try {
            await execPromise(`docker stop "${containerName}"`);
        } catch (error) {
            log(`Container ${containerName} was not running or could not be stopped: ${error}`);
        }

        const forceFlag = force ? '-f' : '';
        const command = `docker rm ${forceFlag} "${containerName}"`;
        log(`Removing container: ${containerName}`);
        log(`Executing command: ${command}`);
        await execPromise(command);
    }

    async exec(containerName: string, command: string, options?: ExecOptions): Promise<ExecResult> {
        log(`Executing command in container ${containerName}: ${command}`);
        // Write files to container before executing command
        if (options?.files) {
            for (const [filePath, base64Content] of Object.entries(options.files)) {
                // Decode base64 content before writing
                const decodedContent = Buffer.from(base64Content, 'base64').toString('utf-8');                
                await this.fsWriteFile(containerName, filePath, decodedContent, undefined, options);
            }
        }

        const args: string[] = ['exec'];
        
        if (options?.env) {
            for (const [key, value] of Object.entries(options.env)) {
                args.push('-e', `${key}=${value}`);
            }
        }
        
        if (options?.cwd) {
            args.push('-w', options.cwd);
        }
        
        if (options?.user) {
            args.push('-u', options.user);
        }
        
        //if (options?.tty) {
            //args.push('-t'); //Not supported.
        //}
        
        if (options?.stdin) {
            args.push('-i');
        }

        args.push(containerName, 'sh', '-c', command);

        return new Promise((resolve, reject) => {
            log(`Ready to execute command in container ${containerName}: docker ${args.join(' ')}`);
            const child = spawn('docker', args);
            
            let stdout = '';
            let stderr = '';
            
            if (options?.captureStdout !== false) {
                child.stdout?.on('data', (data) => {
                    stdout += data.toString();
                });
            }
            
            if (options?.captureStderr !== false) {
                child.stderr?.on('data', (data) => {
                    stderr += data.toString();
                });
            }

            let timeoutId: NodeJS.Timeout | undefined;
            if (options?.timeout) {
                timeoutId = setTimeout(() => {
                    child.kill('SIGKILL');
                    reject(new Error(`Command timed out after ${options.timeout}ms`));
                }, options.timeout);
            }

            child.on('close', (code) => {
                if (timeoutId) clearTimeout(timeoutId);
                resolve({
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    exitCode: code || 0
                });
            });

            child.on('error', (error) => {
                if (timeoutId) clearTimeout(timeoutId);
                reject(error);
            });
        });
    }

    async spawnExec(containerName: string, command: string, options?: ExecOptions, stdinContent?: string): Promise<IChildProcess> {
        log(`Spawning command in container ${containerName}: ${command}`);

        if (options?.files) {
            for (const [filePath, base64Content] of Object.entries(options.files)) {
                // Decode base64 content before writing
                const decodedContent = Buffer.from(base64Content, 'base64').toString('utf-8');                
                await this.fsWriteFile(containerName, filePath, decodedContent, undefined, options);
            }
        }

        const args: string[] = ['exec'];
        if (options?.env) {
            for (const [key, value] of Object.entries(options.env)) {
                args.push('-e', `${key}=${value}`);
            }
        }
        if (options?.cwd) {
            args.push('-w', options.cwd);
        }
        
        if (options?.user) {
            args.push('-u', options.user);
        }

        // Always allocate a pseudo-TTY for interactive sessions ////args.push('-t');        
        // Always keep stdin open for interactive sessions
        args.push('-i');

        args.push(containerName, 'sh', '-c', command); //'sh', '-c', 

        console.log("Spawn - Calling docker "+args.join(' ') +' : '+ (stdinContent?' with stdin: '+stdinContent:''));
        const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });

        if (stdinContent) {
            child.stdin.write(stdinContent);
            child.stdin.end();
        }

        return child;
    }

    async inspect(containerName: string): Promise<ContainerInfo> {
        log(`Inspecting container: ${containerName}`);
        const command = `docker inspect "${containerName}"`;
        log(`Executing command: ${command}`);
        const { stdout } = await execPromise(command);
        const inspectData = JSON.parse(stdout)[0];
        
        return {
            name: inspectData.Name.replace(/^\//, ''),
            image: inspectData.Config.Image,
            status: inspectData.State.Status,
            state: inspectData.State.Status,
            config: {
                env: inspectData.Config.Env.reduce((acc: Record<string, string>, env: string) => {
                    const [key, ...valueParts] = env.split('=');
                    acc[key] = valueParts.join('=');
                    return acc;
                }, {}),
                workingDir: inspectData.Config.WorkingDir || '/',
                user: inspectData.Config.User || 'root'
            },
            mounts: inspectData.Mounts.map((mount: any) => ({
                source: mount.Source,
                destination: mount.Destination,
                mode: mount.Mode || 'rw'
            }))
        };
    }

    async ps(options?: PsOptions): Promise<ContainerList> {
        log(`Listing containers with options: ${JSON.stringify(options)}`);
        let format = '{{.Names}}	{{.Image}}	{{.Status}}	{{.ID}}';
        let filterArgs = '';
        
        if (options?.all) {
            filterArgs += ' -a';
        }
        
        if (options?.name) {
            filterArgs += ` --filter "name=${options.name}"`;
        }
        
        if (options?.image) {
            filterArgs += ` --filter "ancestor=${options.image}"`;
        }
        
        if (options?.status) {
            filterArgs += ` --filter "status=${options.status}"`;
        }

        const command = `docker ps${filterArgs} --format "${format}"`;
        log(`Executing command: ${command}`);
        const { stdout } = await execPromise(command);
        
        const containers = stdout.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => {
                const [name, image, status, id] = line.split('\t');
                return { name, image, status, id };
            });

        return {
            containers,
            total: containers.length
        };
    }
}

// Export singleton instance
export default new LocalDocker();