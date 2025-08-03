import * as fs from 'fs';
import * as path from 'path';
import { log } from './utils/log';
import * as os from 'os'

class TemplateManager {
    private templatesPath: string;

    constructor() {
        this.templatesPath = path.join(__dirname, '../templates');
    }

    public applyTemplates(instance: any) {
        log(`Applying templates for instance ${instance.id}`);
        const rolePath = path.join(this.templatesPath, 'roles', instance.role);
        if (!fs.existsSync(rolePath)) {
            log(`Role template not found for role: ${instance.role}`);
            return;
        }

        const instancePath = path.join(__dirname, `../bot-instances/${instance.id}`);
        if (!fs.existsSync(instancePath)) {
            fs.mkdirSync(instancePath, { recursive: true });
        }

        // Copy MD file
        const mdTemplatePath = path.join(rolePath, `${instance.cli.toUpperCase()}.md`);
        if (fs.existsSync(mdTemplatePath)) {
            let mdContent = fs.readFileSync(mdTemplatePath, 'utf-8');
            mdContent = this.replaceMacros(mdContent, instance);
            fs.writeFileSync(path.join(instancePath, `${instance.cli.toUpperCase()}.md`), mdContent);
        }

        // Copy settings.json
        const settingsDir = path.join(instancePath, `.${instance.cli}`);
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }
        const settingsTemplatePath = path.join(rolePath, `.${instance.cli}`, 'settings.json');
        if (fs.existsSync(settingsTemplatePath)) {
            let settingsContent = fs.readFileSync(settingsTemplatePath, 'utf-8');
            settingsContent = this.replaceMacros(settingsContent, instance);
            fs.writeFileSync(path.join(settingsDir, 'settings.json'), settingsContent);
        }
    }

    private replaceMacros(content: string, instance: any): string {
        return content
            .replace(/\${INSTANCE_ID}/g, instance.id)
            .replace(/\${API_URL}/g, process.env.API_URL??'http://host.docker.internal:3001');
    }

    public getApiUrl() {
        if( process.env.API_URL) {
            return process.env.API_URL;
        } else if(os.platform() === 'win32') {
            return 'http://host.docker.internal:'+(process.env.PORT??'3001');
        } else {
            return 'http://localhost:'+(process.env.PORT??'3001');
        }                
    }
}

export default new TemplateManager();
