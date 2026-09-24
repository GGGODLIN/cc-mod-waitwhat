import type { SessionMessage } from 'claude-code'
import { clip } from './model.ts'
import { cleanText } from './turns.ts'

export const RECAP_DIR = '.cache/cc-recap'
export const RECAP_MODEL = 'groq-qwen-3.8-27b'
export const RECAP_FALLBACK_MODEL = 'gpt-6-luna-fast'
export const RECAP_IDLE_MS = 5000
export const RECAP_MIN_GAP_MS = 60000
export const RECAP_INPUT_BUDGET = 5000
export const RECAP_MAX_TOKENS = 300

// Derived from the away-summary prompt in the Claude Code 2.1.281 binary; the JSON shape is
// what Collie's list row, pane screen and push all read, so the three keys are a contract.
export const RECAP_PROMPT =
  'The user stepped away and is coming back. Summarize where this session stands as JSON with exactly these keys: ' +
  '"goal" (the overall goal, under 15 words), "now" (what is happening right now or what it is waiting on, under 15 words), ' +
  '"next" (the one next action and who takes it, under 15 words). ' +
  'Refer to the assistant in the first person ("我" / "I") and to the user in the second person ("你" / "you"). ' +
  'No markdown, no extra keys. Skip root-cause narrative, fix internals, secondary to-dos, and em-dash tangents. ' +
  'Write the values in the same language as the conversation. Output only the JSON object.'

export type RecapFields = { goal: string; now: string; next: string }
export type RecapRecord = RecapFields & { version: 1; sessionId: string; at: number; model: string }

// Groq meters its 8,000 TPM on its own tokenizer; this over-counts CJK and prose alike, so a
// tail under the budget stays under the real limit without a tokenizer in the plugin.
export const estimateTokens = (text: string) => {
  let cjk = 0
  for (const ch of text) if (/[　-鿿가-힯＀-￯]/.test(ch)) cjk += 1
  return cjk + Math.ceil((text.length - cjk) / 3)
}

const lineOf = (message: SessionMessage) => {
  if (message.role === 'user' && (message.toolResults?.length ?? 0) > 0) return ''
  const head = message.role === 'user' ? 'User' : 'Assistant'
  const text = clip(cleanText(message.text), 3000)
  const tools = message.toolUses.map((use) => `  [${use.tool}] ${clip((use.text ?? '').replace(/\s+/g, ' '), 200)}`)
  return [text.length > 0 ? `${head}: ${text}` : null, ...tools].filter((line) => line !== null).join('\n')
}

export const tailWithin = (messages: SessionMessage[], budget: number) => {
  const kept: string[] = []
  let used = 0
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const line = lineOf(messages[i]!)
    if (line.length === 0) continue
    const cost = estimateTokens(line)
    if (used + cost > budget) break
    kept.push(line)
    used += cost
  }
  return kept.toReversed().join('\n\n')
}

export const fingerprintOf = (messages: SessionMessage[]) => {
  const last = messages.at(-1)
  return last === undefined ? '' : `${messages.length}:${last.role}:${last.text.length}:${last.toolUses.length}`
}

type RecapJson = { goal?: string | null; now?: string | null; next?: string | null }

// String() rather than trusting the declared type: the model may answer a number or an object.
const textOf = (value: string | null | undefined) => String(value ?? '').trim()

export const parseRecap = (reply: string): RecapFields | null => {
  const match = /\{[\s\S]*\}/.exec(reply)
  if (match === null) return null
  try {
    const parsed: RecapJson = JSON.parse(match[0])
    const fields = { goal: textOf(parsed.goal), now: textOf(parsed.now), next: textOf(parsed.next) }
    return fields.now.length > 0 ? fields : null
  } catch {
    return null
  }
}

export const recapBody = (model: string, transcript: string) =>
  JSON.stringify({
    model,
    messages: [
      { role: 'system', content: RECAP_PROMPT },
      { role: 'user', content: transcript },
    ],
    temperature: 0.3,
    max_tokens: RECAP_MAX_TOKENS,
  })

export const isTooLarge = (status: number, text: string) => status === 413 || /request too large/i.test(text)

// The next run waits out the idle delay and the per-session gap, whichever ends later.
export const delayFor = (now: number, lastRunAt: number | null) =>
  lastRunAt === null ? RECAP_IDLE_MS : Math.max(RECAP_IDLE_MS, lastRunAt + RECAP_MIN_GAP_MS - now)

export const recapPath = (home: string, sessionId: string) =>
  /^[A-Za-z0-9-]+$/.test(sessionId) ? `${home}/${RECAP_DIR}/${sessionId}.json` : null
