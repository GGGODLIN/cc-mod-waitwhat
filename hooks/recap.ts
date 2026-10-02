import type { SessionMessage } from 'claude-code'
import { clip } from './model.ts'
import { cleanText } from './turns.ts'

export const RECAP_DIR = '.cache/cc-recap'
// Luna wrote now/next right on 10 of 10 audited recaps where gpt-oss got 8, and a week of
// recaps costs about 0.05% of the ChatGPT Pro cycle. Groq stays as the fallback because on
// gpt-oss alone the recap filled about 94% of that model's daily Groq cap.
export const RECAP_MODEL = 'gpt-6-luna'
export const RECAP_FALLBACK_MODEL = 'groq-gpt-oss-120b'
// Luna answered in 2.6–4.8s; past this the fallback answers instead of the band waiting on it.
export const RECAP_TIMEOUT_MS = 10000
export const RECAP_IDLE_MS = 5000
export const RECAP_MIN_GAP_MS = 60000
export const RECAP_INPUT_BUDGET = 5000
// The user's own messages name the goal far back: 1500 tokens of them covered dozens of
// turns where the whole 5000-token tail reached only the last 5–9.
export const RECAP_USER_SHARE = 0.3
export const RECAP_MAX_TOKENS = 600

// Derived from the away-summary prompt in the Claude Code 2.1.281 binary; the JSON shape is
// what Collie's list row, pane screen and push all read, so goal/now/next are a contract.
export const RECAP_PROMPT =
  'Summarize where this coding-agent session stands as JSON with exactly these keys: ' +
  '"goal", "now", "next", "waiting_on_user_decision". ' +
  'The input has two parts. <user_messages> holds the user\'s own messages, the most recent ones, oldest first; older ones may be omitted. ' +
  '<recent> holds the latest part of the conversation with the assistant\'s replies and tool calls. ' +
  '"goal" (under 15 words): the overall objective of the whole session, named at the level of the project or problem the user is working on. ' +
  'Base it on <user_messages>, not only on the latest step. ' +
  '"now" (under 15 words): what is happening right now or what it is waiting on, from <recent>. ' +
  '"next" (under 15 words): the one next action and who takes it. ' +
  '"waiting_on_user_decision" (boolean): true only when the assistant\'s latest reply asks the user to choose, approve, answer a question, ' +
  'or perform a specific action before the work can continue. It is false when the assistant has finished and is only idle awaiting any new request, ' +
  'when it is still working or waiting on a background job, or when the reply only lists limitations or things not done. ' +
  'Items the assistant lists as not done, unverified, or out of scope are limitations, not current work: do not report them as now or next ' +
  'unless the assistant says it will do them. ' +
  'Refer to the assistant in the first person ("我" / "I") and to the user in the second person ("你" / "you"). ' +
  'No markdown, no extra keys. Skip root-cause narrative, fix internals, secondary to-dos, and em-dash tangents. ' +
  'Write the values in the same language as the conversation; Chinese means Traditional Chinese (繁體中文), never Simplified. ' +
  'Output only the JSON object.'

export type RecapFields = { goal: string; now: string; next: string; waiting: boolean }
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

const isHumanTurn = (message: SessionMessage) => {
  if (message.role !== 'user' || (message.toolResults?.length ?? 0) > 0) return false
  const text = cleanText(message.text)
  return text.length > 0 && !text.startsWith('<task-notification')
}

export const userMessagesWithin = (messages: SessionMessage[], budget: number) => {
  const kept: string[] = []
  let used = 0
  const human = messages.filter(isHumanTurn)
  for (let i = human.length - 1; i >= 0; i -= 1) {
    const line = `- ${clip(cleanText(human[i]!.text).replace(/\s+/g, ' '), 300)}`
    const cost = estimateTokens(line)
    if (used + cost > budget) break
    kept.push(line)
    used += cost
  }
  const omitted = human.length - kept.length
  return [...(omitted > 0 ? [`(… ${omitted} earlier messages omitted …)`] : []), ...kept.toReversed()].join('\n')
}

export const recapInput = (messages: SessionMessage[], budget: number) => {
  const userBudget = Math.floor(budget * RECAP_USER_SHARE)
  return `<user_messages>\n${userMessagesWithin(messages, userBudget)}\n</user_messages>\n\n<recent>\n${tailWithin(messages, budget - userBudget)}\n</recent>`
}

export const fingerprintOf = (messages: SessionMessage[]) => {
  const last = messages.at(-1)
  return last === undefined ? '' : `${messages.length}:${last.role}:${last.text.length}:${last.toolUses.length}`
}

type RecapJson = { goal?: string | null; now?: string | null; next?: string | null; waiting_on_user_decision?: unknown }

// String() rather than trusting the declared type: the model may answer a number or an object.
const textOf = (value: string | null | undefined) => String(value ?? '').trim()

export const parseRecap = (reply: string): RecapFields | null => {
  const match = /\{[\s\S]*\}/.exec(reply)
  if (match === null) return null
  try {
    const parsed: RecapJson = JSON.parse(match[0])
    const fields = { goal: textOf(parsed.goal), now: textOf(parsed.now), next: textOf(parsed.next), waiting: parsed.waiting_on_user_decision === true }
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
    max_tokens: RECAP_MAX_TOKENS,
    reasoning_effort: 'low',
    // gpt-oss at 0.3 drifted into Simplified Chinese about one reply in eight; at 0 it stayed
    // Traditional. Luna was audited without a temperature, so none is sent to it.
    ...(model === RECAP_FALLBACK_MODEL ? { temperature: 0 } : {}),
  })

export const isTooLarge = (status: number, text: string) => status === 413 || /request too large/i.test(text)

// The next run waits out the idle delay and the per-session gap, whichever ends later.
export const delayFor = (now: number, lastRunAt: number | null) =>
  lastRunAt === null ? RECAP_IDLE_MS : Math.max(RECAP_IDLE_MS, lastRunAt + RECAP_MIN_GAP_MS - now)

export const recapPath = (home: string, sessionId: string) =>
  /^[A-Za-z0-9-]+$/.test(sessionId) ? `${home}/${RECAP_DIR}/${sessionId}.json` : null
