import { describe, expect, test } from 'bun:test'
import type { SessionMessage } from 'claude-code'
import {
  RECAP_IDLE_MS,
  delayFor,
  estimateTokens,
  fingerprintOf,
  isTooLarge,
  parseRecap,
  recapBody,
  recapPath,
  tailWithin,
} from '../hooks/recap.ts'

const said = (role: 'user' | 'assistant', text: string): SessionMessage => ({ role, text, toolUses: [] })

describe('budgeting the tail', () => {
  test('a CJK character costs one token and other text one per three characters', () => {
    expect(estimateTokens('你好')).toBe(2)
    expect(estimateTokens('abcdef')).toBe(2)
    expect(estimateTokens('你好abc')).toBe(3)
  })

  test('the newest messages are kept and the oldest dropped once the budget is spent', () => {
    const messages = [said('user', 'a'.repeat(300)), said('assistant', 'b'.repeat(30)), said('user', 'c'.repeat(30))]
    const tail = tailWithin(messages, 40)
    expect(tail).toContain('User: ccc')
    expect(tail).toContain('Assistant: bbb')
    expect(tail).not.toContain('aaa')
    expect(tail.indexOf('Assistant')).toBeLessThan(tail.indexOf('User'))
  })

  test('tool results and system reminders never reach the model', () => {
    const withResult: SessionMessage = { role: 'user', text: 'raw output', toolUses: [], toolResults: [{ tool_use_id: 't', text: 'raw output', isError: false }] }
    const reminded = said('user', 'fix it<system-reminder>secret rules</system-reminder>')
    const tail = tailWithin([reminded, withResult], 1000)
    expect(tail).toBe('User: fix it')
  })
})

describe('reading the model reply', () => {
  test('the three fields come out of a JSON object wrapped in prose', () => {
    expect(parseRecap('Sure: {"goal":"修 bug","now":"在跑測試","next":"我看結果"} done')).toEqual({ goal: '修 bug', now: '在跑測試', next: '我看結果' })
  })

  test('a reply without a now is no recap at all', () => {
    expect(parseRecap('{"goal":"x","next":"y"}')).toBeNull()
    expect(parseRecap('not json')).toBeNull()
  })

  test('the request caps the output tokens', () => {
    expect(JSON.parse(recapBody('m', 't')).max_tokens).toBe(300)
  })

  test('a Groq size refusal is recognised by status or by its message', () => {
    expect(isTooLarge(413, '')).toBe(true)
    expect(isTooLarge(429, 'Request too large for model')).toBe(true)
    expect(isTooLarge(429, 'Rate limit reached')).toBe(false)
  })
})

describe('when to run', () => {
  test('the first run waits only for the idle delay', () => {
    expect(delayFor(1000, null)).toBe(RECAP_IDLE_MS)
  })

  test('a run within the minute waits until the minute is up', () => {
    expect(delayFor(10000, 0)).toBe(50000)
    expect(delayFor(100000, 0)).toBe(RECAP_IDLE_MS)
  })

  test('the fingerprint moves when a message is added or the last one grows', () => {
    const one = [said('user', 'hi')]
    expect(fingerprintOf(one)).not.toBe(fingerprintOf([...one, said('assistant', 'yo')]))
    expect(fingerprintOf(one)).not.toBe(fingerprintOf([said('user', 'hi!')]))
    expect(fingerprintOf([])).toBe('')
  })

  test('a session id that could leave the recap folder writes nothing', () => {
    expect(recapPath('/h', '0e2a-44')).toBe('/h/.cache/cc-recap/0e2a-44.json')
    expect(recapPath('/h', '../x')).toBeNull()
  })
})
