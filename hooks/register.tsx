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

export function register(on: On) {
  let state: State = { status: 'idle' }

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface !== 'terminal') return next(e)
    const { Box, Button, Text } = await $.ui.resolve(e)
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

    const run = (mode: Mode, turns: number | null) => {
      if (state.status === 'busy') return
      const label = turns === null ? '跟丟了 · 整段' : `白話 · 往回 ${turns} turn`
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
          const text = await $.model.complete({ model, system, prompt: transcript, maxTokens: 1500 })
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
          <Button key="ww:plain:1" label="白話 1" autoFocus onPress={() => run('plain', 1)} />
          <Button key="ww:plain:3" label="白話 3" onPress={() => run('plain', 3)} />
          <Button key="ww:lost" label="跟丟了" onPress={() => run('lost', null)} />
          {state.status !== 'idle' ? <Button key="ww:clear" label="清除" dimColor onPress={clear} /> : null}
        </Box>
        {body}
        {await next(e)}
      </Box>
    )
  })
}
