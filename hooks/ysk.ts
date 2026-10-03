import type { SessionMessage } from 'claude-code'
import { estimateTokens } from './recap.ts'
import { cleanText } from './turns.ts'

export const YSK_LOG = '.cache/cc-ysk-log.jsonl'
export const YSK_LOG_LINES = 2000
// Each check's exact input is kept beside the log so a review can judge what the model missed,
// not only what it flagged.
export const YSK_PAYLOAD_DIR = '.cache/cc-ysk-payloads'
export const YSK_REPLY_KEPT = 4000
// ChatGPT web takes standard, extended and max (heavy and unknown names are refused, probed
// 2026-10-03); this check needs judgment more than speed, so it asks above the web default.
export const YSK_WEB_EFFORT = 'extended'
// About a third of a long session once tool output is cut to its ends (measured on 8 sessions
// over 150K tokens on 2026-10-03), so most sessions go in whole and the longest lose their oldest part.
export const YSK_INPUT_BUDGET = 60000
export const YSK_IDLE_MS = 5000
// The built-in mod drops an unopened suggestion after two prompts; past that it is stale.
export const YSK_CLEAR_AFTER_PROMPTS = 2
export const YSK_SEEN_KEPT = 16
const EDGE = 300
const TEXT_EDGE = 3000
// The engine refuses a Markdown element over 10000 characters.
export const MARKDOWN_MAX = 10000

export type YskTag = 'You should know' | 'Heads up'
export type YskItem = { tag: YskTag; line: string; title: string; explain: string }
export type YskAnswer = 'opened' | 'helpful' | 'not_relevant' | 'ignored'
export type YskShown = { sessionId: string; item: YskItem; isUnread: boolean; answer: YskAnswer | null; source: string }

// Modelled on the built-in "You should know" mod's prompt (Claude Code 2.1.288): same bar,
// same two tags, same skip rules; reworded, and asked for JSON so the band can parse it.
export const YSK_PROMPT = [
  'You watch a Claude Code session from the side. The input is the session so far: USER is the human, ASSISTANT is the main agent, [Tool] lines are its tool calls with their results cut to the ends.',
  'Find at most one thing the human should really know about this session and very likely does not: something worth interrupting them for. Most of the time there is nothing, and then you say so.',
  '',
  'Skip a topic when:',
  '- the human is already discussing it, asked about it, replied to it, or it was the main point of an answer;',
  '- it is listed below as already suggested;',
  '- you are not confident it is true (if it is consequential but uncertain, say where you are unsure);',
  '- it is merely interesting. Missing it must cost something real: money, time, wasted work, a wrong result, or a decision they are in the middle of.',
  'A decision or detail the assistant mentioned in passing, inside a long answer or a long run of tool calls, does count when it is consequential: people do not read everything the assistant writes.',
  'Do not chase docs or pages the assistant fetched along the way. The bar is very high; when in doubt, suggest nothing.',
  '',
  'Tag the one you keep:',
  '- "You should know": how something works (a system, a concept, a design) that deeply matters to their work.',
  '- "Heads up": about the work in this session: a decision the assistant made, something it did not highlight, or a result that may be off, with an immediate cost if missed.',
  'If neither tag reads naturally, it does not clear the bar.',
  '',
  'Answer with one JSON object and nothing else:',
  '{"tag": "You should know" | "Heads up" | "none", "line": "<the point in one sentence>", "title": "<the takeaway in 3-7 plain words, a statement, no question>", "explain": "<markdown, at most 120 words: plain sentences for a simple point, 3-6 bullets for a complex one; explain any technical term the human has not used; say what they can do about it if anything>"}',
  'With nothing to suggest answer {"tag": "none"}.',
  'Say "the main agent" for the assistant and "you" for the human. Write in the language of the conversation; Chinese means Traditional Chinese (繁體中文), never Simplified.',
].join('\n')

const edges = (text: string, edge: number) => (text.length <= edge * 2 ? text : `${text.slice(0, edge)} …(${text.length - edge * 2} chars cut)… ${text.slice(-edge)}`)

const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

const inputOf = (input: Record<string, unknown>) => {
  try {
    return JSON.stringify(input)
  } catch {
    return ''
  }
}

// Tool results ride on the assistant's toolUses, so the user rows that carry them are skipped.
const blockOf = (message: SessionMessage) => {
  if (message.role === 'user' && (message.toolResults?.length ?? 0) > 0) return ''
  const text = cleanText(message.text)
  const head = message.role === 'user' ? 'USER' : 'ASSISTANT'
  const tools = message.toolUses.map((use) => {
    const result = use.text === undefined ? '' : ` → ${edges(flat(use.text), EDGE)}`
    return `  [${use.tool}] ${edges(flat(inputOf(use.input)), EDGE)}${result}`
  })
  return [text.length > 0 ? `${head}: ${edges(text, TEXT_EDGE)}` : null, ...tools].filter((line) => line !== null).join('\n')
}

export const yskTranscript = (messages: SessionMessage[], budget: number) => {
  const kept: string[] = []
  let used = 0
  let isCut = false
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const block = blockOf(messages[i]!)
    if (block.length === 0) continue
    const cost = estimateTokens(block)
    if (used + cost > budget) {
      isCut = true
      break
    }
    kept.push(block)
    used += cost
  }
  const omitted = isCut ? '(… earlier part of the session omitted …)\n\n' : ''
  return `${omitted}${kept.toReversed().join('\n\n')}`
}

export const yskPayload = (messages: SessionMessage[], seen: readonly string[], budget: number) => {
  const already = seen.length > 0 ? seen.map((line) => `- ${line}`).join('\n') : '(none)'
  return `<already_suggested>\n${already}\n</already_suggested>\n\n<session>\n${yskTranscript(messages, budget)}\n</session>`
}

type YskJson = { tag?: unknown; line?: unknown; title?: unknown; explain?: unknown }

const textOf = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

// null means the reply could not be read; { item: null } means the model chose to say nothing.
export const parseYsk = (reply: string): { item: YskItem | null } | null => {
  const match = /\{[\s\S]*\}/.exec(reply)
  if (match === null) return null
  let parsed: YskJson
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return null
  }
  const tag = textOf(parsed.tag)
  if (tag.toLowerCase() === 'none' || tag.length === 0) return { item: null }
  if (tag !== 'You should know' && tag !== 'Heads up') return null
  const item: YskItem = { tag, line: textOf(parsed.line), title: textOf(parsed.title), explain: textOf(parsed.explain).slice(0, MARKDOWN_MAX) }
  return item.line.length > 0 && item.explain.length > 0 ? { item } : null
}

const normalised = (line: string) => line.toLowerCase().replace(/[\s\p{P}]+/gu, '')

export const yskPayloadPath = (home: string, sessionId: string, messageCount: number) =>
  /^[A-Za-z0-9-]+$/.test(sessionId) ? `${home}/${YSK_PAYLOAD_DIR}/${sessionId}-${messageCount}.txt` : null

export const isRepeat =(line: string, seen: readonly string[]) => seen.some((one) => normalised(one) === normalised(line))

export const withLogLine = (log: string, entry: Record<string, unknown>) => {
  const lines = log.split('\n').filter((line) => line.length > 0)
  return [...lines, JSON.stringify(entry)].slice(-YSK_LOG_LINES).join('\n') + '\n'
}
