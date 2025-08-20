import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WSDocker } from './wsdocker';
import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';

  

// Mock fs
vi.mock('fs', async (importOriginal) => {
  const actual:any = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

describe('WSDocker', () => {
  let docker: WSDocker;
  let mockWebSocket: any;

  beforeEach(async () => {
    // Load environment variables from .env file
    require('dotenv').config();
    
    docker = new WSDocker();
    // Ensure the test container is clean before each test
    /*try {
      await docker.rm('test-container');
    } catch (e) {
      // Ignore if container doesn't exist
    }*/
    // Set environment variable for test endpoint (will use .env value if available)
    process.env.DOCKER_ENDPOINT_GEMINI_DOCKER = process.env.DOCKER_ENDPOINT_GEMINI_DOCKER || 'ws://localhost:8011/ws';
    // Start a real container for tests
    await docker.run('test-container', 'gemini-docker');
    // Clean the workspace directory inside the container
    await docker.exec('test-container', 'rm -rf /workspace/*');
  });

  afterEach(async () => {
    // Clean up the container after each test
    try { 
      await docker.rm('test-container');
    } catch(e) {
      //Ignore if container doesn't exist
    }
    //await new Promise(resolve => setTimeout(resolve, 5000)); //await container reboot
  });

  describe('getEndpoint', () => {
    it('should return correct endpoint for gemini-docker', () => {
      process.env.DOCKER_ENDPOINT_GEMINI_DOCKER = 'ws://localhost:8011/ws';
      const endpoint = (docker as any).getEndpoint('gemini-docker');
      expect(endpoint).toContain('ws://localhost:8011/ws');
    });

    it('should return default endpoint for unknown image', () => {
      delete process.env.DOCKER_ENDPOINT_GEMINI_DOCKER;
      const endpoint = (docker as any).getEndpoint('unknown-image');
      expect(endpoint).toContain('ws://localhost:8088/ws');
    });
  });

  describe('fsExists', () => {
    it('should return true when file exists', async () => {
      await docker.exec('test-container', 'touch /workspace/test-file.txt');
      const result = await docker.fsExists('test-container', '/workspace/test-file.txt');
      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      const result = await docker.fsExists('test-container', '/non-existent-file.txt');
      expect(result).toBe(false);
    });
  });

  describe('fsWriteFile', () => {
    it('should store file content in memory', async () => {
      const mockExec = vi.spyOn(docker, 'exec').mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      await docker.fsWriteFile('test-container', '/path/to/file', 'Hello World');
      
      const connection = (docker as any).connections.get('test-container');
      expect(connection.files['/path/to/file']).toBe(Buffer.from('Hello World').toString('base64'));
    });

    it('should handle chmod after writing file', async () => {
      const mockExec = vi.spyOn(docker, 'exec').mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      await docker.fsWriteFile('test-container', '/path/to/file', 'Hello World', 0o600);
      
      expect(mockExec).toHaveBeenCalledWith('test-container', 'chmod 600 "/path/to/file"');
    });
  });

  describe('fsChmod', () => {
    it('should execute chmod command', async () => {
      const mockExec = vi.spyOn(docker, 'exec').mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0
      });

      await docker.fsChmod('test-container', '/path/to/file', 0o755);
      
      expect(mockExec).toHaveBeenCalledWith('test-container', 'chmod 755 "/path/to/file"');
    });
  });

  describe('run', () => {
    it('should establish WebSocket connection and return container info', async () => {
      // The container is already run in beforeEach, so we just inspect it
      const result = await docker.inspect('test-container');
      expect(result.name).toBe('test-container');
      expect(result.status).toBe('running');
    });

    it('should load volume files', async () => {
      // Setup mock filesystem for volume loading
      const tempDir = '/tmp/wsdocker-test-volume';
      const tempFile = path.join(tempDir, 'test-file.txt');
      
      // Mock filesystem calls
      vi.mocked(fs.existsSync).mockImplementation((path) => path === tempDir || path === tempFile);
      vi.mocked(fs.statSync).mockImplementation((path) => ({
        isDirectory: () => path === tempDir,
        isFile: () => path === tempFile
      } as fs.Stats));
      vi.mocked(fs.readdirSync).mockReturnValue(['test-file.txt'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue('volume content');

      await docker.rm('test-container');
      //await new Promise(resolve => setTimeout(resolve, 5000)); //await container reboot
      await docker.run('test-container', 'gemini-docker', {
        volumes: { [tempDir]: '/workspace' }
      });

      const result = await docker.exec('test-container', 'cat /workspace/test-file.txt');
      expect(result.stdout).toBe('volume content');
    });
  });

  describe('loadVolumeFiles', () => {
    it('should load files from directory', async () => {
      const mockExists = vi.mocked(fs.existsSync).mockReturnValue(true);
      const mockStat = vi.mocked(fs.statSync)
        .mockReturnValueOnce({ isDirectory: () => true } as fs.Stats)
        .mockReturnValueOnce({ isDirectory: () => false } as fs.Stats)
        .mockReturnValueOnce({ isDirectory: () => false } as fs.Stats);
      const mockReadDir = vi.mocked(fs.readdirSync).mockReturnValue(['file1.txt', 'file2.txt'] as any);
      const mockReadFile = vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('content1')
        .mockReturnValueOnce('content2');

      await (docker as any).loadVolumeFiles('test-container', '/host/path', '/container/path');
      
      const connection = (docker as any).connections.get('test-container');
      expect(connection.files['/container/path/file1.txt']).toBe(Buffer.from('content1').toString('base64'));
      expect(connection.files['/container/path/file2.txt']).toBe(Buffer.from('content2').toString('base64'));
    });

    it('should handle nested directories', async () => {
      const mockExists = vi.mocked(fs.existsSync).mockReturnValue(true);
      const mockStat = vi.mocked(fs.statSync)
        .mockReturnValueOnce({ isDirectory: () => true } as fs.Stats)
        .mockReturnValueOnce({ isDirectory: () => true } as fs.Stats)
        .mockReturnValueOnce({ isDirectory: () => false } as fs.Stats);
      const mockReadDir = vi.mocked(fs.readdirSync)
        .mockReturnValueOnce(['subdir'] as any)
        .mockReturnValueOnce(['nested.txt'] as any);
      const mockReadFile = vi.mocked(fs.readFileSync).mockReturnValue('nested content');

      await (docker as any).loadVolumeFiles('test-container', '/host/path', '/container/path');
      
      const connection = (docker as any).connections.get('test-container');
      expect(connection.files['/container/path/subdir/nested.txt']).toBe(Buffer.from('nested content').toString('base64'));
    });

    it('should skip non-existent paths', async () => {
      const mockExists = vi.mocked(fs.existsSync).mockReturnValue(false);

      await (docker as any).loadVolumeFiles('test-container', '/nonexistent/path', '/container/path');
      
      const connection = (docker as any).connections.get('test-container');
      expect(connection.files).toEqual({});
    });
  });

  describe('rm', () => {
    it('should remove container', async () => {
      // Ensure a container exists to be removed
      await docker.run('container-to-remove', 'gemini-docker');
      let psResult = await docker.ps();
      expect(psResult.containers.map(c => c.name)).toContain('container-to-remove');

      await docker.rm('container-to-remove');
      psResult = await docker.ps();
      expect(psResult.containers.map(c => c.name)).not.toContain('container-to-remove');
    });
  });

  describe('exec', () => {
    it('should execute a command and return stdout', async () => {
      const result = await docker.exec('test-container', 'echo hello');
      expect(result.stdout).toBe('hello');
      expect(result.exitCode).toBe(0);
    });

    it('should merge environment variables', async () => {
      const result = await docker.exec('test-container', 'env', {
        env: { COMMAND_VAR: 'command_value' }
      });
      expect(result.stdout).toContain('COMMAND_VAR=command_value');
    });

    it('should merge files', async () => {
      await docker.exec('test-container', 'echo "new_content2" > /workspace/new2.txt', {
        files: { '/workspace/new.txt': 'new_content' }
      });

      const result2 = await docker.exec('test-container', 'cat /workspace/new2.txt');
      console.log(JSON.stringify(result2));
      expect(result2.stdout).toBe('new_content2');
      
      const result = await docker.exec('test-container', 'cat /workspace/new.txt');
      console.log(JSON.stringify(result));
      expect(result.stdout).toBe('new_content');
    });
  });

  describe('inspect', () => {
    it('should return container info', async () => {
      const connection = (docker as any).connections.get('test-container');
      if (!connection) throw new Error('Connection not found');
      connection.env = { TEST_VAR: 'test_value' };

      const result = await docker.inspect('test-container');
      
      expect(result.name).toBe('test-container');
      expect(result.status).toBe('running');
      expect(result.config.env.TEST_VAR).toBe('test_value');
    });

    it('should throw error for non-existent container', async () => {
      await expect(docker.inspect('nonexistent-container')).rejects.toThrow('Container nonexistent-container not found');
    });
  });

  describe('ps', () => {
    it('should list connected containers', async () => {
      // The beforeEach hook already runs 'test-container'. Add another for this test.
      await docker.run('another-container', 'gemini-docker');

      const result = await docker.ps();
      
      expect(result.containers).toHaveLength(2);
      expect(result.containers.map(c => c.name)).toContain('test-container');
      expect(result.containers.map(c => c.name)).toContain('another-container');

      // Clean up the additional container
      await docker.rm('another-container');
    });

    it('should filter containers by name', async () => {
      // 'test-container' is already running from beforeEach
      await docker.run('another-test-container', 'gemini-docker');

      const result = await docker.ps({ name: 'test' });
      
      expect(result.containers).toHaveLength(2);
      expect(result.containers.map(c => c.name)).toContain('test-container');
      expect(result.containers.map(c => c.name)).toContain('another-test-container');

      // Clean up the additional container
      await docker.rm('another-test-container');
    });
  });
});