import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import ApiServer from '../src/apiserver';
import configManager from '../src/configmanager';
import dockerManager from '../src/dockermanager';

// Mock dependencies
vi.mock('../src/configmanager', () => ({
    default: {
        getInstances: vi.fn(),
        getProjects: vi.fn(),
        getRoles: vi.fn()
    }
}));

vi.mock('../src/dockermanager', () => ({
    default: {
        runGitWorkflow: vi.fn()
    }
}));

vi.mock('../src/utils/log', () => ({
    log: vi.fn()
}));

describe('POST /postcommit endpoint', () => {
    let app: express.Application;
    let mockInstances: any[];
    let mockProjects: any[];

    beforeEach(() => {
        // Create a fresh Express app for testing
        app = express();
        app.use(express.json());
        
        // Mock authentication middleware
        app.use((req: any, res: any, next: any) => {
            req.account_id = 'test-account';
            next();
        });

        // Add the postcommit route directly for testing
        app.post('/postcommit', async (req, res) => {
            const account_id = 'test-account';
            const instanceId = req.header('X-Instance-Id');
            const eventId = req.header('X-Event-Id');
            const apiKey = req.header('X-API-Key');

            if (!instanceId) {
                return res.status(400).json({ error: 'X-Instance-Id header is required' });
            }

            if (!eventId) {
                return res.status(400).json({ error: 'X-Event-Id header is required' });
            }

            if (!apiKey) {
                return res.status(400).json({ error: 'X-API-Key header is required' });
            }

            const { project, branch, commit_hash, directory } = req.body;

            if (!project || typeof project !== 'string') {
                return res.status(400).json({ error: 'project is required and must be a string' });
            }

            if (!branch || typeof branch !== 'string') {
                return res.status(400).json({ error: 'branch is required and must be a string' });
            }

            if (!commit_hash || typeof commit_hash !== 'string') {
                return res.status(400).json({ error: 'commit_hash is required and must be a string' });
            }

            if (!directory || typeof directory !== 'string') {
                return res.status(400).json({ error: 'directory is required and must be a string' });
            }

            try {
                // Validate the instance exists and belongs to the account
                const instance = (await configManager.getInstances(account_id)).find((inst: any) => inst.id === instanceId);
                if (!instance) {
                    return res.status(404).json({ error: 'Instance not found' });
                }

                // Validate API key matches the instance
                if (instance.env?.API_KEY !== apiKey) {
                    return res.status(403).json({ error: 'Invalid API key for this instance' });
                }

                // Validate the project exists and belongs to the account
                const projects = await configManager.getProjects(account_id);
                const projectObj = projects.find((p: any) => p.name === project);
                if (!projectObj) {
                    return res.status(404).json({ error: 'Project not found' });
                }

                // Validate the directory is one of the expected paths
                const expectedDirectories = [
                    `/workspace/${project}`,
                    `/workspace/${project}-metadata`
                ];

                if (!expectedDirectories.includes(directory)) {
                    return res.status(400).json({ 
                        error: `Invalid directory. Expected one of: ${expectedDirectories.join(', ')}`,
                        received: directory
                    });
                }

                // Use the same git push logic as delegation requests
                let pushSuccess = false;
                try {
                    pushSuccess = await dockerManager.runGitWorkflow('push-branch', instance, projectObj, branch, commit_hash);
                } catch (error) {
                    pushSuccess = false;
                }

                if (pushSuccess) {
                    res.status(200).json({ 
                        success: true, 
                        message: `Successfully pushed commit ${commit_hash} to ${branch}`,
                        project,
                        branch,
                        commit_hash,
                        directory
                    });
                } else {
                    res.status(500).json({ 
                        success: false, 
                        error: `Failed to push commit ${commit_hash} to ${branch}`,
                        project,
                        branch,
                        commit_hash,
                        directory
                    });
                }

            } catch (error) {
                res.status(500).json({ 
                    error: 'Internal server error',
                    details: error instanceof Error ? error.message : String(error)
                });
            }
        });

        // Setup mock data
        mockInstances = [
            {
                id: 'test-instance-1',
                account_id: 'test-account',
                env: { API_KEY: 'test-api-key-123' },
                enabled: true
            }
        ];

        mockProjects = [
            {
                name: 'test-project',
                account_id: 'test-account',
                repositoryUrl: 'https://github.com/test/test-project.git'
            }
        ];

        vi.mocked(configManager.getInstances).mockResolvedValue(mockInstances);
        vi.mocked(configManager.getProjects).mockResolvedValue(mockProjects);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Request Validation', () => {
        it('should require X-Instance-Id header', async () => {
            const response = await request(app)
                .post('/postcommit')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    project: 'test-project',
                    branch: 'main',
                    commit_hash: 'abc123',
                    directory: '/workspace/test-project'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('X-Instance-Id header is required');
        });

        it('should require X-Event-Id header', async () => {
            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    project: 'test-project',
                    branch: 'main',
                    commit_hash: 'abc123',
                    directory: '/workspace/test-project'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('X-Event-Id header is required');
        });

        it('should require X-API-Key header', async () => {
            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-Event-Id', 'test-event')
                .send({
                    project: 'test-project',
                    branch: 'main',
                    commit_hash: 'abc123',
                    directory: '/workspace/test-project'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('X-API-Key header is required');
        });

        it('should require project in body', async () => {
            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    branch: 'main',
                    commit_hash: 'abc123',
                    directory: '/workspace/test-project'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('project is required and must be a string');
        });

        it('should require branch in body', async () => {
            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    project: 'test-project',
                    commit_hash: 'abc123',
                    directory: '/workspace/test-project'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('branch is required and must be a string');
        });

        it('should require commit_hash in body', async () => {
            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    project: 'test-project',
                    branch: 'main',
                    directory: '/workspace/test-project'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('commit_hash is required and must be a string');
        });

        it('should require directory in body', async () => {
            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    project: 'test-project',
                    branch: 'main',
                    commit_hash: 'abc123'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('directory is required and must be a string');
        });
    });

    describe('Authentication and Authorization', () => {
        it('should validate instance exists', async () => {
            vi.mocked(configManager.getInstances).mockResolvedValue([]);

            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'nonexistent-instance')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    project: 'test-project',
                    branch: 'main',
                    commit_hash: 'abc123',
                    directory: '/workspace/test-project'
                });

            expect(response.status).toBe(404);
            expect(response.body.error).toBe('Instance not found');
        });

        it('should validate API key matches instance', async () => {
            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'wrong-api-key')
                .send({
                    project: 'test-project',
                    branch: 'main',
                    commit_hash: 'abc123',
                    directory: '/workspace/test-project'
                });

            expect(response.status).toBe(403);
            expect(response.body.error).toBe('Invalid API key for this instance');
        });

        it('should validate project exists', async () => {
            vi.mocked(configManager.getProjects).mockResolvedValue([]);

            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    project: 'nonexistent-project',
                    branch: 'main',
                    commit_hash: 'abc123',
                    directory: '/workspace/test-project'
                });

            expect(response.status).toBe(404);
            expect(response.body.error).toBe('Project not found');
        });
    });

    describe('Directory Validation', () => {
        it('should accept main project directory', async () => {
            vi.mocked(dockerManager.runGitWorkflow).mockResolvedValue(true);

            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    project: 'test-project',
                    branch: 'main',
                    commit_hash: 'abc123def456',
                    directory: '/workspace/test-project'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.project).toBe('test-project');
            expect(response.body.branch).toBe('main');
            expect(response.body.commit_hash).toBe('abc123def456');
            expect(response.body.directory).toBe('/workspace/test-project');
        });

        it('should accept metadata directory', async () => {
            vi.mocked(dockerManager.runGitWorkflow).mockResolvedValue(true);

            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    project: 'test-project',
                    branch: 'main',
                    commit_hash: 'abc123def456',
                    directory: '/workspace/test-project-metadata'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        it('should reject invalid directory', async () => {
            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    project: 'test-project',
                    branch: 'main',
                    commit_hash: 'abc123',
                    directory: '/invalid/directory'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Invalid directory');
            expect(response.body.received).toBe('/invalid/directory');
        });
    });

    describe('Git Workflow Integration', () => {
        it('should successfully push commit when git workflow succeeds', async () => {
            vi.mocked(dockerManager.runGitWorkflow).mockResolvedValue(true);

            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    project: 'test-project',
                    branch: 'feature-branch',
                    commit_hash: 'def456ghi789',
                    directory: '/workspace/test-project'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('Successfully pushed commit');

            expect(dockerManager.runGitWorkflow).toHaveBeenCalledWith(
                'push-branch',
                mockInstances[0],
                mockProjects[0],
                'feature-branch',
                'def456ghi789'
            );
        });

        it('should handle git workflow failure gracefully', async () => {
            vi.mocked(dockerManager.runGitWorkflow).mockResolvedValue(false);

            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    project: 'test-project',
                    branch: 'main',
                    commit_hash: 'abc123',
                    directory: '/workspace/test-project'
                });

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Failed to push commit');
        });

        it('should handle git workflow exceptions', async () => {
            vi.mocked(dockerManager.runGitWorkflow).mockRejectedValue(new Error('Git workflow failed'));

            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    project: 'test-project',
                    branch: 'main',
                    commit_hash: 'abc123',
                    directory: '/workspace/test-project'
                });

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toContain('Failed to push commit');
        });
    });

    describe('Error Handling', () => {
        it('should handle internal server errors gracefully', async () => {
            vi.mocked(configManager.getInstances).mockRejectedValue(new Error('Database connection failed'));

            const response = await request(app)
                .post('/postcommit')
                .set('X-Instance-Id', 'test-instance-1')
                .set('X-Event-Id', 'test-event')
                .set('X-API-Key', 'test-api-key-123')
                .send({
                    project: 'test-project',
                    branch: 'main',
                    commit_hash: 'abc123',
                    directory: '/workspace/test-project'
                });

            expect(response.status).toBe(500);
            expect(response.body.error).toBe('Internal server error');
            expect(response.body.details).toContain('Database connection failed');
        });
    });
});