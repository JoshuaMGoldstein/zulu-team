import { notStrictEqual } from "assert";
import { idText, isThisTypeNode, StringLiteral } from "typescript";
import { GeminiToolCall } from './gemini'
import { getTimestampFromSnowflakeId, getDateFromSnowflakeId } from "../utils/snowflake";
import { } from '../'
import { Message } from "discord.js";
import e from "express";

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

export enum BotRole {
    DEVELOPER = 'developer',
    PROJECT_MANAGER = 'project-manager',
    QA = 'qa'
}

export enum BotCLI {
    GEMINI = 'gemini',
    CLAUDE = 'claude'
}

export enum BotStatus {
    IDLE = 'idle',
    ACTIVE = 'active'
}


export interface Bot {
    id: string; //instance-id
    name:string;
    role: BotRole;
    cli: BotCLI;
    enabled: boolean;
    model: ClaudeModels | GeminiModels;
    discordBotToken: string;
    discordChannelId: string | string[];
    settings: BotSettings;
    status:BotStatus;
    workingDirectory:string;
    lastActivity:string; //Datetime
    managedProjects:string | string[];
}

export enum Verbosity {
    INHERIT = -1,
    NONE = 0,    
    STDOUT = 1,
    TOOLHOOKS = 2
}

export interface BotSettings {
    name: string;
    description: string;
    dmVerbosity:Verbosity
    channelVerbosity:Verbosity
    delegatedVerbosity:Verbosity
    mountBotInstances: boolean;
    allowDelegation: boolean;
}

enum BotEventSource {
    DISCORD = "discord",
    DELEGATION = "delegation"
}

export class BotEvent {
    constructor(id:string, source:BotEventSource) {
        this.source=source;
        this.id=id;                
    }
    public id:string; //snowflake
    public source: BotEventSource;
    public getTimestamp() {
        return getTimestampFromSnowflakeId(this.id);
    }
    public getDate():Date {
        return getDateFromSnowflakeId(this.id);
    }
    public getDateISOString():string {
        return this.getDate().toISOString();
    }
    public getSummary():string {
        var obj = Object.assign(this);
        obj.timestamp = this.getDateISOString();
        return JSON.stringify(obj);
    }
}

//A generic event which is the superclass of event Comms Events such as Discord, Email, Slack, etc.
export class CommsEvent extends BotEvent {
    constructor(id:string, source:BotEventSource ) {
        super(id, source);                
    }
}

export class DiscordBotEvent extends CommsEvent {
    constructor(e:{id:string, message:Message, channelProjects: string[]}) {
        super(e.id, BotEventSource.DISCORD);                
        this.message=e.message;
        this.channelProjects = e.channelProjects;
    }
    public getSummary():string {
        return JSON.stringify({
            id: this.id,
            timestamp:this.getDateISOString(),
            source:this.source,
            author: { id: this.message.author.id, name: this.message.author.displayName },            
            content:this.message.content,
            channelProjects: this.channelProjects
        });
    }
    
    public message: Message;
    public channelProjects: string[];
}

export class DelegationBotEvent extends BotEvent {
    constructor(e:{id:string, project:string, task_description:string, notes:string, data:any, delegator_botid:string,assignedTo:string, commsEvent: BotEvent, attempts?: number}) {
        super(e.id, BotEventSource.DELEGATION);
        this.project=e.project;
        this.task_description=e.task_description;
        this.notes=e.notes;
        this.data=e.data;
        this.delegator_botid=e.delegator_botid;
        this.assignedTo=e.assignedTo;        
        this.commsEvent = e.commsEvent;
                
        this.attempts=e.attempts??0;        
        this.final = false;
    }
    public getSummary():string {
        var obj = Object.assign(this);
        obj.timestamp = this.getDateISOString();
        return JSON.stringify(obj);
    }    
    public project: string;
    public task_description: string;
    public notes: string;
    public data: string;
    public delegator_botid: string;
    public assignedTo: string;
    public attempts: number;
    public final:boolean;

    //The original comms Event which caused the delegation chain
    public commsEvent:BotEvent;
}

export interface Project {
    id:string,
    name:string
    description:string,
    repositoryUrl:string,
    assignedQa:string,
    discordChannelIds: string[],
    gitKeyId?: string,
    createdAt:string, //Datetime string
    updatedAt:string //Datetime string
}
