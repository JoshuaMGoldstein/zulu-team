import { BuildServerPool } from './buildserver-pool';
import { IDocker } from './idocker';
import { log } from './log';

// Global build server pool instance
let buildServerPool: BuildServerPool | null = null;

/**
 * Initializes the global build server pool
 */
export function initializeBuildServerPool(docker: IDocker): void {
  if (buildServerPool) {
    log('BuildServerPool: Already initialized');
    return;
  }

  log('BuildServerPool: Initializing global pool');
  const maxPoolSize = parseInt(process.env.BUILD_SERVER_POOL_SIZE || '10');
  const idleTimeout = parseInt(process.env.BUILD_SERVER_IDLE_TIMEOUT || '1800000'); // 30 minutes
  
  buildServerPool = new BuildServerPool(docker, maxPoolSize, idleTimeout);
}

/**
 * Gets the global build server pool instance
 */
export function getBuildServerPool(): BuildServerPool {
  if (!buildServerPool) {
    throw new Error('BuildServerPool: Not initialized. Call initializeBuildServerPool first.');
  }
  return buildServerPool;
}

/**
 * Gets a build server for an account, falling back to the old naming scheme if pool fails
 */
export async function getBuildServerForAccount(accountId: string): Promise<string> {
  if (!buildServerPool) {
    log('BuildServerPool: Pool not initialized, falling back to legacy naming');
    return `buildserver${accountId}`;
  }

  try {
    return await buildServerPool.getBuildServer(accountId);
  } catch (error) {
    log(`BuildServerPool: Failed to get server from pool: ${error}`);
    log('BuildServerPool: Falling back to legacy naming');
    return `buildserver${accountId}`;
  }
}

/**
 * Releases a build server back to the pool (no-op for legacy servers)
 */
export function releaseBuildServer(containerName: string): void {
  if (!buildServerPool) {
    log(`BuildServerPool: Pool not initialized, cannot release ${containerName}`);
    return;
  }

  // Only release if it's a pool-managed server
  if (containerName.startsWith('buildserver-')) {
    buildServerPool.releaseBuildServer(containerName);
  }
}

/**
 * Gets pool statistics
 */
export function getBuildServerPoolStats() {
  if (!buildServerPool) {
    return { total: 0, inUse: 0, available: 0, maxSize: 0 };
  }
  
  return buildServerPool.getPoolStats();
}

/**
 * Shuts down the build server pool
 */
export async function shutdownBuildServerPool(): Promise<void> {
  if (buildServerPool) {
    log('BuildServerPool: Shutting down global pool');
    await buildServerPool.shutdown();
    buildServerPool = null;
  }
}