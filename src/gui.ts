import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ClaudeModels, GeminiModels } from './bots/types';
import configManager from './configmanager';

export const createGui = () => {
    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../public')));
    
    const instancesPath = path.join(__dirname, '../bot-instances/instances.json');
    const projectsPath = path.join(__dirname, '../bot-instances/projects.json');
    const settingsPath = path.join(__dirname, '../bot-instances/settings.json');
    const rolesPath = path.join(__dirname, '../bot-instances/roles.json');
    const gitKeysPath = path.join(__dirname, '../bot-instances/gitkeys.json');

    const writeJsonFile = (filePath: string, data: any) => {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    };

    // Reload endpoint
    app.post('/api/reload-configs', (req, res) => {
        configManager.load();
        res.status(200).send();
    });

    // Settings routes
    app.get('/api/settings', (req, res) => {
        res.json(configManager.getSettings());
    });

    app.put('/api/settings', (req, res) => {
        const newSettings = req.body;
        writeJsonFile(settingsPath, newSettings);
        res.json(newSettings);
    });


    // Template routes
    app.get('/api/templates/:role', (req, res) => {
        const role = req.params.role;
        const templatePath = path.join(__dirname, `../templates/roles/${role}/GEMINI.md`);
        if (fs.existsSync(templatePath)) {
            res.sendFile(templatePath);
        } else {
            res.status(404).send('Template not found');
        }
    });

    app.put('/api/templates/:role', (req, res) => {
        const role = req.params.role;
        const templatePath = path.join(__dirname, `../templates/roles/${role}/GEMINI.md`);
        fs.writeFileSync(templatePath, req.body);
        res.status(200).send();
    });

    // Role routes
    app.get('/api/roles', (req, res) => {
        res.json(configManager.getRoles());
    });

    app.post('/api/roles', (req, res) => {
        const roles = configManager.getRoles();
        const newRole = req.body;
        roles[newRole.id] = {
            name: newRole.name,
            description: newRole.description,
            dmVerbosity: -1,
            channelVerbosity: -1,
            delegatedVerbosity: -1,
            mountBotInstances: false,
            allowDelegation: false
        };
        writeJsonFile(rolesPath, roles);
        res.status(201).json(newRole);
    });

    app.put('/api/roles/:id', (req, res) => {
        const roles = configManager.getRoles();
        const updatedRole = req.body;
        if (roles[req.params.id]) {
            roles[req.params.id] = updatedRole;
            writeJsonFile(rolesPath, roles);
            res.json(updatedRole);
        } else {
            res.status(404).send('Role not found');
        }
    });


    // Model routes
    app.get('/api/models', (req, res) => {
        res.json({
            gemini: Object.values(GeminiModels),
            claude: Object.values(ClaudeModels),
        });
    });

    // Bot routes
    app.get('/api/bots', (req, res) => {
        res.json(configManager.getInstances());
    });

    app.post('/api/bots', (req, res) => {
        const instances = configManager.getInstances();
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
        const instances = configManager.getInstances();
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
        res.json(configManager.getProjects());
    });

    app.post('/api/projects', (req, res) => {
        const projects = configManager.getProjects();
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
        const projects = configManager.getProjects();
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

    // Git Key routes
    app.get('/api/gitkeys', (req, res) => {
        res.json(JSON.parse(fs.readFileSync(gitKeysPath, 'utf-8')));
    });

    app.post('/api/gitkeys', (req, res) => {
        const keys = JSON.parse(fs.readFileSync(gitKeysPath, 'utf-8'));
        const newKey = req.body;
        keys.push(newKey);
        writeJsonFile(gitKeysPath, keys);
        res.status(201).json(newKey);
    });

    app.delete('/api/gitkeys/:id', (req, res) => {
        let keys = JSON.parse(fs.readFileSync(gitKeysPath, 'utf-8'));
        keys = keys.filter((key: any) => key.id !== req.params.id);
        writeJsonFile(gitKeysPath, keys);
        res.status(204).send();
    });

    return app;
};