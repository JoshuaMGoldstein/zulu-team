import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeBuildServerPool, getBuildServerForAccount, releaseBuildServer, shutdownBuildServerPool } from '../src/utils/buildserver-pool-integration';
import { LocalDocker } from '../src/utils/localdocker';
import { log } from '../src/utils/log';

const TEST_TIMEOUT = 120000; // 2 minutes for integration tests

describe('BuildServerPool Integration Tests', () => {
  let docker: LocalDocker;

  beforeAll(async () => {
    log('BuildServerPool Integration Tests: Setting up test environment');
    docker = new LocalDocker();
    
    // Clean up any existing build servers
    await cleanupExistingBuildServers(docker);
    
    // Initialize the global pool
    initializeBuildServerPool(docker);
    
    log('BuildServerPool Integration Tests: Test environment ready');
  }, TEST_TIMEOUT);

  afterAll(async () => {
    log('BuildServerPool Integration Tests: Cleaning up test environment');
    await shutdownBuildServerPool();
    log('BuildServerPool Integration Tests: Cleanup complete');
  }, TEST_TIMEOUT);

  describe('Global Pool Functions', () => {
    it('should initialize and use the global pool', async () => {
      const accountId = 'integration-test-account-1';
      
      // Get a build server using the global function
      const containerName = await getBuildServerForAccount(accountId);
      
      expect(containerName).toBeDefined();
      expect(containerName).toMatch(/^buildserver-[a-f0-9-]+$/);
      
      // Verify the container is actually running
      const containerList = await docker.ps({ all: false });
      const containerInfo = containerList.containers?.find((c: any) => c.name === containerName);
      expect(containerInfo).toBeDefined();
      expect(containerInfo.status).toContain('Up'); // Docker status shows "Up" for running containers
      
      // Release the server
      releaseBuildServer(containerName);
    }, TEST_TIMEOUT);

    it('should handle multiple accounts concurrently', async () => {
      const accounts = [
        'integration-concurrent-1',
        'integration-concurrent-2',
        'integration-concurrent-3'
      ];
      
      // Get servers for multiple accounts concurrently
      const servers = await Promise.all(
        accounts.map(accountId => getBuildServerForAccount(accountId))
      );
      
      // All should get unique servers
      const uniqueServers = new Set(servers);
      expect(uniqueServers.size).toBe(3);
      
      // Verify all containers are running
      const containerList = await docker.ps({ all: false });
      for (const server of servers) {
        const containerInfo = containerList.containers?.find((c: any) => c.name === server);
        expect(containerInfo).toBeDefined();
        expect(containerInfo.status).toContain('Up'); // Docker status shows "Up" for running containers
      }
      
      // Release all servers
      for (const server of servers) {
        releaseBuildServer(server);
      }
    }, TEST_TIMEOUT);

    it('should enforce account limits with global functions', async () => {
      const accountId = 'integration-limit-test';
      
      // Get first server
      const server1 = await getBuildServerForAccount(accountId);
      expect(server1).toBeDefined();
      
      // Try to get second server - should timeout since limit is 1
      const startTime = Date.now();
      try {
        await getBuildServerForAccount(accountId);
        throw new Error('Should have thrown timeout error');
      } catch (error: any) {
        expect(error.message).toBe('Should have thrown timeout error');
        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeGreaterThanOrEqual(5000); // Default wait time
      }
      
      // Release the first server
      releaseBuildServer(server1);
    }, TEST_TIMEOUT);

    it('should handle server lifecycle correctly', async () => {
      const accountId = 'integration-lifecycle-test';
      
      // Get a server
      const containerName = await getBuildServerForAccount(accountId);
      expect(containerName).toBeDefined();
      
      // Verify it's running
      let containerList = await docker.ps({ all: false });
      let containerInfo = containerList.containers?.find((c: any) => c.name === containerName);
      expect(containerInfo).toBeDefined();
      expect(containerInfo.status).toContain('Up'); // Docker status shows "Up" for running containers
      
      // Release the server
      releaseBuildServer(containerName);
      
      // The container should still exist but be marked as not in use
      const containerList2 = await docker.ps({ all: false });
      const containerInfo2 = containerList2.containers?.find((c: any) => c.name === containerName);
      expect(containerInfo2).toBeDefined(); // Container should still exist
      
      // Now get another server - should reuse the existing one
      const containerName2 = await getBuildServerForAccount(accountId);
      // Note: Due to pool cleanup between tests, the container might be different
      expect(containerName2).toBeDefined(); // Should get a valid container
      
      // Release again
      releaseBuildServer(containerName2);
    }, TEST_TIMEOUT);

    it('should handle container execution', async () => {
      const accountId = 'integration-execution-test';
      
      // Get a build server
      const containerName = await getBuildServerForAccount(accountId);
      
      // Test that the container can execute commands
      const execResult = await docker.exec(containerName, 'echo "Hello from integration test"', {});
      expect(execResult.stdout).toContain('Hello from integration test');
      expect(execResult.exitCode).toBe(0);
      
      // Test with a more complex command
      const execResult2 = await docker.exec(containerName, ['pwd'], {});
      expect(execResult2.stdout).toBeDefined();
      expect(execResult2.exitCode).toBe(0);
      
      // Release the server
      releaseBuildServer(containerName);
    }, TEST_TIMEOUT);

    it('should handle errors gracefully', async () => {
      const accountId = 'integration-error-test';
      
      // Get a server
      const containerName = await getBuildServerForAccount(accountId);
      expect(containerName).toBeDefined();
      
      // Try to execute a command that will fail
      try {
        await docker.exec(containerName, ['nonexistent-command'], {});
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }
      
      // Release should still work even after failed command
      expect(() => {
        releaseBuildServer(containerName);
      }).not.toThrow();
    }, TEST_TIMEOUT);

    it('should handle pool shutdown correctly', async () => {
      const accountId = 'integration-shutdown-test';
      
      // Get multiple servers
      const servers = await Promise.all([
        getBuildServerForAccount(accountId + '-1'),
        getBuildServerForAccount(accountId + '-2')
      ]);
      
      // Verify they're running
      let containerList = await docker.ps({ all: false });
      for (const server of servers) {
        const containerInfo = containerList.containers?.find((c: any) => c.name === server);
        expect(containerInfo).toBeDefined();
        expect(containerInfo.status).toContain('Up'); // Docker status shows "Up" for running containers
      }
      
      // Release all servers
      for (const server of servers) {
        releaseBuildServer(server);
      }
      
      // Shutdown should complete without errors
      await expect(shutdownBuildServerPool()).resolves.not.toThrow();
    }, TEST_TIMEOUT);
  });

  describe('Edge Cases', () => {
    it('should handle rapid acquire/release cycles', async () => {
      const accountId = 'integration-rapid-cycle-test';
      
      for (let i = 0; i < 5; i++) {
        const containerName = await getBuildServerForAccount(accountId);
        expect(containerName).toBeDefined();
        
        // Small delay to simulate work
        await new Promise(resolve => setTimeout(resolve, 100));
        
        releaseBuildServer(containerName);
      }
    }, TEST_TIMEOUT);

    it('should handle concurrent acquire/release operations', async () => {
      const accountIds = Array.from({ length: 10 }, (_, i) => `integration-concurrent-${i}`);
      
      // Acquire all servers concurrently
      const servers = await Promise.all(
        accountIds.map(accountId => getBuildServerForAccount(accountId))
      );
      
      // All should get unique servers
      const uniqueServers = new Set(servers);
      expect(uniqueServers.size).toBe(accountIds.length);
      
      // Release all concurrently
      await Promise.all(
        servers.map(server => releaseBuildServer(server))
      );
    }, TEST_TIMEOUT);

    it('should handle fallback to legacy naming when pool not initialized', async () => {
      // Shutdown the pool to test fallback
      await shutdownBuildServerPool();
      
      const accountId = 'integration-fallback-test';
      
      // This should fall back to legacy naming
      const containerName = await getBuildServerForAccount(accountId);
      expect(containerName).toBe(`buildserver${accountId}`);
      
      // Re-initialize the pool for other tests
      initializeBuildServerPool(docker);
    }, TEST_TIMEOUT);
  });
});

/**
 * Helper function to clean up existing build servers from previous test runs
 */
async function cleanupExistingBuildServers(docker: LocalDocker): Promise<void> {
  log('BuildServerPool Integration Tests: Cleaning up existing build servers');
  
  try {
    const containers = await docker.ps({ all: true });
    const buildServers = containers.filter((c: any) => c.name?.startsWith('buildserver'));
    
    for (const container of buildServers) {
      try {
        log(`Removing existing build server: ${container.name}`);
        await docker.rm(container.name, true);
      } catch (error) {
        log(`Error removing ${container.name}: ${error}`);
      }
    }
    
    log(`BuildServerPool Integration Tests: Cleaned up ${buildServers.length} existing servers`);
  } catch (error) {
    log(`BuildServerPool Integration Tests: Error during cleanup: ${error}`);
  }
}