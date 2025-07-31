import * as fs from 'fs';
import * as path from 'path';

const logsDir = path.join(__dirname, '../../.logs');
const logFilePath = path.join(logsDir, 'output.log');

// Ensure the .logs directory exists
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

export const log = (...args: any[]) => {
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            return JSON.stringify(arg, null, 2);
        }
        return arg;
    }).join(' ');

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;

    // Log to console
    console.log(...args);

    // Append to log file
    fs.appendFileSync(logFilePath, logMessage);
};
