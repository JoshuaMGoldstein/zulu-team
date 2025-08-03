import { FunctionDeclaration, PartListUnion, Schema } from '@google/genai';

function getToolExtensionFormat(toolname:string, file_path:string) {
  if(toolname.toLowerCase()  === 'replace' || toolname.toLowerCase() === 'edit' || toolname.toLowerCase()==='writefile') return 'diff';
  if(toolname.toLowerCase() === 'list_directory') return 'bash';
  if(toolname.toLowerCase() === 'run_shell_command') return 'bash';

  if(!file_path) return '';
  let splitfilepath = file_path.split('.');
  return splitfilepath[splitfilepath.length-1]??'';    
}


export interface GeminiToolCall {
    toolCall: {        
        name:string
        args:any,
        isClientInitiated:boolean
        callId:string
        prompt_id:string
    },
    toolResponse: {
        callId: string;
        responseParts: PartListUnion;
        resultDisplay: ToolResultDisplay | undefined;
        error: Error | undefined;
    }
}



export type ToolResultDisplay = string | FileDiff;
export interface FileDiff {
    fileDiff: string;
    fileName: string;
    originalContent: string | null;
    newContent: string;
}

export function getGeminiToolCallOutputAndFormat(toolHook:GeminiToolCall):[string,string,string] { //toolmsg, output,outputFormat
    let toolname = toolHook.toolCall?.name;
    let toolargs = toolHook.toolCall?.args;
    let toolResponse = toolHook.toolResponse;

    if(!toolname || !toolargs || !toolResponse) return ['','',''];
    
    if(toolname && toolargs && typeof toolargs === 'object') {


        let toolOutput =
            (toolResponse.responseParts && typeof toolResponse.responseParts === 'object' && 'functionResponse' in toolResponse.responseParts)
                ? toolResponse.responseParts.functionResponse?.response?.output
                : null;
        
        let output:string = '';
        let outputFormat = getToolExtensionFormat(toolname, toolargs.file_path??toolargs.absolute_path);
        if(toolResponse.resultDisplay && typeof toolResponse.resultDisplay === 'object' && toolResponse.resultDisplay.fileDiff) {
            outputFormat='diff';
            output = toolResponse.resultDisplay.fileDiff;
        } else if(toolOutput && typeof toolOutput === 'string') {
            output = toolOutput;
        } else if (toolResponse.resultDisplay && typeof toolResponse.resultDisplay === 'string') {
            output = toolResponse.resultDisplay;
        } else {
            output = JSON.stringify(toolResponse,null,2);
        }
        switch(toolname) {
            case 'replace':
            case 'writefile':
            default:
                if(toolargs.content) toolargs.content='***';
                if(toolargs.new_string) toolargs.new_string='***';
                if(toolargs.old_string) toolargs.old_string='***';
                break;
        }        

        let toolmsg = `Using tool \`${toolname}\` \`${JSON.stringify(toolargs)}\``;

        return [toolmsg, output, outputFormat];
    }

    return ['','',''];
}