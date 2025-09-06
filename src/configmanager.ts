import * as fs from 'fs';
import * as path from 'path';
import { Model, Bot, Project, BotSettings, RoleSettings, InheritedBoolean, Verbosity } from './bots/types';
import {log} from './utils/log'
import { env } from 'process';
import { stringify } from 'querystring';
import { getApiUrl } from './utils/api';
import * as dotenv from 'dotenv';
import {publicdb, PSQLERROR} from './supabase';
import {assert, logAssert} from './utils/assert';
import templatemanager from './templatemanager';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import { randomUUID } from 'crypto';
import {Database} from './db/public.types';
import gcsUtil from './utils/gs';

dotenv.config();

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000000';


type Bot_Instance = Database['public']['Tables']['bot_instances']['Row'];

class Account {
    public instances: Bot[] = [];
    public projects: Project[] = [];
    public settings: BotSettings = {} as BotSettings;//Object.assign({}, DefaultBotSettings);
    public roles: { [key: string]: BotSettings }= {};
    public gitKeys: any[] = [];
    public buckets: any[] = [];
    public mounts: any[] = [];
    public defaultBucketId: string | null = null;
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
    public generateEnvForInstance(instance:Bot_Instance):Record<string,string> {
        let provider = this.getProviderForModel(instance.model);
        let env:Record<string,string> = {};

        env["LLMPROVIDER"] = provider;
        // Generate a random API_KEY for the bot instance
        // It is formatted {account_id}_{randomstring}
        const instanceApiKey = instance.account_id+"|"+Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        env["API_KEY"] = instanceApiKey;
        env["INSTANCE_ID"] = instance.id;
        env["API_URL"] = getApiUrl();

        log("Instance container is type: "+instance.cli);

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

    private async generateFilesForInstance(instance:Bot_Instance):Promise<Record<string,string|Buffer>> {
        const files:Record<string,string|Buffer> = {};
        
        try {            
            //split imageName into alias and the imageName
            /*let splitImageName = instance.imageName.split('/');
            if(splitImageName.length ==1) {
             // Load container image name from our account 
                const { data: containerImage, error:containerImageError} = await publicdb
                    .from('container_images')    
                    .select('cli')
                    .eq('account_id',${instance.account_id});
            } else {
                //Get a public image (or maybe the alias is for our own account?)
            }*/

            let cli = 'gemini';            

            // Load role-specific MD from database
            const { data: roleData, error: roleError } = await publicdb
                .from('roles')
                .select('*')
                .eq('id', instance.role)
                .eq('account_id', instance.account_id);

            // Check if role has .md content in current account
            if (!roleError && roleData.length >= 1 && roleData[0]?.md) {
                // Apply macro replacement to the role MD
                const processedMd = templatemanager.replaceMacros(roleData[0].md, instance);
                files[`/workspace/${cli.toUpperCase()}.md`] = processedMd;
            } else {
                // Try to load from default account
                if (instance.account_id !== DEFAULT_ACCOUNT_ID) {
                    const defaultAccount = this.accounts.get(DEFAULT_ACCOUNT_ID);
                    if (defaultAccount && defaultAccount.roles[instance.role]) {
                        // Use the role data from the default account
                        const defaultRole = defaultAccount.roles[instance.role] as RoleSettings;
                        if (defaultRole && defaultRole.md) {
                            // Apply macro replacement to the default role MD
                            const processedMd = templatemanager.replaceMacros(defaultRole.md, instance);
                            files[`/workspace/${cli.toUpperCase()}.md`] = processedMd;
                        }
                    }
                }
                
                // Log if still no .md file found
                if (!files[`/workspace/${cli.toUpperCase()}.md`]) {
                    console.log(`Couldn't load .MD file for role: ${instance.role}`);
                }
            }

            // Load container-specific settings from database
            // FIXME - this image might be a slash delimited public image from another account

            const { data: containerFiles, error: containerError } = await publicdb
                .from('container_image_files')
                .select('*')
                .eq('container_name', instance.image);
                        
            (containerFiles || []).reduce( (acc, x) => { 
                acc[x.filename] = x.text || (x.data?Buffer.from(x.data,'hex') : ''); return acc;
            } ,files);


        } catch (e) {
            log(`Error generating files for instance ${instance.id}: ${e}`);
        }

        return files;
    }

    private uuidToBase36(uuid: string): string {
        const cleanUuid = uuid.replace(/-/g, '');
        const bigIntUuid = BigInt(`0x${cleanUuid}`);
        return bigIntUuid.toString(36).toUpperCase();
    }

    private async initializeGCSResources(accountId: string) {
        // Skip GCS resource initialization for the default account
        if (accountId === DEFAULT_ACCOUNT_ID) {
            return;
        }

        // Check for existing service account
        const { data: existingServiceAccount } = await publicdb
            .from('service_accounts')
            .select('*')
            .eq('account_id', accountId)
            .single();

        let serviceAccountData = existingServiceAccount;

        if (!existingServiceAccount) {
            // Create new service account
            const projectId = process.env.GCP_PROJECT_ID;
            if (!projectId) {
                throw new Error("GCP_PROJECT_ID not set in environment variables.");
            }

            const serviceAccountName = 'acct-'+this.uuidToBase36(`${accountId}`);
            const serviceAcctEmail = `${serviceAccountName}@${projectId}.iam.gserviceaccount.com`;

            try { 
                // Create service account using GCS utility
                await gcsUtil.createServiceAccount(serviceAccountName, `Zulu Bot Service Account for ${accountId}`);
                
                // Create key using GCS utility and get key data directly
                const keyData = await gcsUtil.createServiceAccountKey(serviceAcctEmail);

                // Store in database
                const { data: newServiceAccount, error: serviceAccountError } = await publicdb
                    .from('service_accounts')
                    .insert({
                        account_id: accountId,                        
                        private_key: keyData.private_key,
                        private_key_id: keyData.private_key_id,
                        client_id: keyData.client_id,
                        client_email: serviceAcctEmail
                    })
                    .select()
                    .single();

                if (serviceAccountError) {
                    throw serviceAccountError;
                }
                serviceAccountData = newServiceAccount;

                if (!serviceAccountData) {
                    throw new Error("Failed to retrieve or create service account.");                    
                }
            } catch(e) {
                // Clean up key file and delete service account
                try {
                    await gcsUtil.deleteServiceAccount(serviceAcctEmail);
                } catch (cleanupError) {
                    console.error('Error cleaning up service account:', cleanupError);
                }
                throw e;
            }

        }

        // Check if bucket already exists
        const { data: existingBucket } = await publicdb
            .from('buckets')
            .select('*')
            .eq('account_id', accountId)
            .single();

        let bucketData = existingBucket;

        if (!existingBucket) {
            // Create new bucket using GCS utility
            const bucketName = `zulu-bot-${accountId}`;
            const projectId = process.env.GCP_PROJECT_ID;
            if (!projectId) {
                throw new Error("GCP_PROJECT_ID not set in environment variables.");
            }

            await gcsUtil.createBucket(bucketName);

            // Grant permissions to service account using GCS utility
            const serviceAccountEmail = serviceAccountData?.client_email;
            if (!serviceAccountEmail) {
                throw new Error("Service account email not found.");
            }
            
            await gcsUtil.addBucketIamPolicy(bucketName, `serviceAccount:${serviceAccountEmail}`, 'roles/storage.objectAdmin');

            // Store in database
            const { data: newBucket, error: bucketError } = await publicdb
                .from('buckets')
                .insert({
                    account_id: accountId,
                    bucket_name: bucketName
                })
                .select()
                .single();

            if (bucketError) {
                throw bucketError;
            }
            bucketData = newBucket;

            // Update account with default bucket
            if (newBucket) {
                await publicdb
                    .from('accounts')
                    .update({ default_bucket_id: newBucket.id })
                    .eq('id', accountId);
            }
        }

        return { serviceAccount: serviceAccountData, bucket: bucketData };
    }

    private async loadAccountBucketsAndMounts(accountId: string, account: Account) {
        // Skip bucket and mount loading for the default account
        if (accountId === DEFAULT_ACCOUNT_ID) {
            return;
        }

        // Load buckets
        const { data: buckets, error: bucketsError } = await publicdb
            .from('buckets')
            .select('*')
            .eq('account_id', accountId);

        if (bucketsError) throw bucketsError;
        account.buckets = buckets || [];

        // Load mounts
        const { data: mounts, error: mountsError } = await publicdb
            .from('mounts')
            .select('*')
            .eq('account_id', accountId);

        if (mountsError) throw mountsError;
        account.mounts = mounts || [];

        // Get default bucket ID from account settings
        const { data: accountSettings, error: accountSettingsError } = await publicdb
            .from('accounts')
            .select('default_bucket_id')
            .eq('id', accountId)
            .single();

        if (accountSettingsError && accountSettingsError.code !== 'PGRST116') throw accountSettingsError;
        account.defaultBucketId = accountSettings?.default_bucket_id || null;
    }

    public async load() {
        try {
            const { data: models, error } = await publicdb
                .from('models')
                .select('*');

            if (!error) {
                // Successfully loaded from Supabase
                this.toolModels = models
                    .filter((m: any) => m.category === 'tool')
                    .map((m: any) => ({
                        id: m.id,
                        name: m.display_name || m.name,
                        description: m.description || '',
                        provider: m.provider,
                        supported_parameters: m.supported_parameters || []
                    }));
                this.flashModels = models
                    .filter((m: any) => m.category === 'flash')
                    .map((m: any) => ({
                        id: m.id,
                        name: m.display_name || m.name,
                        description: m.description || '',
                        provider: m.provider,
                        supported_parameters: m.supported_parameters || []
                    }));
                console.log(`Loaded ${this.toolModels.length} tool models and ${this.flashModels.length} flash models from Supabase`);
            }
        } catch(e:any) {
            console.log("Error loading models");
         }
    }
    private async syncBotInstancesFiles(accountId: string, account: Account) {
        try {
            // Get the default bucket for this account
            const defaultBucket = account.buckets.find(b => b.id === account.defaultBucketId);
            if (!defaultBucket) {
                console.log(`No default bucket found for account ${accountId}`);
                return;
            }

            const bucketName = defaultBucket.bucket_name;
            
            // Create instances.json content
            const instancesData = account.instances.map(instance => ({
                id: instance.id,
                name: instance.name,
                bot_id: instance.bot_id,
                role: instance.role,
                image: instance.imageName,
                cli: instance.cli,
                model: instance.model,
                preset: instance.preset,
                enabled: instance.enabled,
                managed_projects: instance.managedProjects,
                working_directory: instance.workingDirectory
            }));

            // Create projects.json content
            const projectsData = account.projects.map(project => ({
                id: project.id,
                name: project.name,
                description: project.description,
                repository_url: project.repositoryUrl,
                assigned_qa: project.assignedQa,
                discord_channel_ids: project.discordChannelIds,
                created_at: project.createdAt,
                updated_at: project.updatedAt
            }));

            // Upload to GCS using pipe capability
            //Removed await for speed up.
            gcsUtil.uploadData(
                JSON.stringify(instancesData, null, 2),
                bucketName,
                'bot-instances/instances.json'
            );

            gcsUtil.uploadData(
                JSON.stringify(projectsData, null, 2),
                bucketName,
                'bot-instances/projects.json'
            );

            console.log(`✅ Synced bot-instances files to GCS bucket ${bucketName}`);

        } catch (error) {
            console.error('Error syncing bot-instances files to GCS:', error);
            // Don't throw - this is non-critical
        }
    }

    public async loadUpdateAccount(accountId:string):Promise<Account> {
        let account = this.accounts.get(accountId);
        if(!account) account = new Account();

        try {
            // Initialize GCS resources (service account, default bucket)
            await this.initializeGCSResources(accountId);

            // Load account-specific buckets and mounts
            await this.loadAccountBucketsAndMounts(accountId, account);

            

            //FIXME: Get bot settings and apply to bot
            const { data: botsettings, error: botSettingsError } = await publicdb
                .from('bot_settings')
                .select('*')
                .eq('account_id', accountId);
            if(botSettingsError && botSettingsError.code != PSQLERROR.NORESULTS) throw botSettingsError;

            let mappedBotSettings:Record<string, BotSettings> = {};
                        
            ( botsettings || [] ).reduce(
                (acc, x)=> {
                mappedBotSettings[x.instance_id] = {
                delegatedVerbosity: x.delegated_verbosity || -1,
                dmVerbosity: x.dm_verbosity || -1,
                channelVerbosity: x.channel_verbosity || -1,
                mountBotInstances: x.mount_bot_instances || InheritedBoolean.INHERIT,
                allowDelegation: x.allow_delegation || InheritedBoolean.INHERIT
                }
                return mappedBotSettings;
            },
            {}); //initialvalue
           

            // Get bot instances
            const { data: instances, error: instancesError } = await publicdb
                .from('bot_instances')
                .select('*')
                .eq('account_id', accountId);
            
            if (instancesError) throw instancesError;
            
            if(instances) {
                for(var i=0; i<instances.length; i++) {
                    let inst = instances[i];
                    account.instances.push({
                        account_id: inst.account_id,
                        bot_id: inst.bot_id,
                        id: inst.id,
                        name: inst.name,
                        role: inst.role || 'developer',
                        imageName: inst.image || 'gemini-docker',
                        cli: inst.cli || 'gemini',
                        enabled: inst.enabled !== false,
                        model: inst.model || 'auto',
                        preset: inst.preset || 'auto',
                        //discordBotToken: inst.discord_bot_token || '',
                        //discordChannelId: inst.discord_channel_id || '',
                        managedProjects: inst.managed_projects.split(',').map(p=>p.trim()) || [],
                        settings: mappedBotSettings[inst.id] ?? { dmVerbosity:-1, channelVerbosity: -1, delegatedVerbosity: -1},
                        files: await this.generateFilesForInstance(inst),
                        env: this.generateEnvForInstance(inst),
                        lastActivity: inst.updated_at || new Date().toISOString(),
                        workingDirectory: `bot-instances/${inst.id}`
                    });
                }
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

            // Sync bot-instances folder with projects.json and instances.json after populating them
            await this.syncBotInstancesFiles(accountId, account);

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
                    allowDelegation: role.allow_delegation || false,
                    md: role.md || ''
                } as RoleSettings;
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
        
        // If account is still not found or missing critical data, try inheritance from default account
        if (!account || !account.roles || Object.keys(account.roles).length === 0) {
            const defaultAccount = await this.getAccount(DEFAULT_ACCOUNT_ID);
            if (defaultAccount) {
                if (!account) {
                    account = defaultAccount;
                } else {
                    // Merge with default account data
                    account = this.mergeWithDefaultAccount(account, defaultAccount);
                }
            }
        }
        
        return account;
    }

    public mergeSettings(settings:any[]):any {
        let finalSettings = settings[settings.length-1];
        for(var i=settings.length-1; i>=0; i--) {
            let keys = Object.keys(settings[i]);
            for(var k=0; k<keys.length; k++) {
                let key = keys[k];
                if(settings[i][key]!=-1) {
                    finalSettings[key] = settings[i][key];
                }
            }
        }
        return finalSettings;
    }

    public async getBotInstanceAppliedSettings(instance:Bot):Promise<BotSettings> {
        let botSettings:BotSettings = instance.settings ?? { dmVerbosity:Verbosity.INHERIT,channelVerbosity:Verbosity.INHERIT,delegatedVerbosity:Verbosity.INHERIT};
        let roles = await this.getRoles(instance.account_id);
        let roleSettings:BotSettings = roles[instance.role] ?? { dmVerbosity:Verbosity.INHERIT,channelVerbosity:Verbosity.INHERIT,delegatedVerbosity:Verbosity.INHERIT};
        
        let globalSettings:BotSettings = await this.getSettings(instance.account_id)?? { dmVerbosity:Verbosity.TOOLHOOKS_AND_STDOUT,channelVerbosity:Verbosity.TOOLHOOKS_AND_STDOUT,delegatedVerbosity:Verbosity.STDOUT};
        let appliedSettings = this.mergeSettings([botSettings,roleSettings,globalSettings]);
        return appliedSettings;
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

    public async getRoles(accountId:string): Promise<{ [key: string]: RoleSettings }> {
        const account = await this.getAccount(accountId);
        const accountRoles = account?.roles ?? {};
        
        // If account has no roles, inherit all roles from default account
        if (Object.keys(accountRoles).length === 0) {
            const defaultAccount = await this.getAccount(DEFAULT_ACCOUNT_ID);
            return defaultAccount?.roles ?? {};
        }
        
        // Merge account roles with missing roles from default account
        const defaultAccount = await this.getAccount(DEFAULT_ACCOUNT_ID);
        const defaultRoles = defaultAccount?.roles ?? {};
        
        // Add missing roles from default account to the result
        const mergedRoles = { ...accountRoles };
        for (const [roleName, roleSettings] of Object.entries(defaultRoles)) {
            if (!mergedRoles[roleName]) {
                mergedRoles[roleName] = roleSettings;
            }
        }
        
        // TODO: In future version, add support for marking roles as 'deleted' in Supabase
        // so they can be excluded even if they exist in the default account
        
        return mergedRoles;
    }

    public async getRoleData(accountId:string, role:string): Promise<RoleSettings|undefined> {
        const account = await this.getAccount(accountId);
        const accountRole = account?.roles?.[role];
        
        // If role exists in account, return it
        if (accountRole) {
            return accountRole;
        }
        
        // If role doesn't exist in account, try to get it from default account
        const defaultAccount = await this.getAccount(DEFAULT_ACCOUNT_ID);
        return defaultAccount?.roles?.[role];
    }

    public async getGitKeys(accountId:string): Promise<any[]> {
        return (await this.getAccount(accountId))?.gitKeys??[];
    }

    private async loadDefaultAccount(): Promise<Account | undefined> {
        try {
            return await this.loadUpdateAccount(DEFAULT_ACCOUNT_ID);
        } catch (error) {
            console.error('Error loading default account:', error);
            return undefined;
        }
    }

    private mergeWithDefaultAccount(account: Account, defaultAccount: Account): Account {
        // Merge roles from default account if they don't exist in the current account
        if (!account.roles || Object.keys(account.roles).length === 0) {
            account.roles = defaultAccount.roles;
        } else {
            // Add missing roles from default account
            for (const [roleName, roleSettings] of Object.entries(defaultAccount.roles)) {
                if (!account.roles[roleName]) {
                    account.roles[roleName] = roleSettings;
                }
            }
        }

        // Merge settings if they don't exist
        if (!account.settings || Object.keys(account.settings).length === 0) {
            account.settings = defaultAccount.settings;
        }

        return account;
    }

    public async getServiceAccount(accountId: string): Promise<any | undefined> {
        const { data: serviceAccount, error } = await publicdb
            .from('service_accounts')
            .select('*')
            .eq('account_id', accountId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return serviceAccount || undefined;
    }
}

export default new ConfigManager();
