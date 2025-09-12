import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowManager, WorkflowContext } from '../src/workflowmanager';
import { IDocker } from '../src/utils/idocker';
import * as fs from 'fs'

// Mock IDocker implementation
const mockDocker: IDocker = {
  fsExists: vi.fn().mockResolvedValue(true),
  fsWriteFile: vi.fn().mockResolvedValue(undefined),
  fsChmod: vi.fn().mockResolvedValue(undefined),
  run: vi.fn().mockResolvedValue({ name: 'test-container', image: 'test-image', status: 'running' }),
  rm: vi.fn().mockResolvedValue(undefined),
  exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
  spawnExec: vi.fn().mockResolvedValue({ 
    on: vi.fn(),
    removeListener: vi.fn(),
    once: vi.fn(),
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout: { on: vi.fn(), removeListener: vi.fn(), once: vi.fn() },
    stderr: { on: vi.fn(), removeListener: vi.fn(), once: vi.fn() }
  }),
  inspect: vi.fn().mockResolvedValue({ 
    name: 'test-container', 
    image: 'test-image', 
    status: 'running',
    state: 'running',
    config: { env: {}, workingDir: '/workspace', user: 'exec' },
    mounts: [],
    labels: {}
  }),
  ps: vi.fn().mockResolvedValue({ containers: [], total: 0 }),
  updateLabels: vi.fn().mockResolvedValue(undefined)
};

describe('WorkflowManager', () => {
  let workflowManager: WorkflowManager;
  let context: WorkflowContext;

  beforeEach(() => {
    workflowManager = new WorkflowManager();
    context = {
      containerName: 'test-container',
      docker: mockDocker,
      args: {
        SSH_KEY_PATH: 'id_ed25519',
        KEY_FILENAME: 'id_ed25519'
      },
      files: {
        'id_ed25519': 'test-private-key-content' // Raw content, not base64 encoded
      },
      env: {},
      user: 'root',
      workdir: '/'
    };
    
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  it('should parse workflow file correctly', async () => {
    // This test indirectly verifies parsing through execution
    await workflowManager.executeWorkflow('install-git-key', context);
    
    // Verify that the docker methods were called correctly
    expect(mockDocker.fsWriteFile).toHaveBeenCalledWith(
      'test-container',
      '~/.ssh/id_ed25519',
      'test-private-key-content', // Raw content
      undefined,
      expect.objectContaining({
        user: 'git'
      })
    );
  });

  it('should handle FROM directive correctly', async () => {
    // Create a mock workflow with FROM directive
    const mockWorkflowContent = 'FROM install-git-key\nARG TEST_ARG\nRUN echo "test"';
    
    // Mock file system read to return our test content
    const originalReadFileSync = fs.readFileSync;
    const mockReadFileSync = vi.spyOn(fs, 'readFileSync');
    mockReadFileSync.mockImplementation((path: fs.PathOrFileDescriptor) => {
      if (path.toString().includes('test-workflow.workflow')) {
        return mockWorkflowContent;
      }
      return originalReadFileSync(path);
    });
    
    // Create a test workflow file
    const testWorkflowPath = '/srv/zulu-team/workflows/test-workflow.workflow';
    require('fs').writeFileSync(testWorkflowPath, mockWorkflowContent);
    
    try {
      // Execute the test workflow
      await workflowManager.executeWorkflow('test-workflow', context);
      
      // Verify that both the base workflow (install-git-key) and the current workflow steps were executed
      // install-git-key workflow has 5 steps, our test workflow has 2 steps (ARG and RUN)
      expect(mockDocker.fsWriteFile).toHaveBeenCalledWith(
        'test-container',
        '~/.ssh/id_ed25519',
        'test-private-key-content', // Raw content
        undefined,
        expect.objectContaining({
          user: 'git'
        })
      );
      
      expect(mockDocker.exec).toHaveBeenCalledWith(
        'test-container',
        'echo "test"',
        expect.objectContaining({
          user: 'git',
          cwd: '/home/git'
        })
      );
    } finally {
      // Clean up test file
      require('fs').unlinkSync(testWorkflowPath);
    }
  });
});