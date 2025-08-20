/**
 * Interface for Docker container operations
 * Supports both local Docker (via docker CLI) and remote Docker (via WebSocket)
 * WebSocket implementation uses environment variable endpoints like DOCKER_ENDPOINT_GEMINI_DOCKER
 */

export interface IDocker {
    /**
     * Check if a file or directory exists in a container
     * @param containerName Name of the container
     * @param filePath Path to check within the container
     * @returns Promise resolving to boolean indicating existence
     */
    fsExists(containerName: string, filePath: string): Promise<boolean>;

    /**
     * Write content to a file in a container
     * @param containerName Name of the container
     * @param filePath Path to write within the container
     * @param content Content to write
     * @param mode Optional file permissions (e.g., 0o600)
     * @returns Promise resolving when write is complete
     */
    fsWriteFile(containerName: string, filePath: string, content: string, mode?: number): Promise<void>;

    /**
     * Change file permissions in a container
     * @param containerName Name of the container
     * @param filePath Path to file within the container
     * @param mode File permissions (e.g., 0o755)
     * @returns Promise resolving when chmod is complete
     */
    fsChmod(containerName: string, filePath: string, mode: number): Promise<void>;

    /**
     * Create and start a new container
     * @param containerName Name for the new container
     * @param imageName Docker image to use
     * @param options Container creation options including volumes, environment, and network
     * @returns Promise resolving to container information
     */
    run(containerName: string, imageName: string, options?: RunOptions): Promise<ContainerInfo>;

    /**
     * Remove/stop a container
     * @param containerName Name of the container to remove
     * @param force Whether to force removal (kill if running)
     * @returns Promise resolving when removal is complete
     */
    rm(containerName: string, force?: boolean): Promise<void>;

    /**
     * Execute a command in a container and return the output
     * @param containerName Name of the container
     * @param command Command to execute
     * @param options Execution options including environment variables and working directory
     * @returns Promise resolving to command output
     */
    exec(containerName: string, command: string, options?: ExecOptions): Promise<ExecResult>;

    /**
     * Execute a command in a container and return an IChildProcess for streaming output
     * @param containerName Name of the container
     * @param command Command to execute
     * @param options Execution options including environment variables and working directory
     * @param stdinContent Optional initial stdin content to write to the process
     * @returns IChildProcess for streaming output
     */
    spawnExec(containerName: string, command: string, options?: ExecOptions, stdinContent?: string): Promise<IChildProcess>;

    /**
     * Inspect container details
     * @param containerName Name of the container
     * @returns Promise resolving to container inspection data
     */
    inspect(containerName: string): Promise<ContainerInfo>;

    /**
     * List running containers
     * @param options Optional filtering options
     * @returns Promise resolving to list of containers
     */
    ps(options?: PsOptions): Promise<ContainerList>;
}

export type DataListener = (data: Buffer) => void;
export type StatusCodeListener = (code: number) => void;
export type ErrorListener = (err:Error)=>void;

export interface IChildProcess {
    stdin: { write: (data: string) => void; end: () => void; };
    stdout?: { on: (event: 'data', listener: (data: Buffer) => void) => void; removeListener: (event: 'data', listener: (data: Buffer) => void) => void; once: (event: 'data', listener: (data: Buffer) => void) => void; };
    stderr?: { on: (event: 'data', listener: (data: Buffer) => void) => void; removeListener: (event: 'data', listener: (data: Buffer) => void) => void; once: (event: 'data', listener: (data: Buffer) => void) => void; };
    on: (event: 'close' | 'error', listener: StatusCodeListener|ErrorListener) => void;
    removeListener: (event: 'close' | 'error', listener: StatusCodeListener|ErrorListener) => void;
    once: (event: 'close' | 'error', listener: StatusCodeListener|ErrorListener) => void;
}

/**
 * Options for starting containers
 */
export interface RunOptions {
    /** Volume mounts (source:destination pairs) */
    volumes?: Record<string, string>;
    /** Environment variables to set for the command */
    env?: Record<string, string>;
    /** Files to write to container before executing command (path: content pairs) */
    files?: Record<string, string>;    
}

/**
 * Options for executing commands in containers
 */
export interface ExecOptions {
    /** Environment variables to set for the command */
    env?: Record<string, string>;
    /** Working directory for the command */
    cwd?: string;
    /** User to run the command as */
    user?: string;
    /** Whether to allocate a pseudo-TTY (default: false) */
    //tty?: boolean;
    /** Whether to keep stdin open (default: false) */
    stdin?: boolean;
    /** Timeout in milliseconds (default: no timeout) */
    timeout?: number;
    /** Whether to capture stdout (default: true) */
    captureStdout?: boolean;
    /** Whether to capture stderr (default: true) */
    captureStderr?: boolean;
    /** Files to write to container before executing command (path: content pairs) */
    files?: Record<string, string>;
}

/**
 * Result of executing a command
 */
export interface ExecResult {
    /** Standard output from the command */
    stdout: string;
    /** Standard error from the command */
    stderr: string;
    /** Exit code from the command */
    exitCode: number;
}

/**
 * Information about a running process
 */
export interface ProcessInfo {
    /** Process ID */
    pid: number;
    /** Container name */
    containerName: string;
    /** Command being executed */
    command: string;
    /** Whether the process is running */
    running: boolean;
}

/**
 * Container inspection information
 */
export interface ContainerInfo {
    /** Container name */
    name: string;
    /** Container image */
    image: string;
    /** Container status */
    status: string;
    /** Container state (running, exited, etc.) */
    state: string;
    /** Container configuration */
    config: {
        env: Record<string, string>;
        workingDir: string;
        user: string;
    };
    /** Mount points */
    mounts: Array<{
        source: string;
        destination: string;
        mode: string;
    }>;
}

/**
 * Options for listing containers
 */
export interface PsOptions {
    /** Filter by container name pattern */
    name?: string;
    /** Filter by image name pattern */
    image?: string;
    /** Filter by status (running, exited, etc.) */
    status?: string;
    /** Include stopped containers */
    all?: boolean;
}

/**
 * List of containers
 */
export interface ContainerList {
    /** Array of containers */
    containers: Array<{
        /** Container name */
        name: string;
        /** Container image */
        image: string;
        /** Container status */
        status: string;
        /** Container ID */
        id: string;
    }>;
    /** Total count of containers */
    total: number;
}

/**
 * Docker Manager Command Mapping
 * 
 * Commands used in dockermanager.ts and their IDocker interface equivalents:
 * 
 * 1. docker ps --format "{{.Names}}\t{{.Image}}"
 *    → ps({ all: false }) returns ContainerList
 * 
 * 2. docker inspect --format='{{range .Config.Env}}{{println .}}{{end}}' [container]
 *    → inspect(containerName) returns ContainerInfo with config.env
 * 
 * 3. docker rm -f [container]
 *    → rm(containerName, true)
 * 
 * 4. docker run -d --name [name] [volumes] [env] [image] sleep infinity
 *    → run(containerName, imageName, { env, volumes }) returns ContainerInfo
 * 
 * 5. docker exec [container] [command]
 *    → exec(containerName, command, { env, cwd }) returns ExecResult
 * 
 * 6. docker exec -i [container] bash -c [command]
 *    → exec(containerName, command, { env, cwd, stdin: true }) returns ExecResult
 * 
 * 7. [ -d "[path]" ] (git directory check)
 *    → fsExists(containerName, filePath) returns boolean
 * 
 * 8. chmod 600 [keyfile] (SSH key permissions)
 *    → fsChmod(containerName, filePath, 0o600)
 * 
 * 9. Writing SSH keys to files
 *    → fsWriteFile(containerName, filePath, content, 0o600)
 * 
 * 10. chmod -R g+srwx [directory] (permission fixes)
 *     → fsChmod(containerName, directoryPath, 0o2775)
 * 
 * WebSocket Implementation Notes:
 * - run() establishes WebSocket connection to appropriate endpoint based on image name
 *   (e.g., DOCKER_ENDPOINT_GEMINI_DOCKER for 'gemini-docker' image)
 * - rm() terminates WebSocket connection
 * - Environment variables and files are maintained in RAM and merged on each exec call:
 *   execenv = { ...containerenv, ...env }
 *   execfiles = { ...containerfiles, ...files }
 * - Containers always run in detached mode, outbound network connections allowed
 */