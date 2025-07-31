import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ClaudeModels, GeminiModels } from './bots/types';

export const createGui = () => {
    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../public')));

    const instancesPath = path.join(__dirname, '../bot-instances/instances.json');
    const projectsPath = path.join(__dirname, '../bot-instances/projects.json');

    const readJsonFile = (filePath: string) => {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    };

    const writeJsonFile = (filePath: string, data: any[]) => {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    };

    // Model routes
    app.get('/api/models', (req, res) => {
        res.json({
            gemini: Object.values(GeminiModels),
            claude: Object.values(ClaudeModels),
        });
    });

    // Bot routes
    app.get('/api/bots', (req, res) => {
        res.json(readJsonFile(instancesPath));
    });

    app.post('/api/bots', (req, res) => {
        const instances = readJsonFile(instancesPath);
        const newBotData = req.body;

        const newBot = {
            ...newBotData,
            status: 'idle',
            lastActivity: new Date().toISOString(),
            workingDirectory: `bot-instances/${newBotData.id}`
        };

        instances.push(newBot);
        writeJsonFile(instancesPath, instances);
        res.status(201).json(newBot);
    });

    app.put('/api/bots/:id', (req, res) => {
        const instances = readJsonFile(instancesPath);
        const updatedBotData = req.body;
        const botIndex = instances.findIndex((bot: any) => bot.id === req.params.id);

        if (botIndex !== -1) {
            const existingBot = instances[botIndex];
            instances[botIndex] = {
                ...existingBot,
                ...updatedBotData,
                id: existingBot.id,
                workingDirectory: existingBot.workingDirectory,
            };
            writeJsonFile(instancesPath, instances);
            res.json(instances[botIndex]);
        } else {
            res.status(404).send('Bot not found');
        }
    });

    // Project routes
    app.get('/api/projects', (req, res) => {
        res.json(readJsonFile(projectsPath));
    });

    app.post('/api/projects', (req, res) => {
        const projects = readJsonFile(projectsPath);
        const newProjectData = req.body;
        const now = new Date().toISOString();

        const newProject = {
            ...newProjectData,
            createdAt: now,
            updatedAt: now,
        };

        projects.push(newProject);
        writeJsonFile(projectsPath, projects);
        res.status(201).json(newProject);
    });

    app.put('/api/projects/:id', (req, res) => {
        const projects = readJsonFile(projectsPath);
        const updatedProjectData = req.body;
        const projectIndex = projects.findIndex((p: any) => p.id === req.params.id);

        if (projectIndex !== -1) {
            const existingProject = projects[projectIndex];
            projects[projectIndex] = {
                ...existingProject,
                ...updatedProjectData,
                id: existingProject.id, // Ensure ID cannot be changed
                updatedAt: new Date().toISOString(),
            };
            writeJsonFile(projectsPath, projects);
            res.json(projects[projectIndex]);
        } else {
            res.status(404).send('Project not found');
        }
    });

    return app;
};
