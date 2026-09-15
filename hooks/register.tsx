import type { On } from 'claude-code'
import { DEFAULT_PLAIN, DEFAULT_WAIT_WHAT } from './prompts.ts'
import { lastTurns, transcriptOf } from './turns.ts'

type Mode = 'plain' | 'lost'

type State =
  | { status: 'idle' }
  | { status: 'busy'; label: string }
  | { status: 'done'; label: string; text: string; seconds: string; model: string; chars: number }
  | { status: 'error'; label: string; text: string }

const PROMPT_DIR = '.config/cc-sidecar-waitwhat'
const RANGES = ['1', '2', '3', '5', '10', 'all'] as const
const rangeLabel = (range: string) => (range === 'all' ? '整段' : `${range} turn`)

export function register(on: On) {
  let state: State = { status: 'idle' }
  let range: string = '1'

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface !== 'terminal') return next(e)
    const { Box, Button, Select, Text } = await $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')

    const promptFor = async (mode: Mode) => {
      const home = await $.env.get('HOME')
      const name = mode === 'lost' ? 'wait-what' : 'plain'
      const fallback = mode === 'lost' ? DEFAULT_WAIT_WHAT : DEFAULT_PLAIN
      if (home === undefined) return fallback
      const path = `${home}/${PROMPT_DIR}/${name}.md`
      if (!(await $.fs.exists(path))) return fallback
      const text = (await $.fs.read(path)).trim()
      return text.length > 0 ? text : fallback
    }

    const run = (mode: Mode) => {
      if (state.status === 'busy') return
      const turns = mode === 'lost' || range === 'all' ? null : Number(range)
      const label = mode === 'lost' ? '跟丟了 · 整段' : `白話 · 往回 ${rangeLabel(range)}`
      state = { status: 'busy', label }
      redraw()
      const started = Date.now()
      void (async () => {
        try {
          const messages = await $.session.messages()
          const picked = turns === null ? messages : lastTurns(messages, turns)
          const transcript = transcriptOf(picked)
          const model = (await $.env.get('WW_MODEL')) ?? 'haiku'
          const system = await promptFor(mode)
          const prompt = `以下是 Claude Code 的對話紀錄，USER 是使用者、ASSISTANT 是 Claude。只重講紀錄裡的內容，不要評論紀錄本身。\n\n${transcript}`
          const text = await $.model.complete({ model, system, prompt, maxTokens: 1500 })
          const seconds = ((Date.now() - started) / 1000).toFixed(1)
          state = { status: 'done', label, text: text.trim(), seconds, model, chars: transcript.length }
        } catch (err) {
          state = { status: 'error', label, text: String(err) }
        }
        redraw()
      })()
    }

    const clear = () => {
      state = { status: 'idle' }
      redraw()
    }

    const body =
      state.status === 'busy' ? <Text dimColor>{`── ${state.label} · 重講中…`}</Text>
      : state.status === 'error' ? <Text color="red">{`── ${state.label} · 失敗：${state.text}`}</Text>
      : state.status === 'done' ? (
        <Box flexDirection="column">
          <Text dimColor>{`── ${state.label}  (送出 ${state.chars.toLocaleString()} 字 → ${state.model} · ${state.seconds}s)`}</Text>
          <Box borderStyle="round" borderColor="gray" paddingX={1} width={e.props.bodyColumns}>
            <Text wrap="wrap">{state.text}</Text>
          </Box>
        </Box>
      )
      : null

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Text dimColor>wait what</Text>
          <Select
            key="ww:range"
            label="範圍"
            options={RANGES.map((value) => ({ value, label: rangeLabel(value) }))}
            value={range}
            onSelect={(value) => { range = value; redraw() }}
          />
          <Button key="ww:plain" label="白話" autoFocus onPress={() => run('plain')} />
          <Button key="ww:lost" label="跟丟了" onPress={() => run('lost')} />
          {state.status !== 'idle' ? <Button key="ww:clear" label="清除" dimColor onPress={clear} /> : null}
        </Box>
        {body}
        {await next(e)}
      </Box>
    )
  })
}
