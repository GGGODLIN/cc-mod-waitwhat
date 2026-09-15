import type { SessionMessage } from 'claude-code'

const startsTurn = (message: SessionMessage) =>
  message.role === 'user' && message.text.trim().length > 0 && (message.toolResults?.length ?? 0) === 0

export const lastTurns = (messages: SessionMessage[], turns: number) => {
  let seen = 0
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (startsTurn(messages[i])) {
      seen += 1
      if (seen === turns) return messages.slice(i)
    }
  }
  return messages
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

const lineOf = (message: SessionMessage) => {
  const head = message.role === 'user' ? 'USER' : 'ASSISTANT'
  const tools = message.toolUses.map((use) => `  [${use.tool}] ${clip((use.text ?? '').replace(/\s+/g, ' '), 200)}`)
  const text = message.text.trim()
  return [text.length > 0 ? `${head}: ${text}` : null, ...tools].filter((line) => line !== null).join('\n')
}

export const transcriptOf = (messages: SessionMessage[]) =>
  messages.map(lineOf).filter((line) => line.length > 0).join('\n\n')
