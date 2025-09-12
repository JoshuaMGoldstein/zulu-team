import { IDocker, ContainerInfo } from './idocker';
import { log } from './log';
import { randomUUID } from 'crypto';

interface BuildServerPoolEntry {
  info: ContainerInfo;
  inUse: boolean;
  lastUse: number;
  accountId?: string; // Which account is currently using it
}

export class BuildServerPool {
  private pool: Map<string, BuildServerPoolEntry> = new Map();
  private docker: IDocker;
  private maxPoolSize: number;
  private idleTimeout: number; // milliseconds before considering a server stale
  private cleanupInterval: NodeJS.Timeout | null = null;
  private accountUsage: Map<string, number> = new Map(); // Track usage per account
  private maxServersPerAccount: number;
  private waitQueue: Map<string, Array<{ resolve: (server: string) => void; reject: (error: Error) => void; timestamp: number }>> = new Map();
  private maxWaitTime: number; // maximum time to wait for a server in milliseconds

  constructor(docker: IDocker, maxPoolSize = 10, idleTimeout = 30 * 60 * 1000, maxServersPerAccount = 1, maxWaitTime = 60000) {
    this.docker = docker;
    this.maxPoolSize = maxPoolSize;
    this.idleTimeout = idleTimeout;
    this.maxServersPerAccount = maxServersPerAccount;
    this.maxWaitTime = maxWaitTime;
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    // Clean up every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleServers();
    }, 5 * 60 * 1000);
  }

  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Synchronizes the pool with actual running containers
   * Removes entries for containers that no longer exist
   * Updates status of existing containers
   */
  async syncPoolWithReality(): Promise<void> {
    log('BuildServerPool: Syncing pool with reality');
    
    try {
      // Get all running containers
      const runningContainers = await this.docker.ps({ all: false });
      const runningBuildServers = new Set<string>();

      // Check which of our pool containers are still running
      if (Array.isArray(runningContainers)) {
        for (const container of runningContainers) {
          if (container.name?.startsWith('buildserver-')) {
            runningBuildServers.add(container.name);
          }
        }
      }

      // Update pool entries and remove stale ones
      for (const [containerName, entry] of this.pool.entries()) {
        if (!runningBuildServers.has(containerName)) {
          log(`BuildServerPool: Removing stale entry for ${containerName}`);
          
          // Update account usage if this was an in-use server
          if (entry.inUse && entry.accountId) {
            const currentUsage = this.accountUsage.get(entry.accountId) || 0;
            this.accountUsage.set(entry.accountId, Math.max(0, currentUsage - 1));
          }
          
          this.pool.delete(containerName);
        } else {
          // Update the container info for running containers
          if (Array.isArray(runningContainers)) {
            const containerInfo = runningContainers.find((c: any) => c.name === containerName);
            if (containerInfo) {
              entry.info = containerInfo;
            }
          }
        }
      }

      log(`BuildServerPool: Sync complete. Pool size: ${this.pool.size}`);
    } catch (error) {
      log(`BuildServerPool: Error syncing pool: ${error}`);
    }
  }

  /**
   * Gets an available build server from the pool or creates a new one
   * Implements per-account limits and waiting queue
   */
  async getBuildServer(accountId: string): Promise<string> {
    log(`BuildServerPool: Getting build server for account ${accountId}`);
    
    // Check if account has reached its server limit
    const currentUsage = this.accountUsage.get(accountId) || 0;
    if (currentUsage >= this.maxServersPerAccount) {
      log(`BuildServerPool: Account ${accountId} at limit (${currentUsage}/${this.maxServersPerAccount}), waiting...`);
      return await this.waitForAvailableServer(accountId);
    }

    // First, sync with reality to ensure our pool is accurate
    await this.syncPoolWithReality();

    // Look for an available server in the pool
    for (const [containerName, entry] of this.pool.entries()) {
      if (!entry.inUse && entry.info.status === 'running') {
        log(`BuildServerPool: Found available server ${containerName}`);
        entry.inUse = true;
        entry.lastUse = Date.now();
        entry.accountId = accountId;
        this.accountUsage.set(accountId, currentUsage + 1);
        return containerName;
      }
    }

    // If no available servers, check if we can create a new one
    if (this.pool.size < this.maxPoolSize) {
      return await this.createNewBuildServer(accountId);
    }

    // Pool is at max capacity, try to clean up and retry
    log('BuildServerPool: Pool at max capacity, attempting cleanup');
    await this.cleanupStaleServers();
    
    // Try one more time to find an available server
    for (const [containerName, entry] of this.pool.entries()) {
      if (!entry.inUse && entry.info.status === 'running') {
        log(`BuildServerPool: Found available server after cleanup: ${containerName}`);
        entry.inUse = true;
        entry.lastUse = Date.now();
        entry.accountId = accountId;
        this.accountUsage.set(accountId, currentUsage + 1);
        return containerName;
      }
    }

    // If still no available servers, wait in queue
    log(`BuildServerPool: No available servers, account ${accountId} entering wait queue`);
    return await this.waitForAvailableServer(accountId);
  }

  /**
   * Waits for an available server with timeout
   */
  private async waitForAvailableServer(accountId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const waitStart = Date.now();
      
      const timeout = setTimeout(() => {
        this.removeFromWaitQueue(accountId, resolve, reject);
        reject(new Error(`BuildServerPool: Timeout waiting for available server after ${this.maxWaitTime}ms`));
      }, this.maxWaitTime);

      const resolveWrapper = (server: string) => {
        clearTimeout(timeout);
        this.removeFromWaitQueue(accountId, resolve, reject);
        resolve(server);
      };

      const rejectWrapper = (error: Error) => {
        clearTimeout(timeout);
        this.removeFromWaitQueue(accountId, resolve, reject);
        reject(error);
      };

      if (!this.waitQueue.has(accountId)) {
        this.waitQueue.set(accountId, []);
      }
      
      this.waitQueue.get(accountId)!.push({
        resolve: resolveWrapper,
        reject: rejectWrapper,
        timestamp: waitStart
      });

      log(`BuildServerPool: Account ${accountId} added to wait queue`);
    });
  }

  private removeFromWaitQueue(accountId: string, resolve: Function, reject: Function): void {
    const queue = this.waitQueue.get(accountId);
    if (queue) {
      const index = queue.findIndex(entry => entry.resolve === resolve || entry.reject === reject);
      if (index !== -1) {
        queue.splice(index, 1);
      }
      if (queue.length === 0) {
        this.waitQueue.delete(accountId);
      }
    }
  }

  /**
   * Notifies waiting accounts when a server becomes available
   */
  private notifyWaitingAccounts(): void {
    for (const [accountId, queue] of this.waitQueue.entries()) {
      const currentUsage = this.accountUsage.get(accountId) || 0;
      
      if (currentUsage < this.maxServersPerAccount && queue.length > 0) {
        const waitingRequest = queue[0];
        
        // Try to get a server for this waiting account
        this.getBuildServer(accountId).then(server => {
          waitingRequest.resolve(server);
        }).catch(error => {
          waitingRequest.reject(error);
        });
        
        // Remove this request from queue
        queue.shift();
        
        if (queue.length === 0) {
          this.waitQueue.delete(accountId);
        }
        
        break; // Only handle one waiting account at a time
      }
    }
  }

  /**
   * Creates a new build server container
   */
  private async createNewBuildServer(accountId: string): Promise<string> {
    const containerName = `buildserver-${randomUUID()}`;
    log(`BuildServerPool: Creating new build server ${containerName} for account ${accountId}`);

    try {
      // Create and start the container
      const containerInfo = await this.docker.run(containerName, 'buildserver-docker', {});

      // For WebSocket Docker, the run() method returns mock container info
      // For Local Docker, we need to verify the container was created
      if (!containerInfo) {
        throw new Error(`Failed to create container ${containerName}`);
      }

      // Add to pool
      const currentUsage = this.accountUsage.get(accountId) || 0;
      this.pool.set(containerName, {
        info: containerInfo,
        inUse: true,
        lastUse: Date.now(),
        accountId: accountId
      });
      this.accountUsage.set(accountId, currentUsage + 1);

      log(`BuildServerPool: Successfully created and added ${containerName} to pool`);
      return containerName;
    } catch (error) {
      log(`BuildServerPool: Error creating new build server: ${error}`);
      throw error;
    }
  }

  /**
   * Releases a build server back to the pool
   */
  releaseBuildServer(containerName: string): void {
    const entry = this.pool.get(containerName);
    if (entry) {
      log(`BuildServerPool: Releasing ${containerName}`);
      
      // Update account usage
      if (entry.accountId) {
        const currentUsage = this.accountUsage.get(entry.accountId) || 0;
        this.accountUsage.set(entry.accountId, Math.max(0, currentUsage - 1));
      }
      
      entry.inUse = false;
      entry.lastUse = Date.now();
      entry.accountId = undefined;
      
      // Notify waiting accounts
      this.notifyWaitingAccounts();
    } else {
      log(`BuildServerPool: Warning - tried to release unknown server ${containerName}`);
    }
  }

  /**
   * Cleans up stale servers that have been idle too long
   */
  private async cleanupStaleServers(): Promise<void> {
    log('BuildServerPool: Running cleanup of stale servers');
    const now = Date.now();
    const containersToRemove: string[] = [];

    for (const [containerName, entry] of this.pool.entries()) {
      // Remove servers that have been idle too long
      if (!entry.inUse && (now - entry.lastUse) > this.idleTimeout) {
        log(`BuildServerPool: Marking ${containerName} for removal (idle timeout)`);
        containersToRemove.push(containerName);
      }
    }

    // Remove stale containers
        for (const containerName of containersToRemove) {
          try {
            log(`BuildServerPool: Removing stale container ${containerName}`);
            await this.docker.rm(containerName, true);
            this.pool.delete(containerName);
          } catch (error) {
            log(`BuildServerPool: Error removing container ${containerName}: ${error}`);
          }
        }

    log(`BuildServerPool: Cleanup complete. Removed ${containersToRemove.length} stale servers`);
  }

  /**
   * Gets statistics about the pool
   */
  getPoolStats(): {
    total: number;
    inUse: number;
    available: number;
    maxSize: number;
    accountUsage: Map<string, number>;
    waitingAccounts: number;
  } {
    let inUse = 0;
    let available = 0;

    for (const entry of this.pool.values()) {
      if (entry.inUse) {
        inUse++;
      } else {
        available++;
      }
    }

    return {
      total: this.pool.size,
      inUse,
      available,
      maxSize: this.maxPoolSize,
      accountUsage: new Map(this.accountUsage),
      waitingAccounts: this.waitQueue.size
    };
  }

  /**
   * Shuts down the pool and cleans up resources
   */
  async shutdown(): Promise<void> {
    log('BuildServerPool: Shutting down');
    this.stopCleanupInterval();

    // Release all containers
    for (const [containerName, entry] of this.pool.entries()) {
      try {
        if (entry.inUse) {
          log(`BuildServerPool: Force releasing ${containerName}`);
        }
        await this.docker.rm(containerName, true);
      } catch (error) {
        log(`BuildServerPool: Error removing container ${containerName} during shutdown: ${error}`);
      }
    }

    this.pool.clear();
    log('BuildServerPool: Shutdown complete');
  }
}