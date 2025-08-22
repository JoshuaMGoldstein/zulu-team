import * as fs from 'fs';
import * as path from 'path';
import { Model,Bot, Project, BotSettings } from './bots/types';
import {log} from './utils/log'
import { env } from 'process';
import { stringify } from 'querystring';
import { getApiUrl } from './utils/api';
import * as dotenv from 'dotenv';
dotenv.config();

class ConfigManager {
    private instances: Bot[];
    private projects: Project[];
    private settings: BotSettings;
    private roles: { [key: string]: BotSettings };
    private instancesPath: string;
    private projectsPath: string;
    private settingsPath: string;
    private rolesPath: string;

    private toolModels:Model[];
    private flashModels:Model[];

    private gitKeysPath: string;
    private gitKeys: any[];

    constructor() {
        this.instancesPath = path.join(__dirname, '../bot-instances/instances.json');
        this.projectsPath = path.join(__dirname, '../bot-instances/projects.json');
        this.settingsPath = path.join(__dirname, '../bot-instances/settings.json');
        this.rolesPath = path.join(__dirname, '../bot-instances/roles.json');
        this.gitKeysPath = path.join(__dirname, '../bot-instances/gitkeys.json');
        this.instances = [];
        this.projects = [];
        this.settings = {} as BotSettings;
        this.roles = {};
        this.gitKeys = [];

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
    public generateEnvForInstance(instance:Bot):Record<string,string> {
        let provider = this.getProviderForModel(instance.model);
        let env:Record<string,string> = {};

        env["LLMPROVIDER"] = provider;
        // Generate a random API_KEY for the bot instance
        const instanceApiKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
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
        this.instances = JSON.parse(fs.readFileSync(this.instancesPath, 'utf-8'));
        this.projects = JSON.parse(fs.readFileSync(this.projectsPath, 'utf-8'));
        this.settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'));
        this.roles = JSON.parse(fs.readFileSync(this.rolesPath, 'utf-8'));
        this.gitKeys = JSON.parse(fs.readFileSync(this.gitKeysPath, 'utf-8'));

        // Resolve provider from models.json (assume moonshot if not found)
        const modelsPath = path.resolve(__dirname, '../../models.json');

        if (fs.existsSync(modelsPath)) {
            const models = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'));
            this.toolModels = models.toolModels;
            this.flashModels = models.flashModels;            

        }

        for(let i=0; i<this.instances.length; i++) {
            let bot = this.instances[i]; 
            bot.files = this.generateFilesForInstance(bot);            
            bot.env = this.generateEnvForInstance(bot);
        }
    }

    public getInstances(): Bot[] {
        return this.instances;
    }

    public getProjects(): Project[] {
        return this.projects;
    }

    public getSettings(): BotSettings {
        return this.settings;
    }

    public getRoles(): { [key: string]: BotSettings } {
        return this.roles;
    }

    public getGitKeys(): any[] {
        return this.gitKeys;
    }
}

export default new ConfigManager();
