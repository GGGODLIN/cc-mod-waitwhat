import { describe, expect, test } from 'bun:test'
import { sharedKeyFor } from '../hooks/cache.ts'
import { cacheMessagesOf, lastTurns } from '../hooks/turns.ts'

interface Fixture {
  mode: 'plain' | 'lost'
  messages: Array<{ role: 'user' | 'assistant'; text: string }>
  expected: string
}

const fixture = await Bun.file(new URL('./fixtures/shared-cache-key.json', import.meta.url)).json() as Fixture

describe('shared cache key', () => {
  test('matches the cross-repo contract fixture', async () => {
    expect(await sharedKeyFor(fixture.mode, fixture.messages)).toBe(fixture.expected)
  })

  test('separates modes', async () => {
    expect(await sharedKeyFor('plain', fixture.messages)).not.toBe(
      await sharedKeyFor('lost', fixture.messages)
    )
  })

  test('separates changed text', async () => {
    const changed = fixture.messages.map((message, index) =>
      index === 1 ? { ...message, text: `${message.text}不同` } : message
    )
    expect(await sharedKeyFor(fixture.mode, fixture.messages)).not.toBe(
      await sharedKeyFor(fixture.mode, changed)
    )
  })

  test('uses only human user messages and assistant text', () => {
    const messages = [
      { role: 'user', text: '問題', toolResults: [], toolUses: [] },
      { role: 'user', text: '工具結果', toolResults: [{}], toolUses: [] },
      { role: 'assistant', text: '答案', toolResults: [], toolUses: [] },
    ]
    expect(cacheMessagesOf(messages as Parameters<typeof cacheMessagesOf>[0])).toEqual([
      { role: 'user', text: '問題' },
      { role: 'assistant', text: '答案' },
    ])
  })

  test('matches sidecar cleanup for command and reminder tags', () => {
    const messages = [
      { role: 'user', text: '問題<system-reminder>內部提醒</system-reminder>', toolResults: [], toolUses: [] },
      { role: 'assistant', text: '原回答', toolResults: [], toolUses: [] },
      { role: 'user', text: '<command-message>wait-what</command-message>\n<command-name>/wait-what</command-name>', toolResults: [], toolUses: [] },
      { role: 'assistant', text: '指令回答', toolResults: [], toolUses: [] },
    ]
    expect(cacheMessagesOf(lastTurns(
      messages as Parameters<typeof cacheMessagesOf>[0],
      1
    ))).toEqual([
      { role: 'user', text: '問題' },
      { role: 'assistant', text: '原回答' },
      { role: 'assistant', text: '指令回答' },
    ])
  })
})
