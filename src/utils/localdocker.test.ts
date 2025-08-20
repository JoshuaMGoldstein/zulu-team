import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalDocker } from './localdocker';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Mock child_process
vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    exec: vi.fn(actual.exec as any),
    spawn: vi.fn(actual.spawn as any),
  };
});

describe('LocalDocker', () => {
  let docker: LocalDocker;

  beforeEach(async () => {
    docker = new LocalDocker();
    vi.clearAllMocks();
    
    // Create a test container before each test
    try {
      await docker.run('test-container', 'test-image');
    } catch (error) {
      // Container might already exist, that's fine
    }
  });

  afterEach(async () => {
    // Clean up any containers created during tests
    try {
      await docker.rm('test-container', true);
    } catch (error) {
      // Ignore errors if container doesn't exist
    }
    try {
      await docker.rm('new-container', true);
    } catch (error) {
      // Ignore errors if container doesn't exist
    }
    try {
      await docker.rm('remove-test-container', true);
    } catch (error) {
      // Ignore errors if container doesn't exist
    }
  });

  describe('fsExists', () => {
    it('should return true when file exists', async () => {
      // First create a file to test
      await docker.exec('test-container', 'touch /test-file.txt');
      
      const result = await docker.fsExists('test-container', '/test-file.txt');
      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      const result = await docker.fsExists('test-container', '/non-existent-file.txt');
      expect(result).toBe(false);
    });
  });

  describe('fsWriteFile', () => {
    it('should write file content to container', async () => {
      await docker.fsWriteFile('test-container', '/test.txt', 'Hello World');
      
      const result = await docker.exec('test-container', 'cat /test.txt');
      expect(result.stdout).toBe('Hello World');
    });

    it('should write file with specific permissions', async () => {
      await docker.fsWriteFile('test-container', '/test.txt', 'Hello World', 0o600);
      
      const result = await docker.exec('test-container', 'stat -c %a /test.txt');
      expect(result.stdout.trim()).toBe('600');
    });

    it('should handle shell escaping in content', async () => {
      const content = 'Hello $PATH `whoami` World';
      await docker.fsWriteFile('test-container', '/test.txt', content);
      
      const result = await docker.exec('test-container', 'cat /test.txt');
      expect(result.stdout).toBe(content);
    });
  });

  describe('fsChmod', () => {
    it('should change file permissions', async () => {
      await docker.exec('test-container', 'touch /test.txt');
      await docker.fsChmod('test-container', '/test.txt', 0o755);
      
      const result = await docker.exec('test-container', 'stat -c %a /test.txt');
      expect(result.stdout.trim()).toBe('755');
    });
  });

  describe('run', () => {
    it('should create and start container', async () => {
      const result = await docker.run('new-container', 'test-image');
      expect(result.name).toBe('new-container');
      expect(result.status).toBe('running');
      
      // Clean up
      await docker.rm('new-container');
    });

    it('should create container with volumes', async () => {
      const result = await docker.run('new-container', 'test-image', {
        volumes: { '/host/path': '/container/path' }
      });
      expect(result.name).toBe('new-container');
      expect(result.status).toBe('running');
      
      // Clean up
      await docker.rm('new-container');
    });
  });

  describe('rm', () => {
    it('should remove container with force', async () => {
      await docker.run('remove-test-container', 'test-image');
      const result = await docker.rm('remove-test-container', true);
      expect(result).toBeUndefined();
    });

    it('should remove container without force', async () => {
      await docker.run('remove-test-container', 'test-image');
      const result = await docker.rm('remove-test-container');
      expect(result).toBeUndefined();
    });
  });

  describe('exec', () => {
    it('should execute command with default options', async () => {
      const spawnSpy = vi.mocked(spawn);

      const result = await docker.exec('test-container', 'ls');
      
      expect(spawnSpy).toHaveBeenCalledWith('docker', ['exec', 'test-container', 'sh', '-c', 'ls']);
    });

    it('should execute command with all options', async () => {
      const spawnSpy = vi.mocked(spawn);

      const result = await docker.exec('test-container', 'ls', {
        cwd: '/workspace',
        env: { TEST_VAR: 'test_value' },
        user: 'testuser',
        files: { '/test.txt': 'test content' }
      });
      
      expect(spawnSpy).toHaveBeenCalledWith('docker', ['exec', '-e', 'TEST_VAR=test_value', '-w', '/workspace', '-u', 'testuser', 'test-container', 'sh', '-c', 'ls']);
    });

    it('should write files before executing command', async () => {
      const spawnSpy = vi.mocked(spawn);
      const fsWriteSpy = vi.spyOn(docker, 'fsWriteFile').mockResolvedValue(undefined);

      await docker.exec('test-container', 'ls -la', {
        files: {
          '/path/to/file': Buffer.from('Hello World').toString('base64')
        }
      });

      expect(fsWriteSpy).toHaveBeenCalledWith('test-container', '/path/to/file', 'Hello World');
      expect(spawnSpy).toHaveBeenCalledWith('docker', ['exec', 'test-container', 'sh', '-c', 'ls -la']);
    });
  });

  describe('inspect', () => {
    it('should return container info', async () => {
      const result = await docker.inspect('test-container');
      expect(result.name).toBe('test-container');
      expect(result.status).toBe('running');
    });
  });

  describe('ps', () => {
    it('should list running containers', async () => {
      const result = await docker.ps();
      expect(result.containers.length).toBeGreaterThan(0);
      expect(result.containers.some(c => c.name === 'test-container')).toBe(true);
    });

    it('should filter containers by name', async () => {
      const result = await docker.ps({ name: 'test-container' });
      expect(result.containers.length).toBe(1);
      expect(result.containers[0].name).toBe('test-container');
    });
  });
});