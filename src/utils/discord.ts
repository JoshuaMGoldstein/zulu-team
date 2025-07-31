import { Message,TextChannel } from 'discord.js';

const MAX_MESSAGE_LENGTH=1995;

export async function sendChunkedMessage(statusMessage: Message, content: string) {
  if(!content) return;

  try {
    let channel = statusMessage.channel as TextChannel;
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
  } catch(e) {
    console.error('Error sending discord message: '+e);
  }
};