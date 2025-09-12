import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BuildServerPool } from '../src/utils/buildserver-pool';
import { LocalDocker } from '../src/utils/localdocker';
import { log } from '../src/utils/log';
import { initializeBuildServerPool, getBuildServerForAccount, releaseBuildServer, shutdownBuildServerPool } from '../src/utils/buildserver-pool-integration';

// Test configuration
const TEST_TIMEOUT = 120000; // 2 minutes for real container operations
const POOL_SIZE = 3;
const IDLE_TIMEOUT = 30000; // 30 seconds
const MAX_SERVERS_PER_ACCOUNT = 1;
const MAX_WAIT_TIME = 10000; // 10 seconds for tests

describe('BuildServerPool Integration Tests', () => {
  let docker: LocalDocker;
  let pool: BuildServerPool;

  beforeAll(async () => {
    log('BuildServerPool Tests: Initializing test environment');
    docker = new LocalDocker();
    
    // Clean up any existing build servers from previous test runs
    await cleanupExistingBuildServers(docker);
    
    // Initialize the global pool
    initializeBuildServerPool(docker);
    
    log('BuildServerPool Tests: Test environment ready');
  }, TEST_TIMEOUT);

  afterAll(async () => {
    log('BuildServerPool Tests: Cleaning up test environment');
    await shutdownBuildServerPool();
    log('BuildServerPool Tests: Cleanup complete');
  }, TEST_TIMEOUT);

  beforeEach(async () => {
    // Ensure clean state before each test
    await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay between tests
  });

  describe('Basic Pool Operations', () => {
    it('should create and initialize a build server pool', async () => {
      const poolInstance = new BuildServerPool(docker, POOL_SIZE, IDLE_TIMEOUT, MAX_SERVERS_PER_ACCOUNT, MAX_WAIT_TIME);
      
      expect(poolInstance).toBeDefined();
      
      const stats = poolInstance.getPoolStats();
      expect(stats.total).toBe(0);
      expect(stats.maxSize).toBe(POOL_SIZE);
      
      // Clean up
      await poolInstance.shutdown();
    }, TEST_TIMEOUT);

    it('should get a build server from empty pool', async () => {
      const poolInstance = new BuildServerPool(docker, POOL_SIZE, IDLE_TIMEOUT, MAX_SERVERS_PER_ACCOUNT, MAX_WAIT_TIME);
      const accountId = 'test-account-1';
      
      const containerName = await poolInstance.getBuildServer(accountId);
      
      expect(containerName).toBeDefined();
      expect(containerName).toMatch(/^buildserver-[a-f0-9-]+$/);
      
      const stats = poolInstance.getPoolStats();
      expect(stats.total).toBe(1);
      expect(stats.inUse).toBe(1);
      expect(stats.available).toBe(0);
      
      // Verify the container is actually running
      const containerList = await docker.ps({ all: false });
      const containerInfo = containerList.containers?.find((c: any) => c.name === containerName);
      expect(containerInfo).toBeDefined();
      expect(containerInfo.status).toContain('Up'); // Docker status shows "Up" for running containers
      
      // Clean up
      poolInstance.releaseBuildServer(containerName);
      await poolInstance.shutdown();
    }, TEST_TIMEOUT);

    it('should release a build server back to the pool', async () => {
      const poolInstance = new BuildServerPool(docker, POOL_SIZE, IDLE_TIMEOUT, MAX_SERVERS_PER_ACCOUNT, MAX_WAIT_TIME);
      const accountId = 'test-account-2';
      
      const containerName = await poolInstance.getBuildServer(accountId);
      
      // Release the server
      poolInstance.releaseBuildServer(containerName);
      
      const stats = poolInstance.getPoolStats();
      expect(stats.total).toBe(1);
      expect(stats.inUse).toBe(0);
      expect(stats.available).toBe(1);
      
      // Clean up
      await poolInstance.shutdown();
    }, TEST_TIMEOUT);
  });

  describe('Account Limits and Queuing', () => {
    it('should enforce per-account server limits', async () => {
      const poolInstance = new BuildServerPool(docker, POOL_SIZE, IDLE_TIMEOUT, MAX_SERVERS_PER_ACCOUNT, MAX_WAIT_TIME);
      const accountId = 'test-account-limits';
      
      // Get first server
      const server1 = await poolInstance.getBuildServer(accountId);
      expect(server1).toBeDefined();
      
      // Try to get second server - should timeout since limit is 1
      const startTime = Date.now();
      try {
        await poolInstance.getBuildServer(accountId);
        throw new Error('Should have thrown timeout error');
      } catch (error: any) {
        expect(error.message).toContain('Timeout waiting for available server');
        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeGreaterThanOrEqual(MAX_WAIT_TIME - 1000); // Allow 1 second tolerance
      }
      
      // Clean up
      poolInstance.releaseBuildServer(server1);
      await poolInstance.shutdown();
    }, TEST_TIMEOUT);

    it('should handle multiple accounts concurrently', async () => {
      const poolInstance = new BuildServerPool(docker, 2, IDLE_TIMEOUT, MAX_SERVERS_PER_ACCOUNT, MAX_WAIT_TIME);
      
      const account1 = 'test-account-multi-1';
      const account2 = 'test-account-multi-2';
      
      // Get servers for both accounts concurrently
      const [server1, server2] = await Promise.all([
        poolInstance.getBuildServer(account1),
        poolInstance.getBuildServer(account2)
      ]);
      
      expect(server1).toBeDefined();
      expect(server2).toBeDefined();
      expect(server1).not.toBe(server2); // Should be different servers
      
      const stats = poolInstance.getPoolStats();
      expect(stats.total).toBe(2);
      expect(stats.inUse).toBe(2);
      
      // Clean up
      poolInstance.releaseBuildServer(server1);
      poolInstance.releaseBuildServer(server2);
      await poolInstance.shutdown();
    }, TEST_TIMEOUT);
  });

  describe('Pool Synchronization', () => {
    it('should sync pool with reality when containers disappear', async () => {
      const poolInstance = new BuildServerPool(docker, POOL_SIZE, IDLE_TIMEOUT, MAX_SERVERS_PER_ACCOUNT, MAX_WAIT_TIME);
      const accountId = 'test-sync-account';
      
      const containerName = await poolInstance.getBuildServer(accountId);
      
      // Manually remove the container to simulate it disappearing
      await docker.rm(containerName, true);
      
      // Wait a moment for the system to register the change
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Sync should detect the missing container
      await poolInstance.syncPoolWithReality();
      
      const stats = poolInstance.getPoolStats();
      expect(stats.total).toBe(0); // Container should be removed from pool
      
      await poolInstance.shutdown();
    }, TEST_TIMEOUT);
  });

  describe('Integration with Global Pool', () => {
    it('should work with the global pool integration', async () => {
      const accountId = 'test-global-integration';
      
      // Get server using global function
      const containerName = await getBuildServerForAccount(accountId);
      
      expect(containerName).toBeDefined();
      expect(containerName).toMatch(/^buildserver-[a-f0-9-]+$/);
      
      // Verify it's actually running
      const containerList = await docker.ps({ all: false });
      const containerInfo = containerList.containers?.find((c: any) => c.name === containerName);
      expect(containerInfo).toBeDefined();
      expect(containerInfo.status).toContain('Up'); // Docker status shows "Up" for running containers
      
      // Release using global function
      releaseBuildServer(containerName);
    }, TEST_TIMEOUT);

    it('should handle concurrent requests to global pool', async () => {
      const accounts = ['global-concurrent-1', 'global-concurrent-2', 'global-concurrent-3'];
      
      // Get servers for multiple accounts concurrently
      const servers = await Promise.all(
        accounts.map(accountId => getBuildServerForAccount(accountId))
      );
      
      // All should get unique servers
      const uniqueServers = new Set(servers);
      expect(uniqueServers.size).toBe(3);
      
      // Release all servers
      for (const server of servers) {
        releaseBuildServer(server);
      }
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle pool at maximum capacity', async () => {
      const smallPool = new BuildServerPool(docker, 1, IDLE_TIMEOUT, MAX_SERVERS_PER_ACCOUNT, 5000); // 5 second wait
      
      const account1 = 'max-capacity-1';
      const account2 = 'max-capacity-2';
      
      // Fill the pool
      const server1 = await smallPool.getBuildServer(account1);
      expect(server1).toBeDefined();
      
      // Try to get another server - should timeout
      const startTime = Date.now();
      try {
        await smallPool.getBuildServer(account2);
        throw new Error('Should have thrown timeout error');
      } catch (error: any) {
        expect(error.message).toBe('Should have thrown timeout error');
      }
      
      // Clean up
      smallPool.releaseBuildServer(server1);
      await smallPool.shutdown();
    }, TEST_TIMEOUT);

    it('should handle invalid container releases gracefully', async () => {
      const poolInstance = new BuildServerPool(docker, POOL_SIZE, IDLE_TIMEOUT, MAX_SERVERS_PER_ACCOUNT, MAX_WAIT_TIME);
      
      // Try to release a non-existent container
      expect(() => {
        poolInstance.releaseBuildServer('non-existent-container');
      }).not.toThrow();
      
      await poolInstance.shutdown();
    }, TEST_TIMEOUT);
  });

  describe('Real Docker Operations', () => {
    it('should create containers that can execute basic commands', async () => {
      const poolInstance = new BuildServerPool(docker, POOL_SIZE, IDLE_TIMEOUT, MAX_SERVERS_PER_ACCOUNT, MAX_WAIT_TIME);
      const accountId = 'test-docker-ops';
      
      const containerName = await poolInstance.getBuildServer(accountId);
      
      // Test that the container can execute a basic command
      const execResult = await docker.exec(containerName, 'echo "Hello from build server"', {});
      expect(execResult.stdout).toContain('Hello from build server');
      
      // Clean up
      poolInstance.releaseBuildServer(containerName);
      await poolInstance.shutdown();
    }, TEST_TIMEOUT);

    it('should handle container lifecycle correctly', async () => {
      const poolInstance = new BuildServerPool(docker, POOL_SIZE, IDLE_TIMEOUT, MAX_SERVERS_PER_ACCOUNT, MAX_WAIT_TIME);
      const accountId = 'test-lifecycle';
      
      const containerName = await poolInstance.getBuildServer(accountId);
      
      // Verify container exists and is running
      let containerList = await docker.ps({ all: false });
      let containerInfo = containerList.containers?.find((c: any) => c.name === containerName);
      expect(containerInfo).toBeDefined();
      expect(containerInfo.status).toContain('Up'); // Docker status shows "Up" for running containers
      
      // Release and shutdown pool
      poolInstance.releaseBuildServer(containerName);
      await poolInstance.shutdown();
      
      // Container should be removed after shutdown
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for cleanup
      containerList = await docker.ps({ all: true });
      containerInfo = containerList.containers?.find((c: any) => c.name === containerName);
      expect(containerInfo).toBeUndefined(); // Container should be gone
    }, TEST_TIMEOUT);
  });
});

/**
 * Helper function to clean up existing build servers from previous test runs
 */
async function cleanupExistingBuildServers(docker: LocalDocker): Promise<void> {
  log('BuildServerPool Tests: Cleaning up existing build servers');
  
  try {
    const containers = await docker.ps({ all: true });
    const buildServers = containers.filter((c: any) => c.name?.startsWith('buildserver-'));
    
    for (const container of buildServers) {
      try {
        log(`Removing existing build server: ${container.name}`);
        await docker.rm(container.name, true);
      } catch (error) {
        log(`Error removing ${container.name}: ${error}`);
      }
    }
    
    log(`BuildServerPool Tests: Cleaned up ${buildServers.length} existing servers`);
  } catch (error) {
    log(`BuildServerPool Tests: Error during cleanup: ${error}`);
  }
}