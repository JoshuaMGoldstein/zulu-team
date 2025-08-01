import { Message, TextChannel } from 'discord.js';
import { log } from './log';

const MAX_MESSAGE_LENGTH = 2000;

export const sendChunkedMessage = async (statusMessage: Message, content: string) => {
    if (!content || content.trim() === '') return;

    try {
        const channel = statusMessage.channel as TextChannel;
        if (content.length <= MAX_MESSAGE_LENGTH) {
            await statusMessage.edit(content);
            return;
        }

        const chunks = [];
        for (let i = 0; i < content.length; i += MAX_MESSAGE_LENGTH) {
            chunks.push(content.substring(i, i + MAX_MESSAGE_LENGTH));
        }

        await statusMessage.edit(chunks[0]);

        if (channel instanceof TextChannel) {
            for (let i = 1; i < chunks.length; i++) {
                await channel.send(chunks[i]);
            }
        }
    } catch (e) {
        log('Error sending discord message: ' + e);
    }
};
