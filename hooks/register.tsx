import type { On } from 'claude-code'
import { CACHE_FILE, lookup, parseCache, sharedKeyFor, withEntry } from './cache.ts'
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
import * as herdr from './herdr.ts'
import * as orca from './orca.ts'
import { commandFor, routeFor, type PaneChoice, type PaneTarget } from './panes.ts'
import { DEFAULT_PLAIN, DEFAULT_WAIT_WHAT } from './prompts.ts'
import type { RecapRecord } from './recap.ts'
import { registerRecap } from './recap-hooks.ts'
import { cacheMessagesOf, lastCacheTurns, lastTurns, transcriptOf } from './turns.ts'

type Mode = 'plain' | 'lost'

type State =
  | { status: 'idle' }
  | { status: 'busy'; label: string }
  | { status: 'choosing'; label: string; mode: Mode; route: PaneChoice }
  | { status: 'sent'; label: string; command: string; reused: boolean }
  | { status: 'done'; label: string; text: string; seconds: string; source: string; chars: number; fallback: string | null; cached: boolean }
  | { status: 'error'; label: string; text: string }

const PROMPT_DIR = '.config/cc-sidecar-waitwhat'
const KEY_FILE = '.cli-proxy-api/config.yaml'
const PAYLOAD_HEAD = '以下是 Claude Code 的對話紀錄，USER 是使用者、ASSISTANT 是 Claude。只重講紀錄裡的內容，不要評論紀錄本身。'

export function register(on: On) {
  let state: State = { status: 'idle' }
  const panes: Record<PaneTarget['host'], string | null> = { orca: null, herdr: null }
  let latest: RecapRecord | null = null

  registerRecap(on, (record) => {
    latest = record
  })

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

    const cachePath = async () => {
      const home = await $.env.get('HOME')
      return home === undefined ? null : `${home}/${CACHE_FILE}`
    }

    const readCache = async () => {
      const path = await cachePath()
      if (path === null || !(await $.fs.exists(path))) return {}
      return parseCache(await $.fs.read(path))
    }

    const writeCache = async (key: string, answer: string, label: string, source: string) => {
      const path = await cachePath()
      if (path === null) return
      try {
        const entries = withEntry(await readCache(), key, { answer, label, source, at: Date.now() / 1000 })
        await $.fs.write(path, JSON.stringify(entries))
      } catch {
        return
      }
    }

    const cmdCandidate = async () => {
      const command = await $.env.get('SIDECAR_CMD')
      return command === undefined || command.trim().length === 0 ? null : command
    }

    const httpModel = async () => (await $.env.get('SIDECAR_MODEL')) ?? DEFAULT_HTTP_MODEL
    const fallbackModel = async () => (await $.env.get('WW_MODEL')) ?? DEFAULT_FALLBACK_MODEL

    const askCmd = async (system: string, payload: string) => {
      const command = await cmdCandidate()
      if (command === null) throw new Error('沒有設 SIDECAR_CMD')
      const argv = splitArgv(command)
      const result = await $.process.run(argv, { stdin: cmdStdin(system, payload), timeoutMs: 300000 })
      if (result.exitCode !== 0) throw new Error(`${command} 失敗（exit ${result.exitCode}）：${clip((result.stderr || result.stdout).trim(), 200)}`)
      const answer = result.stdout.trim()
      if (answer.length === 0) throw new Error(`${command} 沒有輸出任何內容`)
      return { text: answer, source: `cmd:${command}`, requestModel: `cmd:${command}` }
    }

    const askHttp = async (system: string, payload: string) => {
      const url = (await $.env.get('SIDECAR_PROXY')) ?? DEFAULT_PROXY
      const model = await httpModel()
      const response = await $.http.fetch(url, { method: 'POST', headers: httpHeaders(await apiKey()), body: httpBody(model, system, payload) })
      if (!response.ok) throw new Error(`HTTP ${response.status}：${clip(response.text.trim(), 200)}`)
      return { text: httpReplyText(response.text), source: `http:${model}`, requestModel: model }
    }

    const askFallback = async (system: string, payload: string) => {
      const model = await fallbackModel()
      const text = await $.model.complete({ model, system, prompt: payload, maxTokens: 1500 })
      return { text: text.trim(), source: `claude:${model}`, requestModel: `claude:${model}` }
    }

    const fromCache = async (key: string) => lookup(await readCache(), key)

    type Ran = { exitCode: number; stdout: string; stderr: string }

    type Backend = {
      open: (command: string) => Promise<string>
      send: (pane: string, command: string) => Promise<void>
      alive: (pane: string) => Promise<boolean>
    }

    const failed = (label: string, ran: Ran) =>
      new Error(`${label} 失敗（exit ${ran.exitCode}）：${clip((ran.stderr || ran.stdout).trim(), 200)}`)

    const orcaBackend = (handle: string): Backend => ({
      open: async (command) => {
        const opened = await $.process.run(orca.splitArgs(handle, command), { timeoutMs: 15000 })
        if (opened.exitCode !== 0) throw failed('orca terminal split', opened)
        const created = orca.handleFromSplit(opened.stdout)
        if (created === null) throw new Error('orca terminal split 沒有回傳 pane handle')
        return created
      },
      send: async (target, command) => {
        const sent = await $.process.run(orca.sendArgs(target, command), { timeoutMs: 10000 })
        if (sent.exitCode !== 0) throw failed('orca terminal send', sent)
      },
      alive: async (target) => {
        const listed = await $.process.run(orca.listArgs(), { timeoutMs: 10000 })
        return listed.exitCode === 0 && orca.paneIsAlive(listed.stdout, target)
      },
    })

    const herdrBackend = (workspace: string, cwd: string | null): Backend => ({
      open: async (command) => {
        const opened = await $.process.run(herdr.splitArgs(cwd), { timeoutMs: 15000 })
        if (opened.exitCode !== 0) throw failed('herdr pane split', opened)
        const created = herdr.paneFromSplit(opened.stdout)
        if (created === null) throw new Error('herdr pane split 沒有回傳 pane id')
        const ran = await $.process.run(herdr.runArgs(created, command), { timeoutMs: 10000 })
        if (ran.exitCode !== 0) throw failed('herdr pane run', ran)
        return created
      },
      send: async (target, command) => {
        const ran = await $.process.run(herdr.runArgs(target, command), { timeoutMs: 10000 })
        if (ran.exitCode !== 0) throw failed('herdr pane run', ran)
      },
      alive: async (target) => {
        const listed = await $.process.run(herdr.listArgs(workspace), { timeoutMs: 10000 })
        return listed.exitCode === 0 && herdr.paneIsAlive(listed.stdout, target)
      },
    })

    const backendOf = async () => routeFor({
      ORCA_TERMINAL_HANDLE: await $.env.get('ORCA_TERMINAL_HANDLE'),
      ORCA_PANE_KEY: await $.env.get('ORCA_PANE_KEY'),
      ORCA_WORKTREE_ID: await $.env.get('ORCA_WORKTREE_ID'),
      HERDR_PANE_ID: await $.env.get('HERDR_PANE_ID'),
      HERDR_WORKSPACE_ID: await $.env.get('HERDR_WORKSPACE_ID'),
      PWD: await $.env.get('PWD'),
    })

    const retellInPane = async (mode: Mode, target: PaneTarget) => {
      const chosen = target.host === 'orca' ? orcaBackend(target.handle) : herdrBackend(target.workspace, target.cwd)
      const command = commandFor(mode, target.host)
      const pane = panes[target.host]
      if (pane !== null) {
        const reusable = await chosen.alive(pane)
        if (reusable) {
          try {
            await chosen.send(pane, command)
          } catch (err) {
            panes[target.host] = null
            throw err
          }
          return { command, reused: true }
        }
        panes[target.host] = null
      }
      panes[target.host] = await chosen.open(command)
      return { command, reused: false }
    }

    const ask = async (system: string, payload: string) => {
      const source = sourceOf(await $.env.get('SIDECAR_SOURCE'))
      const chain = source === 'cmd' ? [askCmd] : source === 'http' ? [askHttp] : [askCmd, askHttp]
      const reasons: string[] = []
      for (const attempt of chain) {
        try {
          const answer = await attempt(system, payload)
          return { ...answer, fallback: reasons.length > 0 ? reasons.join('；') : null }
        } catch (err) {
          reasons.push(String(err instanceof Error ? err.message : err))
        }
      }
      const answer = await askFallback(system, payload)
      return { ...answer, fallback: reasons.join('；') }
    }

    const run = (mode: Mode, selected?: PaneTarget) => {
      if (state.status === 'busy' || state.status === 'choosing') return
      const label = mode === 'lost' ? '跟丟了 · 整段' : '白話 · 往回 1 turn'
      state = { status: 'busy', label }
      redraw()
      const started = Date.now()
      void (async () => {
        let detoured: string | null = null
        try {
          const chosen = selected ?? await backendOf()
          if (chosen.host === 'choice') {
            state = { status: 'choosing', label, mode, route: chosen }
            redraw()
            return
          }
          if (chosen.host !== 'inline') {
            try {
              const pushed = await retellInPane(mode, chosen)
              state = { status: 'sent', label, command: pushed.command, reused: pushed.reused }
              redraw()
              return
            } catch (err) {
              detoured = String(err instanceof Error ? err.message : err)
            }
          }
          const messages = await $.session.messages()
          const picked = mode === 'lost' ? messages : lastTurns(messages, 1)
          const cachePicked = mode === 'lost' ? messages : lastCacheTurns(messages, 1)
          const transcript = transcriptOf(picked)
          const system = mode === 'lost' ? await readOverride('wait-what', DEFAULT_WAIT_WHAT) : await readOverride('plain', DEFAULT_PLAIN)
          const payload = `${PAYLOAD_HEAD}\n\n${transcript}`
          const key = await sharedKeyFor(mode, cacheMessagesOf(cachePicked))
          const hit = await fromCache(key)
          if (hit !== null) {
            state = { status: 'done', label, text: hit.answer, seconds: '0.0', source: hit.source, chars: transcript.length, fallback: detoured, cached: true }
            redraw()
            return
          }
          const answer = await ask(system, payload)
          const seconds = ((Date.now() - started) / 1000).toFixed(1)
          const reasons = [detoured, answer.fallback].filter((reason) => reason !== null && reason.length > 0)
          state = { status: 'done', label, text: answer.text, seconds, source: answer.source, chars: transcript.length, fallback: reasons.length > 0 ? reasons.join('；') : null, cached: false }
          await writeCache(key, answer.text, mode === 'lost' ? '跟丟了' : '白話', answer.source)
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

    const choice = state.status === 'choosing' ? state : null
    const choose = (host: PaneTarget['host'] | null) => {
      if (choice === null || state !== choice) return
      if (host === null) {
        clear()
        return
      }
      state = { status: 'idle' }
      run(choice.mode, choice.route[host])
    }

    const body =
      choice !== null ? (
        <Box flexDirection="column">
          <Text>{`── ${choice.label} · 同時有 Orca 與 Herdr 身分，請選擇宿主（未選不執行）`}</Text>
          <Box flexDirection="row" columnGap={1}>
            <Button key="ww:orca" label="Orca" onPress={() => choose('orca')} />
            <Button key="ww:herdr" label="Herdr" onPress={() => choose('herdr')} />
            <Button key="ww:cancel" label="取消" onPress={() => choose(null)} />
          </Box>
        </Box>
      )
      : state.status === 'busy' ? <Text dimColor>{`── ${state.label} · 重講中…`}</Text>
      : state.status === 'sent' ? <Text dimColor>{`── ${state.label} · 已丟給${state.reused ? '旁邊那格' : '新拆的那格'}（${state.command}）`}</Text>
      : state.status === 'error' ? <Text color="red">{`── ${state.label} · 失敗：${state.text}`}</Text>
      : state.status === 'done' ? (
        <Box flexDirection="column">
          <Text dimColor>{state.cached ? `── ${state.label}  (快取命中 · 來源 ${state.source})` : `── ${state.label}  (送出 ${state.chars.toLocaleString()} 字 → ${state.source} · ${state.seconds}s)`}</Text>
          {state.fallback !== null ? <Text dimColor color="yellow">{`   退回原因：${state.fallback}`}</Text> : null}
          <Box borderStyle="round" borderColor="gray" paddingX={1} width={e.props.bodyColumns}>
            <Text wrap="wrap">{state.text}</Text>
          </Box>
        </Box>
      )
      : null

    const shown = latest !== null && latest.sessionId === (await $.session.id()) ? latest : null
    const recapLine = shown === null ? null : `recap · ${shown.now}${shown.next.length > 0 ? ` → ${shown.next}` : ''}`

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Text dimColor>wait what</Text>
          <Button key="ww:plain" label="白話" autoFocus onPress={() => run('plain')} />
          <Button key="ww:lost" label="跟丟了" onPress={() => run('lost')} />
          {state.status !== 'idle' ? <Button key="ww:clear" label="清除" dimColor onPress={clear} /> : null}
        </Box>
        {recapLine !== null ? <Text dimColor wrap="truncate-end">{recapLine}</Text> : null}
        {body}
        {await next(e)}
      </Box>
    )
  })
}
