import express from 'express';
import cors from 'cors';
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

    // CORS configuration for API endpoints
    const corsOptions = {
        origin: [
            'http://127.0.0.1:5173',  // Vue dev server
            'http://127.0.0.1:4173',  // Vue preview server
            'http://127.0.0.1:3000',  // Main app
            'http://localhost:5173',  // Vue dev server
            'http://localhost:4173',  // Vue preview server
            'http://localhost:3000',  // Main app
            'http://zulu-api.warmerise.co',  // Production API
            'https://zulu-api.warmerise.co',  // Production API HTTPS
            'https://b9955f70-eeb0-4ba6-85a6-4f7e0e1f85b2-zulu-www-sta-35i7o75mma-uk.a.run.app'  // Cloud Run Vue app
        ],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'AccountId'],
        optionsSuccessStatus: 200 // Some legacy browsers choke on 204
    };

    // Apply CORS to all API routes
    app.use(cors(corsOptions));


    // Reload endpoint
    app.post('/api/reload-configs', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        await configManager.getAccount(accountId);
        res.status(200).send();
    });

    // Settings routes
    app.get('/api/settings', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const account = await configManager.getAccount(accountId);
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
        const account = await configManager.getAccount(accountId);
        res.json(account?.settings);
    });


    // Template routes - Templates are stored in the roles table as 'md' field
    app.get('/api/templates/:role', authenticateUser, async (req, res) => {
        const role = req.params.role;
        const accountId = (req as any).accountId;
        
        try {
            // Get template from roles table where the .md content is stored
            const { data, error } = await publicdb
                .from('roles')
                .select('md')
                .eq('account_id', accountId)
                .eq('id', role)
                .single();
            
            if (error || !data || !data.md) {
                // Try fallback to default account if not found in user's account
                const { data: defaultData, error: defaultError } = await publicdb
                    .from('roles')
                    .select('md')
                    .eq('account_id', configManager.DEFAULT_ACCOUNT_ID)
                    .eq('id', role)
                    .single();
                
                if (defaultError || !defaultData || !defaultData.md) {
                    res.status(404).send('Template not found');
                } else {
                    res.send(defaultData.md);
                }
            } else {
                res.send(data.md);
            }
        } catch (error) {
            console.error('Error fetching template:', error);
            res.status(500).json({ error: 'Failed to fetch template' });
        }
    });

    app.put('/api/templates/:role', authenticateUser, async (req, res) => {
        const role = req.params.role;
        const accountId = (req as any).accountId;
        const content = req.body;
        
        try {
            // Update template in roles table - the 'md' field contains the template content
            const { error } = await publicdb
                .from('roles')
                .update({
                    md: content,
                    updated_at: new Date().toISOString()
                })
                .eq('account_id', accountId)
                .eq('key', role);
            
            if (error) {
                return res.status(500).json({ error: error.message });
            }
            
            res.status(200).send();
        } catch (error) {
            console.error('Error saving template:', error);
            res.status(500).json({ error: 'Failed to save template' });
        }
    });

    // Role routes - Return roles with proper ID field
    app.get('/api/roles', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const account = await configManager.getAccount(accountId);
        
        // Transform roles object to include proper id field for UI
        const rolesWithIds:any = {};
        if (account?.roles) {
            Object.entries(account.roles).forEach(([key, role]) => {
                rolesWithIds[key] = {
                    ...role,
                    id: key // Add id field from the object key
                };
            });
        }
        
        res.json(rolesWithIds || {});
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
        const account = await configManager.getAccount(accountId);
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
        const account = await configManager.getAccount(accountId);
        if (account?.roles[req.params.id]) {
            res.json(account.roles[req.params.id]);
        } else {
            res.status(404).send('Role not found');
        }
    });


    // Model routes - Pure Supabase implementation
    app.get('/api/models', async (req, res) => {
        try {
            // Get models from Supabase
            const { data: models, error } = await publicdb
                .from('models')
                .select('*')
                .order('display_name', { ascending: true });
            
            if (error) {
                console.error('Error fetching models:', error);
                res.status(500).json({ error: 'Failed to fetch models' });
            } else {
                // Transform Supabase data to expected format
                const toolmodels = models?.filter(m => m.category === 'tool').map(m => ({
                    id: m.id,
                    name: m.display_name || m.name,
                    description: m.description || '',
                    provider: m.provider,
                    supported_parameters: m.supported_parameters || []
                })) || [];
                
                const flashmodels = models?.filter(m => m.category === 'flash').map(m => ({
                    id: m.id,
                    name: m.display_name || m.name,
                    description: m.description || '',
                    provider: m.provider,
                    supported_parameters: m.supported_parameters || []
                })) || [];
                
                res.json({ toolmodels, flashmodels });
            }
        } catch (error) {
            console.error('Error in models endpoint:', error);
            res.status(500).json({ error: 'Failed to fetch models' });
        }
    });

    // Preset routes - Pure Supabase implementation
    app.get('/api/presets', async (req, res) => {
        try {
            // Get presets from Supabase
            const { data: presets, error } = await publicdb
                .from('presets')
                .select('*')
                .order('name', { ascending: true });
            
            if (error) {
                console.error('Error fetching presets:', error);
                res.status(500).json({ error: 'Failed to fetch presets' });
            } else {
                // Transform Supabase data to expected format
                const transformedPresets = presets?.map(preset => ({
                    id: preset.id,
                    name: preset.name,
                    description: preset.preset || '', // Use 'preset' field as description
                    settings: {} // No settings field in current schema
                })) || [];
                
                res.json(transformedPresets);
            }
        } catch (error) {
            console.error('Error in presets endpoint:', error);
            res.status(500).json({ error: 'Failed to fetch presets' });
        }
    });

    // Bot routes - Return bot instances with proper IDs
    app.get('/api/bots', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const account = await configManager.getAccount(accountId);
        res.json(account?.instances.map(bot => ({
            id: bot.id,                    // Instance ID (primary identifier)
            bot_id: bot.bot_id,           // Bot type ID
            name: bot.name,
            role: bot.role,
            cli: bot.cli,
            enabled: bot.enabled,
            model: bot.model,
            preset: bot.preset,
            managedProjects: bot.managedProjects,
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
        const account = await configManager.getAccount(accountId);
        const bot = account?.instances.find(b => b.id === newBotData.id);
        res.status(201).json(bot);
    });

    app.put('/api/bots/:id', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const updatedBotData = req.body;
        
        // Get existing bot to preserve fields not being updated
        const account = await configManager.getAccount(accountId);
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
                updated_at: new Date().toISOString()
            })
            .eq('id', req.params.id)
            .eq('account_id', accountId);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // Update in memory
        const updatedAccount = await configManager.getAccount(accountId);
        const bot = updatedAccount?.instances.find(b => b.id === req.params.id);
        res.json(bot);
    });

    // Project routes
    app.get('/api/projects', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const account = await configManager.getAccount(accountId);
        res.json(account?.projects.map(project => ({
            id: project.id,
            name: project.name,
            description: project.description,
            repositoryUrl: project.repositoryUrl,
            assignedQa: project.assignedQa,
            discordChannelIds: project.discordChannelIds,
            gitKeyId: project.gitKeyId, // Include gitKeyId in response
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
        const account = await configManager.getAccount(accountId);
        const project = account?.projects.find(p => p.id === newProjectData.id);
        res.status(201).json(project);
    });

    app.put('/api/projects/:id', authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const updatedProjectData = req.body;
        
        // Get existing project to preserve fields not being updated
        const account = await configManager.getAccount(accountId);
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
        const updatedAccount = await configManager.getAccount(accountId);
        const project = updatedAccount?.projects.find(p => p.id === req.params.id);
        res.json(project);
    });

    // Git Key routes
    app.get('/api/gitkeys',  authenticateUser, async (req, res) => {
        const accountId = (req as any).accountId;
        const account = await configManager.getAccount(accountId);
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
        const account = await configManager.getAccount(accountId);
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
        await configManager.getAccount(accountId);
        res.status(204).send();
    });

    app.post('/api/register',  async (req, res) => {
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