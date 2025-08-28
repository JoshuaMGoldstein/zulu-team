import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ClaudeModels, GeminiModels } from './bots/types';
import configManager from './configmanager';
import { publicdb } from './supabase';

// Authentication middleware
const authenticateUser = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    const accountId = req.headers.accountid as string;
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const { data: { user }, error } = await publicdb.auth.getUser(token);
        if (error) throw error;
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        // If no account ID is provided, use the user's ID as the account ID
        if (!accountId) {
            (req as any).accountId = user.id;
            (req as any).user = user;
            return next();
        }
        
        // Verify user has access to the specified account
        const { data: accountUsers, error: accountUsersError } = await publicdb
            .from('account_users')
            .select('role, is_active')
            .eq('account_id', accountId)
            .eq('user_id', user.id)
            .single();
        
        if (accountUsersError) throw accountUsersError;
        
        if (!accountUsers || !accountUsers.is_active) {
            return res.status(403).json({ error: 'User does not have access to this account' });
        }
        
        (req as any).accountId = accountId;
        (req as any).user = user;
        (req as any).userRole = accountUsers.role;
        next();
    } catch (error: any) {
        res.status(401).json({ error: error.message });
    }
};

export const createGui = () => {
    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../public')));    


    // Reload endpoint
    app.post('/api/reload-configs', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        await configManager.loadUpdateAccount(accountId);
        res.status(200).send();
    });

    // Settings routes
    app.get('/api/settings', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const account = await configManager.loadUpdateAccount(accountId);
        res.json(account?.settings || {});
    });

    app.put('/api/settings', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const newSettings = req.body;
        
        // Save to Supabase
        const { error } = await publicdb
            .from('settings')
            .upsert({ account_id: accountId, value: newSettings });
        
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        // Update in memory
        const account = await configManager.loadUpdateAccount(accountId);
        res.json(account?.settings);
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
    app.get('/api/roles', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const account = await configManager.loadUpdateAccount(accountId);
        res.json(account?.roles || {});
    });

    app.post('/api/roles', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const newRole = req.body;
        
        // Save to Supabase
        const { error } = await publicdb
            .from('roles')
            .upsert({ 
                account_id: accountId, 
                key: newRole.id,
                value: {
                    name: newRole.name,
                    description: newRole.description,
                    dm_verbosity: newRole.dmVerbosity,
                    channel_verbosity: newRole.channelVerbosity,
                    delegated_verbosity: newRole.delegatedVerbosity,
                    mount_bot_instances: newRole.mountBotInstances,
                    allow_delegation: newRole.allowDelegation
                }
            });
        
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        // Update in memory
        const account = await configManager.loadUpdateAccount(accountId);
        res.status(201).json(account?.roles[newRole.id]);
    });

    app.put('/api/roles/:id', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const updatedRole = req.body;
        
        // Save to Supabase
        const { error } = await publicdb
            .from('roles')
            .upsert({ 
                account_id: accountId, 
                key: req.params.id,
                value: {
                    name: updatedRole.name,
                    description: updatedRole.description,
                    dm_verbosity: updatedRole.dmVerbosity,
                    channel_verbosity: updatedRole.channelVerbosity,
                    delegated_verbosity: updatedRole.delegatedVerbosity,
                    mount_bot_instances: updatedRole.mountBotInstances,
                    allow_delegation: updatedRole.allowDelegation
                }
            });
        
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        // Update in memory
        const account = await configManager.loadUpdateAccount(accountId);
        if (account?.roles[req.params.id]) {
            res.json(account.roles[req.params.id]);
        } else {
            res.status(404).send('Role not found');
        }
    });


    // Model routes
    app.get('/api/models', (req, res) => {
        const modelsPath = path.join(__dirname, '../models.json');
        if (fs.existsSync(modelsPath)) {
            res.sendFile(modelsPath);
        } else {
            res.json({ toolmodels: [], flashmodels: [] });
        }
    });

    // Preset routes
    app.get('/api/presets', (req, res) => {
        const presetsPath = path.join(__dirname, '../presets.json');
        if (fs.existsSync(presetsPath)) {
            res.sendFile(presetsPath);
        } else {
            res.json([]);
        }
    });

    // Bot routes
    app.get('/api/bots', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const account = await configManager.loadUpdateAccount(accountId);
        res.json(account?.instances.map(bot => ({
            id: bot.id,
            name: bot.name,
            role: bot.role,
            cli: bot.cli,
            enabled: bot.enabled,
            model: bot.model,
            preset: bot.preset,
            //discordBotToken: bot.discordBotToken,
            //discordChannelId: bot.discordChannelId,
            managedProjects: bot.managedProjects,
            status: bot.status,
            lastActivity: bot.lastActivity,
            workingDirectory: bot.workingDirectory
        })) || []);
    });

    app.post('/api/bots', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const newBotData = req.body;

        // Save to Supabase
        const { error } = await publicdb
            .from('bot_instances')
            .insert({                
                account_id: accountId,
                bot_id: newBotData.bot_id, //Missing in GUI
                id: newBotData.id,
                name: newBotData.name,
                //type: 'discord',                
                role: newBotData.role || 'developer',
                cli: newBotData.cli || 'gemini',
                enabled: newBotData.enabled !== false,
                model: newBotData.model || 'auto',
                preset: newBotData.preset || 'auto',
                //discord_bot_token: newBotData.discordBotToken || '',
                //discord_channel_id: newBotData.discordChannelId || '',
                managed_projects: newBotData.managedProjects || [],
                status: 'idle',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Update in memory
        const account = await configManager.loadUpdateAccount(accountId);
        const bot = account?.instances.find(b => b.id === newBotData.id);
        res.status(201).json(bot);
    });

    app.put('/api/bots/:id', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const updatedBotData = req.body;
        
        // Get existing bot to preserve fields not being updated
        const account = await configManager.loadUpdateAccount(accountId);
        const existingBot = account?.instances.find(b => b.id === req.params.id);
        
        if (!existingBot) {
            return res.status(404).send('Bot not found');
        }

        // Save to Supabase
        const { error } = await publicdb
            .from('bot_instances')
            .update({
                account_id: accountId,
                id: req.params.id,
                name: updatedBotData.name || existingBot.name,
                type: 'discord', // Always set type to 'discord'                
                role: updatedBotData.role ?? existingBot.role,
                cli: updatedBotData.cli ?? existingBot.cli,
                enabled: updatedBotData.enabled !== undefined ? updatedBotData.enabled : existingBot.enabled,
                model: updatedBotData.model ?? existingBot.model,
                preset: updatedBotData.preset ?? existingBot.preset,
                //discord_bot_token: updatedBotData.discordBotToken ?? existingBot.discordBotToken,
                //discord_channel_id: updatedBotData.discordChannelId ?? existingBot.discordChannelId,
                managed_projects: updatedBotData.managedProjects ?? existingBot.managedProjects,
                
                status: updatedBotData.status || existingBot.status,
                updated_at: new Date().toISOString()
            })
            .eq('id', req.params.id)
            .eq('account_id', accountId);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Update in memory
        const updatedAccount = await configManager.loadUpdateAccount(accountId);
        const bot = updatedAccount?.instances.find(b => b.id === req.params.id);
        res.json(bot);
    });

    // Project routes
    app.get('/api/projects', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const account = await configManager.loadUpdateAccount(accountId);
        res.json(account?.projects.map(project => ({
            id: project.id,
            name: project.name,
            description: project.description,
            repositoryUrl: project.repositoryUrl,
            assignedQa: project.assignedQa,
            discordChannelIds: project.discordChannelIds,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt
        })) || []);
    });

    app.post('/api/projects', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const newProjectData = req.body;
        const now = new Date().toISOString();

        // Save to Supabase
        const { error } = await publicdb
            .from('projects')
            .insert({
                account_id: accountId,
                id: newProjectData.id,
                name: newProjectData.name,
                config: {
                    description: newProjectData.description || '',
                    repository_url: newProjectData.repositoryUrl || '',
                    assigned_qa: newProjectData.assignedQa || '',
                    discord_channel_ids: newProjectData.discordChannelIds || []
                },
                settings: newProjectData.settings || {},
                created_at: now,
                updated_at: now
            });

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Update in memory
        const account = await configManager.loadUpdateAccount(accountId);
        const project = account?.projects.find(p => p.id === newProjectData.id);
        res.status(201).json(project);
    });

    app.put('/api/projects/:id', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const updatedProjectData = req.body;
        
        // Get existing project to preserve fields not being updated
        const account = await configManager.loadUpdateAccount(accountId);
        const existingProject = account?.projects.find(p => p.id === req.params.id);
        
        if (!existingProject) {
            return res.status(404).send('Project not found');
        }

        // Save to Supabase
        const { error } = await publicdb
            .from('projects')
            .update({
                account_id: accountId,
                id: req.params.id,
                name: updatedProjectData.name || existingProject.name,
                description: updatedProjectData.description ?? existingProject.description,
                repository_url: updatedProjectData.repositoryUrl ?? existingProject.repositoryUrl,
                assigned_qa: updatedProjectData.assignedQa ?? existingProject.assignedQa,
                discord_channel_ids: updatedProjectData.discordChannelIds ?? existingProject.discordChannelIds,
                updated_at: new Date().toISOString()
            })
            .eq('id', req.params.id)
            .eq('account_id', accountId);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Update in memory
        const updatedAccount = await configManager.loadUpdateAccount(accountId);
        const project = updatedAccount?.projects.find(p => p.id === req.params.id);
        res.json(project);
    });

    // Git Key routes
    app.get('/api/gitkeys', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const account = await configManager.loadUpdateAccount(accountId);
        res.json(account?.gitKeys || []);
    });

    app.post('/api/gitkeys', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const newKey = req.body;

        // Save to Supabase
        const { error } = await publicdb
            .from('git_keys')
            .insert({
                account_id: accountId,
                id: newKey.id,
                name: newKey.name,
                private_key: newKey.value
            });

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Update in memory
        const account = await configManager.loadUpdateAccount(accountId);
        const key = account?.gitKeys.find(k => k.id === newKey.id);
        res.status(201).json(key);
    });

    app.delete('/api/gitkeys/:id', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        
        // Delete from Supabase
        const { error } = await publicdb
            .from('git_keys')
            .delete()
            .eq('id', req.params.id)
            .eq('account_id', accountId);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Update in memory
        await configManager.loadUpdateAccount(accountId);
        res.status(204).send();
    });

    app.post('/api/register', async (req, res) => {
        const { email, password } = req.body;
        try {
            const { data, error } = await publicdb.auth.signUp({
                email,
                password,
            });

            if (error) {
                return res.status(400).json({ error: error.message });
            }
            res.status(200).json({ message: 'User registered successfully', user: data.user });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    return app;
};