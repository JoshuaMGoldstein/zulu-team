import * as fs from 'fs';
import * as path from 'path';
import { log } from './utils/log';
import { getApiUrl } from './utils/api';

class TemplateManager {

    constructor() {
    }

    public replaceMacros(content: string, instance: any): string {
        return content
            .replace(/\${INSTANCE_ID}/g, instance.id)
            .replace(/\${API_URL}/g, getApiUrl())
            .replace(/\${CLI}/g, instance.cli.toUpperCase());
    }
}

export default new TemplateManager();
