import { describe, expect, test } from 'bun:test'
import type { SessionMessage } from 'claude-code'
import { YSK_LOG_LINES, YSK_PROMPT, isRepeat, parseYsk, withLogLine, yskPayload, yskTranscript } from '../hooks/ysk.ts'

const said = (role: 'user' | 'assistant', text: string): SessionMessage => ({ role, text, toolUses: [] })

describe('writing the reminder', () => {
  test('asks for minimal session context and a short, plain explanation', () => {
    expect(YSK_PROMPT).toContain('Start with only the session context needed to understand this reminder')
    expect(YSK_PROMPT).toContain('Use everyday language')
    expect(YSK_PROMPT).toContain('2-4 short sentences in one paragraph')
    expect(YSK_PROMPT).toContain('at most 200 Chinese characters or 70 words in other languages')
    expect(YSK_PROMPT).not.toContain('3-6 bullets')
  })

  test('does not pad the reminder with a recap or mandatory advice', () => {
    expect(YSK_PROMPT).toContain('Do not recap the whole conversation')
    expect(YSK_PROMPT).toContain('Do not add a task or advice unless it is necessary')
    expect(YSK_PROMPT).toContain('Keep any uncertainty explicit')
    expect(YSK_PROMPT).toContain('With nothing to suggest answer {"tag": "none"}.')
  })
})

describe('reading the reply', () => {
  test('a tagged finding parses', () => {
    const parsed = parseYsk('{"tag": "Heads up", "line": "會重複扣款", "title": "結帳可能重複扣款", "explain": "- 沒測重送"}')
    expect(parsed?.item?.tag).toBe('Heads up')
    expect(parsed?.item?.title).toBe('結帳可能重複扣款')
  })

  test('"none" means the model chose to say nothing', () => {
    expect(parseYsk('{"tag": "none"}')).toEqual({ item: null })
  })

  test('an unknown tag, missing explain or non-JSON reply is unreadable', () => {
    expect(parseYsk('{"tag": "FYI", "line": "a", "explain": "b"}')).toBeNull()
    expect(parseYsk('{"tag": "Heads up", "line": "a"}')).toBeNull()
    expect(parseYsk('nothing here')).toBeNull()
  })

  test('JSON wrapped in prose or a fence still parses', () => {
    expect(parseYsk('```json\n{"tag": "You should know", "line": "a", "title": "t", "explain": "b"}\n```')?.item?.tag).toBe('You should know')
  })
})

describe('what is sent', () => {
  test('tool input and result keep only their ends', () => {
    const long = 'x'.repeat(5000)
    const message: SessionMessage = { role: 'assistant', text: '', toolUses: [{ tool_use_id: 't', tool: 'Bash', input: { command: 'ls' }, text: `${long}TAIL` }] }
    const sent = yskTranscript([message], 100000)
    expect(sent).toContain('[Bash]')
    expect(sent).toContain('TAIL')
    expect(sent.length).toBeLessThan(1500)
  })

  test('user rows that only carry tool results are skipped, since results ride on the tool call', () => {
    const results: SessionMessage = { role: 'user', text: 'RAW RESULT', toolUses: [], toolResults: [{ tool_use_id: 't', text: 'RAW RESULT', isError: false, result: null } as never] }
    expect(yskTranscript([said('user', '問'), results], 100000)).not.toContain('RAW RESULT')
  })

  test('system reminders are dropped from the text', () => {
    expect(yskTranscript([said('user', '問<system-reminder>secret</system-reminder>')], 100000)).not.toContain('secret')
  })

  test('over budget the oldest part goes and is marked', () => {
    const sent = yskTranscript([said('user', 'OLD '.repeat(400)), said('assistant', 'NEW')], 50)
    expect(sent).toContain('NEW')
    expect(sent).not.toContain('OLD')
    expect(sent).toContain('omitted')
  })

  test('earlier suggestions are listed so the model skips them', () => {
    expect(yskPayload([said('user', '問')], ['結帳可能重複扣款'], 1000)).toContain('- 結帳可能重複扣款')
  })
})

describe('repeats and the log', () => {
  test('a repeat ignores case, spacing and punctuation', () => {
    expect(isRepeat('Checkout may charge twice.', ['checkout may  charge twice'])).toBe(true)
    expect(isRepeat('Another thing', ['checkout may charge twice'])).toBe(false)
  })

  test('the log keeps its newest lines', () => {
    let log = ''
    for (let i = 0; i < YSK_LOG_LINES + 5; i += 1) log = withLogLine(log, { i })
    const lines = log.trim().split('\n')
    expect(lines.length).toBe(YSK_LOG_LINES)
    expect(JSON.parse(lines.at(-1)!).i).toBe(YSK_LOG_LINES + 4)
  })
})
