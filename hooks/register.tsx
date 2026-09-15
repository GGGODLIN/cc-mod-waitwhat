import type { On } from 'claude-code'
import {
  DEFAULT_FALLBACK_MODEL,
  DEFAULT_HTTP_MODEL,
  DEFAULT_PROXY,
  clip,
  cmdStdin,
  firstApiKey,
  httpBody,
  httpHeaders,
  httpReplyText,
  sourceOf,
  splitArgv,
} from './model.ts'
import { DEFAULT_PLAIN, DEFAULT_WAIT_WHAT } from './prompts.ts'
import { lastTurns, transcriptOf } from './turns.ts'

type Mode = 'plain' | 'lost'

type State =
  | { status: 'idle' }
  | { status: 'busy'; label: string }
  | { status: 'done'; label: string; text: string; seconds: string; source: string; chars: number; fallback: string | null }
  | { status: 'error'; label: string; text: string }

const PROMPT_DIR = '.config/cc-sidecar-waitwhat'
const KEY_FILE = '.cli-proxy-api/config.yaml'
const PAYLOAD_HEAD = '以下是 Claude Code 的對話紀錄，USER 是使用者、ASSISTANT 是 Claude。只重講紀錄裡的內容，不要評論紀錄本身。'

export function register(on: On) {
  let state: State = { status: 'idle' }

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface !== 'terminal') return next(e)
    const { Box, Button, Text } = await $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')

    const readOverride = async (name: string, fallback: string) => {
      const home = await $.env.get('HOME')
      if (home === undefined) return fallback
      const path = `${home}/${PROMPT_DIR}/${name}.md`
      if (!(await $.fs.exists(path))) return fallback
      const text = (await $.fs.read(path)).trim()
      return text.length > 0 ? text : fallback
    }

    const apiKey = async () => {
      const fromEnv = await $.env.get('SIDECAR_API_KEY')
      if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv
      const home = await $.env.get('HOME')
      if (home === undefined) return null
      const path = `${home}/${KEY_FILE}`
      if (!(await $.fs.exists(path))) return null
      return firstApiKey(await $.fs.read(path))
    }

    const askCmd = async (system: string, payload: string) => {
      const command = await $.env.get('SIDECAR_CMD')
      if (command === undefined || command.trim().length === 0) throw new Error('沒有設 SIDECAR_CMD')
      const argv = splitArgv(command)
      const result = await $.process.run(argv, { stdin: cmdStdin(system, payload), timeoutMs: 300000 })
      if (result.exitCode !== 0) throw new Error(`${command} 失敗（exit ${result.exitCode}）：${clip((result.stderr || result.stdout).trim(), 200)}`)
      const answer = result.stdout.trim()
      if (answer.length === 0) throw new Error(`${command} 沒有輸出任何內容`)
      return { text: answer, source: `cmd:${command}` }
    }

    const askHttp = async (system: string, payload: string) => {
      const url = (await $.env.get('SIDECAR_PROXY')) ?? DEFAULT_PROXY
      const model = (await $.env.get('SIDECAR_MODEL')) ?? DEFAULT_HTTP_MODEL
      const response = await $.http.fetch(url, { method: 'POST', headers: httpHeaders(await apiKey()), body: httpBody(model, system, payload) })
      if (!response.ok) throw new Error(`HTTP ${response.status}：${clip(response.text.trim(), 200)}`)
      return { text: httpReplyText(response.text), source: `http:${model}` }
    }

    const askFallback = async (system: string, payload: string) => {
      const model = (await $.env.get('WW_MODEL')) ?? DEFAULT_FALLBACK_MODEL
      const text = await $.model.complete({ model, system, prompt: payload, maxTokens: 1500 })
      return { text: text.trim(), source: `claude:${model}` }
    }

    const ask = async (system: string, payload: string) => {
      const source = sourceOf(await $.env.get('SIDECAR_SOURCE'))
      const chain = source === 'cmd' ? [askCmd] : source === 'http' ? [askHttp] : [askCmd, askHttp]
      const reasons: string[] = []
      for (const attempt of chain) {
        try {
          return { ...(await attempt(system, payload)), fallback: null }
        } catch (err) {
          reasons.push(String(err instanceof Error ? err.message : err))
        }
      }
      const answer = await askFallback(system, payload)
      return { ...answer, fallback: reasons.join('；') }
    }

    const run = (mode: Mode) => {
      if (state.status === 'busy') return
      const label = mode === 'lost' ? '跟丟了 · 整段' : '白話 · 往回 1 turn'
      state = { status: 'busy', label }
      redraw()
      const started = Date.now()
      void (async () => {
        try {
          const messages = await $.session.messages()
          const picked = mode === 'lost' ? messages : lastTurns(messages, 1)
          const transcript = transcriptOf(picked)
          const system = mode === 'lost' ? await readOverride('wait-what', DEFAULT_WAIT_WHAT) : await readOverride('plain', DEFAULT_PLAIN)
          const answer = await ask(system, `${PAYLOAD_HEAD}\n\n${transcript}`)
          const seconds = ((Date.now() - started) / 1000).toFixed(1)
          state = { status: 'done', label, text: answer.text, seconds, source: answer.source, chars: transcript.length, fallback: answer.fallback }
        } catch (err) {
          state = { status: 'error', label, text: String(err instanceof Error ? err.message : err) }
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
          <Text dimColor>{`── ${state.label}  (送出 ${state.chars.toLocaleString()} 字 → ${state.source} · ${state.seconds}s)`}</Text>
          {state.fallback !== null ? <Text dimColor color="yellow">{`   退回原因：${state.fallback}`}</Text> : null}
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
