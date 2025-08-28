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

    const error = new Error();
    // The stack trace will vary slightly between environments,
    // but typically the third line (index 2) contains the caller's info.
    const stackLines = error.stack?.split('\n')??[];
    let callerInfo = '';

    if (stackLines.length > 2) {
        // Attempt to extract the file and line number from the stack trace
        // This might need adjustment based on your specific Node.js version and environment
        const match = stackLines[2].match(/\((.*):(\d+):(\d+)\)/) || stackLines[2].match(/at (.*):(\d+):(\d+)/);
        if (match) {
        const filePath = match[1];
        const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
        const lineNumber = match[2];
        callerInfo = `(${fileName}:${lineNumber})`;
        }
  }

    
    // Append to log file
    fs.appendFileSync(logFilePath, logMessage);
    
    console.log(...[callerInfo].concat(args));

};
