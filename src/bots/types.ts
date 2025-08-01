export enum ClaudeModels {
    CLAUDE_SONNET_4 = "claude-sonnet-4-20250514",
    CLAUDE_OPUS_4 = "claude-opus-4-20250514",
}

export enum GeminiModels {
    GEMINI_2_5_PRO = "gemini-2.5-pro",
    GEMINI_2_5_FLASH = "gemini-2.5-flash",
    GEMINI_2_5_FLASH_LITE = "gemini-2.5-flash-lite",
    GEMINI_2_0_FLASH = "gemini-2.0-flash",
}

export enum BotEventType {
    STDOUT = 'STDOUT',
    STDERR = 'STDERR',
    TOOLCALL = 'TOOLCALL',
    CLOSE = 'CLOSE',
}

export interface BotOutput {
    type: BotEventType;
    output: string | any; // string for stdout/stderr/close, any for tool call
    next?: Promise<BotOutput>;
}

export interface Bot {
    id: string;
    role: 'developer' | 'project-manager';
    cli: 'gemini' | 'claude';
    enabled: boolean;
    model: ClaudeModels | GeminiModels;
    settings: any;
    claudeMd: string;
}
