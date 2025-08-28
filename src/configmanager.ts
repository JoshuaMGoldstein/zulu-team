import * as fs from 'fs';
import * as path from 'path';
import { Model,Bot, Project, BotSettings } from './bots/types';
import {log} from './utils/log'
import { env } from 'process';
import { stringify } from 'querystring';
import { getApiUrl } from './utils/api';
import * as dotenv from 'dotenv';
import {publicdb, PSQLERROR} from './supabase';
import {assert, logAssert} from './utils/assert';

dotenv.config();

class Account {
    public instances: Bot[] = [];
    public projects: Project[] = [];
    public settings: BotSettings = {} as BotSettings;//Object.assign({}, DefaultBotSettings);
    public roles: { [key: string]: BotSettings }= {};
    public gitKeys: any[] = [];
}

class ConfigManager {
    private accounts:Map<string,Account> = new Map(); //map from accountID to Account

    private toolModels:Model[];
    private flashModels:Model[];

    constructor() {
        this.toolModels =[];
        this.flashModels = [];

        this.load();
    }

    public getProviderForModel(model:string) {
        let modelFlag = (model === 'auto')?'kimi-k2-turbo-preview':model;
        let provider='moonshot'; //default
        const found = this.toolModels.find((m: any) => m.id === model);
        if (found) provider = found.provider;
        return provider;
    }

    //FIXME: We need to have our own /chat/completions endpoint so that we dont have to give API KEYS to the bots, because thats insecure and ridiculous.
    //Plus this is the only way we can seriously track usage for billing
    //And is the gateway to our being our own inference provider.
    public generateEnvForInstance(instance:Bot):Record<string,string> {
        let provider = this.getProviderForModel(instance.model);
        let env:Record<string,string> = {};

        env["LLMPROVIDER"] = provider;
        // Generate a random API_KEY for the bot instance
        // It is formatted {account_id}_{randomstring}
        const instanceApiKey = instance.account_id+"|"+Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        env["API_KEY"] = instanceApiKey;
        env["INSTANCE_ID"] = instance.id;
        env["API_URL"] = getApiUrl();

        log("Instance cli is type: "+instance.cli);

        if (instance.cli === 'gemini') {
            env!['GEMINI_API_KEY'] = process.env.GEMINI_API_KEY || '';
            if (provider === 'moonshot') {
                env!['OPENAI_API_KEY'] = process.env.MOONSHOT_API_KEY || '';
                env!['OPENAI_BASE_URL'] = process.env.MOONSHOT_BASE_URL || '';                
            } else if (provider === 'openrouter') {
                env!['OPENAI_API_KEY'] = process.env.OPENAI_API_KEY || '';
                env!['OPENAI_BASE_URL'] = process.env.OPENAI_BASE_URL || '';
            }
        }
        return env;
    }

    private generateFilesForInstance(instance:Bot):Record<string,string> {
        const volumePath = path.resolve(__dirname, `../bot-instances/${instance.id}`);
        let files:Record<string,string>={};
        try {
            if(instance.cli == 'gemini') {
                files[`/workspace/.${instance.cli}/settings.json`] = fs.readFileSync(`${volumePath}/.${instance.cli}/settings.json`).toString('utf8');
                files['/workspace/GEMINI.md'] = fs.readFileSync(`${volumePath}/GEMINI.md`).toString('utf8');
            } else if(instance.cli == 'claude') {
                files[`/workspace/.${instance.cli}/settings.json`] = fs.readFileSync(`${volumePath}/.${instance.cli}/settings.json`).toString('utf8');
                files['/workspace/CLAUDE.md'] = fs.readFileSync(`${volumePath}/CLAUDE.md`).toString('utf8');
            }
        } catch(e) {
            log(`Error generating Files for instance ${instance.id}`);
        }
      

        return files;
    }

    public load() {
        // Resolve provider from models.json (assume moonshot if not found)
        const modelsPath = path.resolve(__dirname, '../../models.json');

        if (fs.existsSync(modelsPath)) {
            const models = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'));
            this.toolModels = models.toolModels;
            this.flashModels = models.flashModels;            
        }

    }
    public async loadUpdateAccount(accountId:string):Promise<Account> {
        let account = this.accounts.get(accountId);
        if(!account) account = new Account();

        try {
            // Get bot instances
            const { data: instances, error: instancesError } = await publicdb
                .from('bot_instances')
                .select('*')
                .eq('account_id', accountId);
            
            if (instancesError) throw instancesError;
            
            account.instances = (instances || []).map(inst => ({
                account_id: inst.account_id,
                bot_id: inst.bot_id,
                id: inst.id,
                name: inst.name,
                role: inst.role || 'developer',
                cli: inst.cli || 'gemini',
                enabled: inst.enabled !== false,
                model: inst.model || 'auto',
                preset: inst.preset || 'auto',
                //discordBotToken: inst.discord_bot_token || '',
                //discordChannelId: inst.discord_channel_id || '',
                managedProjects: inst.managed_projects.split(',').map(p=>p.trim()) || [],
                settings: {},
                files: this.generateFilesForInstance(inst as any),
                env: this.generateEnvForInstance(inst as any),
                status: inst.status || 'idle',
                lastActivity: inst.updated_at || new Date().toISOString(),
                workingDirectory: `bot-instances/${inst.id}`
            })) as Bot[];

            //FIXME: Get bot settings and apply to bot
            const { data: botsettings, error: botSettingsError } = await publicdb
                .from('bot_settings')
                .select('*')
                .eq('account_id', accountId);
            if(botSettingsError && botSettingsError.code != PSQLERROR.NORESULTS) throw botSettingsError;
            if(botsettings) {
                botsettings.forEach( (x) => {
                    let instance = account.instances.find(y => y.id == x.instance_id);
                    if(instance) {
                        instance.settings = {delegatedVerbosity: x.delegated_verbosity, 
                            dmVerbosity: x.dm_verbosity, 
                            channelVerbosity: x.channel_verbosity,
                            mountBotInstances: x.mount_bot_instances, 
                            allowDelegation: x.allow_delegation};
                    }
                } );
            }                    

            // Get projects
            const { data: projects, error: projectsError } = await publicdb
                .from('projects')
                .select('*')
                .eq('account_id', accountId);
            
            if (projectsError) throw projectsError;
            account.projects = (projects || []).map(project => ({
                account_id:project.account_id,
                id: project.id,
                name: project.name,
                description: project.description || '',
                repositoryUrl: project.repository_url || '',
                assignedQa: project.assigned_qa || '',
                discordChannelIds: project.discord_channel_ids.split(',').map(c=>c.trim()) || [],
                //settings: project.settings || {},
                createdAt: project.created_at || new Date().toISOString(),
                updatedAt: project.updated_at || new Date().toISOString()
            })) as Project[];

            // Get settings
            const { data: settings, error: settingsError } = await publicdb
                .from('settings')
                .select('*')
                .eq('account_id', accountId)
                .single();
            
            if (settingsError && settingsError.code !== 'PGRST116') throw settingsError;
            account.settings = {
                dmVerbosity: settings?.dm_verbosity || -1,
                channelVerbosity: settings?.channel_verbosity || -1,
                delegatedVerbosity: settings?.delegated_verbosity || -1,
            } as BotSettings;

            // Get roles
            const { data: roles, error: rolesError } = await publicdb
                .from('roles')
                .select('*')
                .eq('account_id', accountId);
            
            if (rolesError) throw rolesError;
            account.roles = {};
            roles?.forEach(role => {
                account.roles[role.id] = {
                    name: role.name || '',
                    description: role.description || '',
                    dmVerbosity: role.dm_verbosity || -1,
                    channelVerbosity: role.channel_verbosity || -1,
                    delegatedVerbosity: role.delegated_verbosity || -1,
                    mountBotInstances: role.mount_bot_instances || false,
                    allowDelegation: role.allow_delegation || false
                } as BotSettings;
            });

            // Get git keys
            const { data: gitKeys, error: gitKeysError } = await publicdb
                .from('git_keys')
                .select('*')
                .eq('account_id', accountId);
            
            if (gitKeysError) throw gitKeysError;
            account.gitKeys = (gitKeys || []).map(key => ({
                id: key.id,
                name: key.name,
                value: key.private_key || ''
            }));

        } catch (error) {
            log(`Error loading account ${accountId}:`, error);
            // Return empty account on error to prevent crashes
        }

        this.accounts.set(accountId, account);
        return account;
    }

    public async getAccount(accountId:string):Promise<Account|undefined> {
        let account = this.accounts.get(accountId);
        if(!account) {
            try {
                account = await this.loadUpdateAccount(accountId)
            } catch(e) {
                return undefined;
            }
        }
        return account;
    }

    public async getInstances(accountId:string): Promise<Bot[]> {        
        return (await this.getAccount(accountId))?.instances??[];
    }
    public async getInstanceForBot(accountId:string, bot_id:string):Promise<Bot|undefined> {
        let instances = await this.getInstances(accountId);
        return instances.find(x=>x.bot_id==bot_id);
    }

    public async getProjects(accountId:string): Promise<Project[]> {        
        return (await this.getAccount(accountId))?.projects??[];
    }

    public async getSettings(accountId:string): Promise<BotSettings|undefined> {        
        return (await this.getAccount(accountId))?.settings??undefined;
    }

    public async getRoles(accountId:string): Promise<{ [key: string]: BotSettings }> {
        return (await this.getAccount(accountId))?.roles??{};
    }

    public async getGitKeys(accountId:string): Promise<any[]> {
        return (await this.getAccount(accountId))?.gitKeys??[];
    }
}

export default new ConfigManager();
