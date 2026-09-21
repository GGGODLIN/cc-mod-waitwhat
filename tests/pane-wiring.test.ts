import { beforeEach, describe, expect, test } from 'bun:test'
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
  flatten(node).flatMap((entry) => entry.children.filter((child) => typeof child === 'string')).join(' ')

const pressOf = (node: unknown, key: string) => {
  const button = flatten(node).find((entry) => entry.props.key === key)
  return button?.props.onPress as (() => void) | undefined
}

const harness = (env: Record<string, string>, replies: Array<{ exitCode: number; stdout: string }>) => {
  const calls: string[][] = []
  const $ = {
    ui: { resolve: async () => ({ Box: 'Box', Button: 'Button', Text: 'Text' }), invalidate: () => {} },
    env: { get: async (name: string) => env[name] },
    fs: { exists: async () => false, read: async () => '', write: async () => {} },
    process: {
      run: async (argv: string[]) => {
        calls.push(argv)
        return { exitCode: 0, stdout: '', stderr: '', ...replies[calls.length - 1] }
      },
    },
    session: {
      messages: async () => [
        { role: 'user', text: '問題', toolUses: [], toolResults: [] },
        { role: 'assistant', text: '回答', toolUses: [], toolResults: [] },
      ],
    },
    http: { fetch: async () => ({ ok: false, status: 500, text: 'nope' }) },
    model: { complete: async () => 'inline 的回答' },
  }
  let handler: (($: unknown, e: unknown, next: unknown) => Promise<unknown>) | null = null
  register(((_event: string, _filter: unknown, fn: typeof handler) => { handler = fn }) as never)
  const event = { surface: 'terminal', props: { hasSurvey: false, bodyColumns: 80 } }
  const draw = async () => handler!($, event, async () => null)
  return { calls, draw }
}

const splitReply = { exitCode: 0, stdout: JSON.stringify({ ok: true, result: { split: { handle: 'term_pane' } } }) }
const listReply = { exitCode: 0, stdout: JSON.stringify({ ok: true, result: { terminals: [{ handle: 'term_pane' }] } }) }

describe('pressing 白話 inside Orca', () => {
  let bench: ReturnType<typeof harness>

  beforeEach(() => {
    bench = harness({ ORCA_TERMINAL_HANDLE: 'term_self' }, [splitReply, listReply, { exitCode: 0, stdout: '{"ok":true}' }])
  })

  test('splits a pane running ww instead of asking a model', async () => {
    pressOf(await bench.draw(), 'ww:plain')!()
    await Bun.sleep(20)
    expect(bench.calls[0]).toEqual(
      ['orca', 'terminal', 'split', '--terminal', 'term_self', '--direction', 'vertical', '--command', 'ww 1', '--json'])
    expect(textOf(await bench.draw())).toContain('新拆的那格')
  })

  test('the second press reuses the pane it already opened', async () => {
    pressOf(await bench.draw(), 'ww:plain')!()
    await Bun.sleep(20)
    pressOf(await bench.draw(), 'ww:lost')!()
    await Bun.sleep(20)
    expect(bench.calls[1]).toEqual(['orca', 'terminal', 'list', '--json'])
    expect(bench.calls[2]).toEqual(['orca', 'terminal', 'send', '--terminal', 'term_pane', '--text', 'ww', '--enter', '--json'])
    expect(textOf(await bench.draw())).toContain('旁邊那格')
  })
})

const herdrSplitReply = { exitCode: 0, stdout: JSON.stringify({ id: 'cli:pane:split', result: { pane: { pane_id: 'w4:pPM' } } }) }
const herdrListReply = { exitCode: 0, stdout: JSON.stringify({ id: 'cli:pane:list', result: { panes: [{ pane_id: 'w4:pPM' }] } }) }
const herdrRunReply = { exitCode: 0, stdout: JSON.stringify({ id: 'cli:pane:run', result: { type: 'ok' } }) }

describe('pressing 白話 inside Herdr', () => {
  let bench: ReturnType<typeof harness>

  beforeEach(() => {
    bench = harness(
      { HERDR_PANE_ID: 'w4:pPJ', HERDR_WORKSPACE_ID: 'w4', PWD: '/repo' },
      [herdrSplitReply, herdrRunReply, herdrListReply, herdrRunReply])
  })

  test('splits right and then runs ww in the new pane', async () => {
    pressOf(await bench.draw(), 'ww:plain')!()
    await Bun.sleep(20)
    expect(bench.calls[0]).toEqual(
      ['herdr', 'pane', 'split', '--current', '--direction', 'right', '--no-focus', '--cwd', '/repo'])
    expect(bench.calls[1]).toEqual(['herdr', 'pane', 'run', 'w4:pPM', 'ww 1'])
    expect(textOf(await bench.draw())).toContain('新拆的那格')
  })

  test('the second press reuses the pane it already opened', async () => {
    pressOf(await bench.draw(), 'ww:plain')!()
    await Bun.sleep(20)
    pressOf(await bench.draw(), 'ww:lost')!()
    await Bun.sleep(20)
    expect(bench.calls[2]).toEqual(['herdr', 'pane', 'list', '--workspace', 'w4'])
    expect(bench.calls[3]).toEqual(['herdr', 'pane', 'run', 'w4:pPM', 'ww'])
    expect(textOf(await bench.draw())).toContain('旁邊那格')
  })
})

describe('when both backends are present', () => {
  test('orca wins because it is the pane the user is looking at', async () => {
    const bench = harness(
      { HERDR_PANE_ID: 'w4:pPJ', HERDR_WORKSPACE_ID: 'w4', ORCA_TERMINAL_HANDLE: 'term_self' },
      [splitReply])
    pressOf(await bench.draw(), 'ww:plain')!()
    await Bun.sleep(20)
    expect(bench.calls[0]![0]).toBe('orca')
  })
})

describe('when the pane route cannot run', () => {
  test('a plain terminal keeps the inline retell', async () => {
    const bench = harness({}, [])
    pressOf(await bench.draw(), 'ww:plain')!()
    await Bun.sleep(30)
    expect(bench.calls).toEqual([])
    expect(textOf(await bench.draw())).toContain('inline 的回答')
  })

  test('a failed split falls back inline and says why', async () => {
    const bench = harness({ ORCA_TERMINAL_HANDLE: 'term_self' }, [{ exitCode: 1, stdout: '', stderr: 'no runtime' }])
    pressOf(await bench.draw(), 'ww:plain')!()
    await Bun.sleep(30)
    const drawn = textOf(await bench.draw())
    expect(drawn).toContain('inline 的回答')
    expect(drawn).toContain('orca terminal split 失敗')
  })

  test('a herdr pane that splits but refuses the command falls back inline', async () => {
    const bench = harness(
      { HERDR_PANE_ID: 'w4:pPJ', HERDR_WORKSPACE_ID: 'w4' },
      [herdrSplitReply, { exitCode: 1, stdout: '', stderr: 'pane_not_found' }])
    pressOf(await bench.draw(), 'ww:plain')!()
    await Bun.sleep(30)
    const drawn = textOf(await bench.draw())
    expect(drawn).toContain('inline 的回答')
    expect(drawn).toContain('herdr pane run 失敗')
  })

  test('half a herdr identity is treated as no herdr at all', async () => {
    const bench = harness({ HERDR_PANE_ID: 'w4:pPJ' }, [])
    pressOf(await bench.draw(), 'ww:plain')!()
    await Bun.sleep(30)
    expect(bench.calls).toEqual([])
    expect(textOf(await bench.draw())).toContain('inline 的回答')
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
