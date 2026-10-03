import { describe, expect, test } from 'bun:test'
import { register } from '../hooks/register.tsx'

interface Node { tag: unknown; props: Record<string, unknown>; children: unknown[] }

;(globalThis as { h?: unknown }).h = (tag: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Node =>
  ({ tag, props: props ?? {}, children })

const flatten = (node: unknown): Node[] => {
  if (node === null || typeof node !== 'object') return []
  const current = node as Node
  if (!('props' in current)) return []
  return [current, ...current.children.flatMap((child) => Array.isArray(child) ? child.flatMap(flatten) : flatten(child))]
}

const textOf = (node: unknown): string =>
  flatten(node).flatMap((entry) => [
    ...entry.children.filter((child) => typeof child === 'string'),
    ...(typeof entry.props.text === 'string' ? [entry.props.text] : []),
    ...(typeof entry.props.label === 'string' ? [entry.props.label] : []),
  ]).join(' ')

const buttonOf = (node: unknown, key: string) => flatten(node).find((entry) => entry.props.key === key)

const pressOf = (node: unknown, key: string) => buttonOf(node, key)?.props.onPress as (() => void) | undefined

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

type Hook = ($: unknown, e: unknown, next: (e: unknown) => Promise<unknown>) => Promise<unknown> | unknown

const harness = (options: { env?: Record<string, string>; reply?: string } = {}) => {
  const env = { HOME: '/home', ...options.env }
  const files = new Map<string, string>()
  const opened: string[] = []
  const processes: string[][] = []
  const timers: Array<() => void> = []
  const asked: string[] = []
  const hooks = new Map<string, Hook>()
  const $ = {
    ui: {
      resolve: async () => ({ Box: 'Box', Button: 'Button', Text: 'Text', Markdown: 'Markdown' }),
      invalidate: () => {},
      open: async ({ id }: { id: string }) => {
        opened.push(id)
        return { isPlaced: true }
      },
      log: () => {},
    },
    env: { get: async (name: string) => (env as Record<string, string>)[name] },
    fs: {
      exists: async (path: string) => files.has(path),
      read: async (path: string) => files.get(path) ?? '',
      write: async (path: string, text: string) => {
        files.set(path, text)
      },
    },
    process: {
      run: async (argv: string[]) => {
        processes.push(argv)
        return { exitCode: 1, stdout: '', stderr: 'no' }
      },
    },
    clock: {
      now: async () => 0,
      sleep: () => new Promise(() => {}),
      after: (_ms: number, fn: () => void) => {
        timers.push(fn)
        return { cancel: () => {} }
      },
    },
    session: {
      id: async () => 'session-1',
      surfaces: async () => ['terminal'],
      messages: async () => [
        { role: 'user', text: '幫我修結帳', toolUses: [], toolResults: [] },
        { role: 'assistant', text: '修好了', toolUses: [{ tool_use_id: 't1', tool: 'Bash', input: { command: 'bun test' }, text: '146 pass' }] },
      ],
    },
    prompt: { read: async () => ({ text: '' }) },
    http: {
      fetch: async (_url: string, init: { body: string }) => {
        asked.push(init.body)
        return { ok: true, status: 200, headers: {}, text: JSON.stringify({ choices: [{ message: { content: options.reply ?? '重講的內容' } }] }) }
      },
    },
    model: { complete: async () => ({ isAnswered: true, text: 'claude 的回答', usage: {} }) },
  }
  register(((event: string, filterOrHook: unknown, maybeHook?: Hook) => {
    const filter = maybeHook === undefined ? null : filterOrHook as Record<string, string>
    const hook = (maybeHook ?? filterOrHook) as Hook
    hooks.set(filter === null ? event : `${event}:${filter.component}`, hook)
  }) as never)
  const band = async () => hooks.get('ui.render:AbovePrompt')!($, { surface: 'terminal', props: { hasSurvey: false, bodyColumns: 80 } }, async () => null)
  const pane = async () => hooks.get('ui.render:Pane')!($, { surface: 'terminal', props: { bodyColumns: 70 } }, async () => null)
  const turnComplete = async () => {
    await hooks.get('turn.complete')!($, {}, async () => ({}))
    for (const fn of timers.splice(0)) fn()
    await settle()
  }
  const submit = async () => hooks.get('prompt.submit')!($, { text: 'x' }, async (e) => e)
  const log = () => (files.get('/home/.cache/cc-ysk-log.jsonl') ?? '').split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line))
  return { opened, processes, asked, band, pane, turnComplete, submit, log }
}

const heads = JSON.stringify({ tag: 'Heads up', line: '結帳修正可能重複扣款', title: '結帳可能重複扣款', explain: '- 測試全過，但沒測重送。' })

describe('the band', () => {
  test('shows the three buttons and no "wait what" label', async () => {
    const drawn = textOf(await harness().band())
    expect(drawn).toContain('白話')
    expect(drawn).toContain('跟丟了')
    expect(drawn).toContain('該知道')
    expect(drawn).not.toContain('wait what')
  })
})

describe('retelling', () => {
  test('白話 opens the CC pane and draws the answer there, never in the band', async () => {
    const bench = harness()
    pressOf(await bench.band(), 'ww:plain')!()
    await settle()
    expect(bench.opened).toEqual(['waitwhat'])
    expect(textOf(await bench.pane())).toContain('重講的內容')
    expect(textOf(await bench.band())).not.toContain('重講的內容')
  })

  test('a Herdr identity no longer splits a terminal pane', async () => {
    const bench = harness({ env: { HERDR_PANE_ID: 'w4:p1', HERDR_WORKSPACE_ID: 'w4' } })
    pressOf(await bench.band(), 'ww:lost')!()
    await settle()
    expect(bench.processes).toEqual([])
    expect(bench.opened).toEqual(['waitwhat'])
  })
})

describe('you should know', () => {
  test('the button stays dim until a check finds something', async () => {
    const bench = harness({ reply: '{"tag": "none"}' })
    await bench.turnComplete()
    const button = buttonOf(await bench.band(), 'ww:ysk')!
    expect(button.props.dimColor).toBe(true)
    expect(button.props.variant).toBeUndefined()
    expect(bench.log().map((entry) => entry.outcome)).toEqual(['none'])
  })

  test('a finding lights the button, and pressing it shows the finding in the pane', async () => {
    const bench = harness({ reply: heads })
    await bench.turnComplete()
    const lit = buttonOf(await bench.band(), 'ww:ysk')!
    expect(lit.props.variant).toBe('primary')
    lit.props.onPress && (lit.props.onPress as () => void)()
    await settle()
    expect(bench.opened).toEqual(['waitwhat'])
    expect(textOf(await bench.pane())).toContain('Heads up · 結帳可能重複扣款')
    expect(buttonOf(await bench.band(), 'ww:ysk')!.props.variant).toBeUndefined()
    expect(bench.log().map((entry) => entry.answer ?? entry.outcome)).toEqual(['shown', 'opened'])
  })

  test('the check sends the tool call with its result, not just the final reply', async () => {
    const bench = harness({ reply: '{"tag": "none"}' })
    await bench.turnComplete()
    expect(bench.asked[0]).toContain('[Bash]')
    expect(bench.asked[0]).toContain('146 pass')
  })

  test('feedback is logged once and the buttons give way to the record', async () => {
    const bench = harness({ reply: heads })
    await bench.turnComplete()
    pressOf(await bench.band(), 'ww:ysk')!()
    await settle()
    pressOf(await bench.pane(), 'ysk:helpful')!()
    await settle()
    expect(textOf(await bench.pane())).toContain('已記錄：有幫助')
    expect(buttonOf(await bench.pane(), 'ysk:helpful')).toBeUndefined()
    expect(bench.log().at(-1)!.answer).toBe('helpful')
  })

  test('an unopened finding is dropped after two prompts', async () => {
    const bench = harness({ reply: heads })
    await bench.turnComplete()
    await bench.submit()
    expect(buttonOf(await bench.band(), 'ww:ysk')!.props.variant).toBe('primary')
    await bench.submit()
    expect(buttonOf(await bench.band(), 'ww:ysk')!.props.variant).toBeUndefined()
    expect(bench.log().at(-1)!.answer).toBe('ignored')
  })

  test('a session that has not moved since the last check is not sent again', async () => {
    const bench = harness({ reply: heads })
    const checks = () => bench.asked.filter((body) => body.includes('You watch a Claude Code session')).length
    await bench.turnComplete()
    expect(checks()).toBe(1)
    await bench.turnComplete()
    expect(checks()).toBe(1)
  })
})

describe('what the hooks module is allowed to write', () => {
  test('every $.env.get asks for a literal name', async () => {
    const source = await Bun.file(new URL('../hooks/register.tsx', import.meta.url)).text()
    const asked = [...source.matchAll(/\$\.env\.get\(([^)]*)\)/g)].map((hit) => hit[1]!.trim())
    expect(asked.length).toBeGreaterThan(0)
    expect(asked.filter((argument) => !/^'[A-Z0-9_]+'$/.test(argument))).toEqual([])
  })
})
