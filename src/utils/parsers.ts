export const parseCodeBlocks = (message: string) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
    const result: { [key: string]: string[] } = {
        json: [],
        javascript: [],
    };
    let match;

    while ((match = codeBlockRegex.exec(message)) !== null) {
        const language = match[1] || 'unknown';
        const code = match[2];
        if (!result[language]) {
            result[language] = [];
        }
        result[language].push(code);
    }

    return {
        json: result.json,
        javascript: result.javascript,
        message,
    };
};
