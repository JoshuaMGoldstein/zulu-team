import * as fs from 'fs';
import * as path from 'path';
import { log } from './utils/log';
import { getApiUrl } from './utils/api';

class TemplateManager {
    private templatesPath: string;
    private blueprintsPath: string;

    constructor() {
        this.templatesPath = path.join(__dirname, '../templates');
        this.blueprintsPath = path.join(__dirname, '../blueprints');
    }

    public ensureRoleTemplateExists(role: string) {
        const roleTemplatePath = path.join(this.templatesPath, 'roles', role, 'GEMINI.md');
        if (!fs.existsSync(roleTemplatePath)) {
            log(`Role template not found for role: ${role}. Creating from blueprint.`);
            const blueprintMdPath = path.join(this.blueprintsPath, 'GEMINI.md');
            if (fs.existsSync(blueprintMdPath)) {
                const blueprintContent = fs.readFileSync(blueprintMdPath, 'utf-8');
                fs.mkdirSync(path.dirname(roleTemplatePath), { recursive: true });
                fs.writeFileSync(roleTemplatePath, blueprintContent);
            }
        }
    }

    public applyTemplates(instance: any) {
        log(`Applying templates for instance ${instance.id}`);
        this.ensureRoleTemplateExists(instance.role);
        const instancePath = path.join(__dirname, `../bot-instances/${instance.id}`);
        if (!fs.existsSync(instancePath)) {
            fs.mkdirSync(instancePath, { recursive: true });
        }

        // 1. Apply generic blueprint
        const blueprintMdPath = path.join(this.blueprintsPath, 'GEMINI.md');
        let mdContent = fs.existsSync(blueprintMdPath) ? fs.readFileSync(blueprintMdPath, 'utf-8') : '';

        // 2. Apply role-specific template
        const roleTemplatePath = path.join(this.templatesPath, 'roles', instance.role, 'GEMINI.md');
        if (fs.existsSync(roleTemplatePath)) {
            mdContent += '\n' + fs.readFileSync(roleTemplatePath, 'utf-8');
        }

        // 3. Replace macros and write file
        mdContent = this.replaceMacros(mdContent, instance);
        fs.writeFileSync(path.join(instancePath, `${instance.cli.toUpperCase()}.md`), mdContent);

        // 4. Copy settings.json
        const settingsDir = path.join(instancePath, `.${instance.cli}`);
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }
        
        const roleSettingsPath = path.join(this.templatesPath, 'roles', instance.role, `.${instance.cli}`, 'settings.json');
        const blueprintSettingsPath = path.join(this.blueprintsPath, `.${instance.cli}`, 'settings.json');
        
        const settingsPath = fs.existsSync(roleSettingsPath) ? roleSettingsPath : blueprintSettingsPath;

        if (fs.existsSync(settingsPath)) {
            let settingsContent = fs.readFileSync(settingsPath, 'utf-8');
            settingsContent = this.replaceMacros(settingsContent, instance);
            fs.writeFileSync(path.join(settingsDir, 'settings.json'), settingsContent);
        }
    }

    private replaceMacros(content: string, instance: any): string {
        return content
            .replace(/\${INSTANCE_ID}/g, instance.id)
            .replace(/\${API_URL}/g, getApiUrl())
            .replace(/\${CLI}/g, instance.cli.toUpperCase());
    }
}

export default new TemplateManager();
