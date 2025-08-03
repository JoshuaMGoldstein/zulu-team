import { Message, TextChannel } from 'discord.js';
import { log } from './log';

const MAX_MESSAGE_LENGTH = 2000;


export const sendChunkedMessage = async (statusMessage: Message, content: string, contenttype?:string) => {
    if (!content || content.trim() === '') return;

    try {
        const channel = statusMessage.channel as TextChannel;

        
        let CONTENTTYPE_LENGTH = 0;
        let contenttype_prefix = contenttype ? ('```'+contenttype+'\n' ) :'';
        let contenttype_postfix = contenttype ? '```' : '';
        if( contenttype) { 
          CONTENTTYPE_LENGTH = (contenttype_prefix+contenttype_postfix).length;
        }
        if(statusMessage.content.trim().endsWith('...') && !contenttype && content.length <= MAX_MESSAGE_LENGTH ) {             
            await statusMessage.edit(content);
            return;
        }
        
        let ADJUSTED_MAX_MESSAGE_LENGTH = MAX_MESSAGE_LENGTH-CONTENTTYPE_LENGTH;
      
        const chunks = [];
        for (let i = 0; i < content.length; i += ADJUSTED_MAX_MESSAGE_LENGTH) {
            chunks.push(contenttype_prefix+content.substring(i, i + ADJUSTED_MAX_MESSAGE_LENGTH)+contenttype_postfix);
        }

        if (channel instanceof TextChannel) {
            for (let i = 0; i < chunks.length; i++) {
                await channel.send(chunks[i]);
            }
        }
    } catch (e) {
        log('Error sending discord message: ' + e);
    }
};
