import type { Message } from "@ds-bot/mobile-sdk";
// Keep transport/cache messages intact; the view offers one reasoning disclosure per turn.
export function combineTurnReasoning(messages: Message[]): Message[] {
  const groups = new Map<string, {first:number;parts:string[]}>();
  messages.forEach((message,index)=>{
    if(message.role!=="assistant" || !message.reasoning?.trim() || !Number.isInteger(message.turn))return;
    const key=JSON.stringify([message.sessionId,message.turn]);
    const group=groups.get(key);
    if(group)group.parts.push(message.reasoning.trim());else groups.set(key,{first:index,parts:[message.reasoning.trim()]});
  });
  return messages.map((message,index)=>{
    if(message.role!=="assistant" || !message.reasoning?.trim() || !Number.isInteger(message.turn))return message;
    const group=groups.get(JSON.stringify([message.sessionId,message.turn]))!;
    return {...message,reasoning:index===group.first ? group.parts.join("\n\n") : undefined};
  });
}
