import type { SessionMessage } from 'claude-code'
import type { CacheMessage } from './cache.ts'
import { clip } from './model.ts'

const cleanText = (text: string) =>
  text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<command-(name|message|args)>[\s\S]*?<\/command-\1>/g, '')
    .trim()

export const cacheMessagesOf = (messages: SessionMessage[]): CacheMessage[] =>
  messages.flatMap((message): CacheMessage[] => {
    if (message.role !== 'user' && message.role !== 'assistant') return []
    if (message.role === 'user' && (message.toolResults?.length ?? 0) > 0) return []
    const text = cleanText(message.text)
    return text.length > 0 ? [{ role: message.role, text }] : []
  })

const startsTurn = (message: SessionMessage) =>
  message.role === 'user' && message.text.trim().length > 0 && (message.toolResults?.length ?? 0) === 0

const startsCacheTurn = (message: SessionMessage) =>
  message.role === 'user' && cleanText(message.text).length > 0 && (message.toolResults?.length ?? 0) === 0

export const lastTurns = (messages: SessionMessage[], turns: number) => {
  let seen = 0
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (startsTurn(messages[i]!)) {
      seen += 1
      if (seen === turns) return messages.slice(i)
    }
  }
  return messages
}

export const lastCacheTurns = (messages: SessionMessage[], turns: number) => {
  let seen = 0
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (startsCacheTurn(messages[i]!)) {
      seen += 1
      if (seen === turns) return messages.slice(i)
    }
  }
  return messages
}

const lineOf = (message: SessionMessage) => {
  const head = message.role === 'user' ? 'USER' : 'ASSISTANT'
  const tools = message.toolUses.map((use) => `  [${use.tool}] ${clip((use.text ?? '').replace(/\s+/g, ' '), 200)}`)
  const text = message.text.trim()
  return [text.length > 0 ? `${head}: ${text}` : null, ...tools].filter((line) => line !== null).join('\n')
}

export const transcriptOf = (messages: SessionMessage[]) =>
  messages.map(lineOf).filter((line) => line.length > 0).join('\n\n')
