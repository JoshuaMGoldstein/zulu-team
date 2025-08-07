import * as fs from 'fs';
import * as path from 'path';
import { Bot, Project, BotSettings } from './bots/types';

class ConfigManager {
    private instances: Bot[];
    private projects: Project[];
    private settings: BotSettings;
    private roles: { [key: string]: BotSettings };
    private instancesPath: string;
    private projectsPath: string;
    private settingsPath: string;
    private rolesPath: string;

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
        this.load();
    }

    public load() {
        this.instances = JSON.parse(fs.readFileSync(this.instancesPath, 'utf-8'));
        this.projects = JSON.parse(fs.readFileSync(this.projectsPath, 'utf-8'));
        this.settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'));
        this.roles = JSON.parse(fs.readFileSync(this.rolesPath, 'utf-8'));
        this.gitKeys = JSON.parse(fs.readFileSync(this.gitKeysPath, 'utf-8'));
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
