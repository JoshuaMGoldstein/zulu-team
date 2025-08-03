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

    constructor() {
        this.instancesPath = path.join(__dirname, '../bot-instances/instances.json');
        this.projectsPath = path.join(__dirname, '../bot-instances/projects.json');
        this.settingsPath = path.join(__dirname, '../bot-instances/settings.json');
        this.rolesPath = path.join(__dirname, '../bot-instances/roles.json');
        this.instances = [];
        this.projects = [];
        this.settings = {} as BotSettings;
        this.roles = {};
        this.load();
    }

    public load() {
        this.instances = JSON.parse(fs.readFileSync(this.instancesPath, 'utf-8'));
        this.projects = JSON.parse(fs.readFileSync(this.projectsPath, 'utf-8'));
        this.settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'));
        this.roles = JSON.parse(fs.readFileSync(this.rolesPath, 'utf-8'));
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
}

export default new ConfigManager();
