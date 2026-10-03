import type { EngineInterface, On, SessionMessage, Timer } from 'claude-code'
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
import { DEFAULT_PLAIN, DEFAULT_WAIT_WHAT } from './prompts.ts'
import {
  RECAP_FALLBACK_MODEL,
  RECAP_INPUT_BUDGET,
  RECAP_MODEL,
  RECAP_TIMEOUT_MS,
  type RecapFields,
  type RecapRecord,
  delayFor,
  fingerprintOf,
  isTooLarge,
  parseRecap,
  recapBody,
  recapInput,
  recapPath,
} from './recap.ts'
import { cacheMessagesOf, lastCacheTurns, lastTurns, transcriptOf } from './turns.ts'
import {
  MARKDOWN_MAX,
  YSK_CLEAR_AFTER_PROMPTS,
  YSK_IDLE_MS,
  YSK_INPUT_BUDGET,
  YSK_LOG,
  YSK_PROMPT,
  YSK_SEEN_KEPT,
  type YskAnswer,
  type YskShown,
  isRepeat,
  parseYsk,
  withLogLine,
  yskPayload,
} from './ysk.ts'

// Every function that takes $ lives in this file: the engine's validator follows $ only into
// functions declared in the same file as the hook, never across an import. Pure helpers stay
// in their own modules.

type Mode = 'plain' | 'lost'

type State =
  | { status: 'idle' }
  | { status: 'busy'; label: string }
  | { status: 'done'; label: string; text: string; seconds: string; source: string; chars: number; fallback: string | null; cached: boolean }
  | { status: 'error'; label: string; text: string }

type View = 'retell' | 'ysk'

type Answer = { text: string; source: string; fallback: string | null }

type RecapRunner = { pending: Timer | null; lastRunAt: number | null; lastFingerprint: string; running: boolean }

type YskRunner = { pending: Timer | null; running: boolean; lastFingerprint: string; seen: string[]; promptsSince: number }

export const PANE = 'waitwhat'
const PROMPT_DIR = '.config/cc-sidecar-waitwhat'
const KEY_FILE = '.cli-proxy-api/config.yaml'
const PAYLOAD_HEAD = '以下是 Claude Code 的對話紀錄，USER 是使用者、ASSISTANT 是 Claude。只重講紀錄裡的內容，不要評論紀錄本身。'

const apiKeyOf = async ($: EngineInterface) => {
  const fromEnv = await $.env.get('SIDECAR_API_KEY')
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv
  const home = await $.env.get('HOME')
  if (home === undefined) return null
  const path = `${home}/${KEY_FILE}`
  return (await $.fs.exists(path)) ? firstApiKey(await $.fs.read(path)) : null
}

const askCmd = async ($: EngineInterface, system: string, payload: string) => {
  const command = await $.env.get('SIDECAR_CMD')
  if (command === undefined || command.trim().length === 0) throw new Error('沒有設 SIDECAR_CMD')
  const result = await $.process.run(splitArgv(command), { stdin: cmdStdin(system, payload), timeoutMs: 300000 })
  if (result.exitCode !== 0) throw new Error(`${command} 失敗（exit ${result.exitCode}）：${clip((result.stderr || result.stdout).trim(), 200)}`)
  const text = result.stdout.trim()
  if (text.length === 0) throw new Error(`${command} 沒有輸出任何內容`)
  return { text, source: `cmd:${command}` }
}

const askHttp = async ($: EngineInterface, system: string, payload: string, model: string | undefined) => {
  const url = (await $.env.get('SIDECAR_PROXY')) ?? DEFAULT_PROXY
  const chosen = model ?? (await $.env.get('SIDECAR_MODEL')) ?? DEFAULT_HTTP_MODEL
  const response = await $.http.fetch(url, { method: 'POST', headers: httpHeaders(await apiKeyOf($)), body: httpBody(chosen, system, payload) })
  if (!response.ok) throw new Error(`HTTP ${response.status}：${clip(response.text.trim(), 200)}`)
  return { text: httpReplyText(response.text), source: `http:${chosen}` }
}

// $.model.complete resolves a result object (2.1.288): a provider failure is an arm, not a rejection.
const askFallback = async ($: EngineInterface, system: string, payload: string) => {
  const model = (await $.env.get('WW_MODEL')) ?? DEFAULT_FALLBACK_MODEL
  const result = await $.model.complete({ model, system, prompt: payload, maxTokens: 1500 })
  if (!result.isAnswered) throw new Error(`claude:${model} 沒有回答（${result.reason}）`)
  return { text: result.text.trim(), source: `claude:${model}` }
}

// cmd, then http, then Claude's own model; SIDECAR_SOURCE pins one of the first two.
const ask = async ($: EngineInterface, system: string, payload: string, httpModel?: string): Promise<Answer> => {
  const source = sourceOf(await $.env.get('SIDECAR_SOURCE'))
  const chain = source === 'cmd' ? ['cmd'] : source === 'http' ? ['http'] : ['cmd', 'http']
  const reasons: string[] = []
  for (const step of chain) {
    try {
      const answer = step === 'cmd' ? await askCmd($, system, payload) : await askHttp($, system, payload, httpModel)
      return { ...answer, fallback: reasons.length > 0 ? reasons.join('；') : null }
    } catch (err) {
      reasons.push(String(err instanceof Error ? err.message : err))
    }
  }
  const answer = await askFallback($, system, payload)
  return { ...answer, fallback: reasons.join('；') }
}

const askRecapOnce = async ($: EngineInterface, apiKey: string | null, model: string, messages: SessionMessage[], budget: number) => {
  const url = (await $.env.get('SIDECAR_PROXY')) ?? DEFAULT_PROXY
  const request = $.http.fetch(url, { method: 'POST', headers: httpHeaders(apiKey), body: recapBody(model, recapInput(messages, budget)) })
  // $.http.fetch takes no timeout, so a stalled relay would otherwise hold the recap forever.
  const timedOut = $.clock.sleep(RECAP_TIMEOUT_MS).then(() => ({ status: 0, ok: false, headers: {}, text: `timed out after ${RECAP_TIMEOUT_MS}ms` }))
  const response = await Promise.race([request, timedOut])
  return { ...response, model }
}

type RecapAsked = Awaited<ReturnType<typeof askRecapOnce>>

const recapFieldsOf = (got: RecapAsked, reasons: string[]) => {
  if (!got.ok) {
    reasons.push(`${got.model} HTTP ${got.status}: ${clip(got.text.trim(), 160)}`)
    return null
  }
  let reply = ''
  try {
    reply = httpReplyText(got.text)
  } catch {
    // An empty or non-JSON body counts as unparseable so the fallback still runs.
  }
  const fields: RecapFields | null = parseRecap(reply)
  if (fields === null) reasons.push(`${got.model} 回了無法解析的內容`)
  return fields
}

// Luna first; then Groq, with one retry at half the input when its per-minute token limit
// refuses the size. A null answer leaves Collie on its "你：<prompt>" line.
const askRecap = async ($: EngineInterface, apiKey: string | null, messages: SessionMessage[]) => {
  const reasons: string[] = []
  const primary = await askRecapOnce($, apiKey, RECAP_MODEL, messages, RECAP_INPUT_BUDGET)
  const fromPrimary = recapFieldsOf(primary, reasons)
  if (fromPrimary !== null) return { fields: fromPrimary, model: RECAP_MODEL, reasons }
  let fallback = await askRecapOnce($, apiKey, RECAP_FALLBACK_MODEL, messages, RECAP_INPUT_BUDGET)
  if (!fallback.ok && isTooLarge(fallback.status, fallback.text)) fallback = await askRecapOnce($, apiKey, RECAP_FALLBACK_MODEL, messages, RECAP_INPUT_BUDGET / 2)
  const fromFallback = recapFieldsOf(fallback, reasons)
  return fromFallback !== null ? { fields: fromFallback, model: RECAP_FALLBACK_MODEL, reasons } : { fields: null, model: null, reasons }
}

const recapNow = async ($: EngineInterface, runner: RecapRunner, onWrite: (record: RecapRecord) => void) => {
  if (runner.running) return
  runner.running = true
  try {
    if ((await $.session.surfaces()).length === 0) return
    if ((await $.prompt.read()).text.trim().length > 0) return
    const messages = await $.session.messages()
    const fingerprint = fingerprintOf(messages)
    if (fingerprint === runner.lastFingerprint) return
    const home = await $.env.get('HOME')
    const sessionId = await $.session.id()
    const path = home === undefined ? null : recapPath(home, sessionId)
    if (home === undefined || path === null) return
    runner.lastRunAt = await $.clock.now()
    const answer = await askRecap($, await apiKeyOf($), messages)
    if (answer.fields === null || answer.model === null) {
      $.ui.log(`recap failed: ${JSON.stringify(answer.reasons)}`, { to: 'debug' })
      return
    }
    const record: RecapRecord = { version: 1, sessionId, at: await $.clock.now(), model: answer.model, ...answer.fields }
    await $.fs.write(path, JSON.stringify(record))
    runner.lastFingerprint = fingerprint
    onWrite(record)
    $.ui.invalidate('ui.render')
  } catch (error) {
    $.ui.log(`recap failed: ${JSON.stringify(String(error))}`, { to: 'debug' })
  } finally {
    runner.running = false
  }
}

const yskLog = async ($: EngineInterface, entry: Record<string, unknown>) => {
  try {
    const home = await $.env.get('HOME')
    if (home === undefined) return
    const path = `${home}/${YSK_LOG}`
    const before = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
    await $.fs.write(path, withLogLine(before, { at: Date.now(), ...entry }))
  } catch {
    return
  }
}

const settleYsk = async ($: EngineInterface, shown: YskShown, answer: YskAnswer, onSettled: (shown: YskShown) => void) => {
  await yskLog($, { event: 'answered', sessionId: shown.sessionId, answer, tag: shown.item.tag, title: shown.item.title })
  onSettled({ ...shown, isUnread: false, answer })
  $.ui.invalidate('ui.render')
}

const openPane = async ($: EngineInterface, title: string) => {
  $.ui.invalidate('ui.render')
  await $.ui.open({ id: PANE, title })
}

const yskNow = async ($: EngineInterface, runner: YskRunner, onFound: (shown: YskShown) => void) => {
  if (runner.running) return
  runner.running = true
  const started = Date.now()
  const sessionId = await $.session.id()
  try {
    if ((await $.session.surfaces()).length === 0) return
    if ((await $.prompt.read()).text.trim().length > 0) return
    const messages = await $.session.messages()
    const fingerprint = fingerprintOf(messages)
    if (fingerprint === runner.lastFingerprint) return
    runner.lastFingerprint = fingerprint
    const payload = yskPayload(messages, runner.seen, YSK_INPUT_BUDGET)
    const answer = await ask($, YSK_PROMPT, payload, await $.env.get('YSK_MODEL'))
    const seconds = Number(((Date.now() - started) / 1000).toFixed(1))
    const parsed = parseYsk(answer.text)
    const base = { event: 'checked', sessionId, source: answer.source, chars: payload.length, seconds }
    if (parsed === null) return await yskLog($, { ...base, outcome: 'parse_failed' })
    if (parsed.item === null) return await yskLog($, { ...base, outcome: 'none' })
    if (isRepeat(parsed.item.line, runner.seen)) return await yskLog($, { ...base, outcome: 'repeat' })
    runner.seen = [...runner.seen, parsed.item.line].slice(-YSK_SEEN_KEPT)
    runner.promptsSince = 0
    onFound({ sessionId, item: parsed.item, isUnread: true, answer: null, source: answer.source })
    await yskLog($, { ...base, outcome: 'shown', tag: parsed.item.tag, title: parsed.item.title })
    $.ui.invalidate('ui.render')
  } catch (error) {
    await yskLog($, { event: 'checked', sessionId, outcome: 'error', reason: String(error instanceof Error ? error.message : error) })
  } finally {
    runner.running = false
  }
}

export function register(on: On) {
  let state: State = { status: 'idle' }
  let view: View = 'retell'
  let latest: RecapRecord | null = null
  let flagged: YskShown | null = null
  const recapRunner: RecapRunner = { pending: null, lastRunAt: null, lastFingerprint: '', running: false }
  const yskRunner: YskRunner = { pending: null, running: false, lastFingerprint: '', seen: [], promptsSince: 0 }

  const cancelPending = () => {
    recapRunner.pending?.cancel()
    recapRunner.pending = null
    yskRunner.pending?.cancel()
    yskRunner.pending = null
  }

  const settled = (shown: YskShown) => {
    flagged = shown
  }

  on('turn.start', ($, e, next) => {
    cancelPending()
    return next(e)
  })

  // Both the recap and the You-should-know check run once the main agent stops and waits for
  // the person: that is when they read.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    cancelPending()
    const now = await $.clock.now()
    recapRunner.pending = $.clock.after(delayFor(now, recapRunner.lastRunAt), () => {
      recapRunner.pending = null
      void recapNow($, recapRunner, (record) => {
        latest = record
      })
    })
    yskRunner.pending = $.clock.after(YSK_IDLE_MS, () => {
      yskRunner.pending = null
      void yskNow($, yskRunner, (shown) => {
        flagged = shown
      })
    })
    return result
  })

  on('prompt.submit', async ($, e, next) => {
    if (flagged !== null && flagged.isUnread) {
      yskRunner.promptsSince += 1
      if (yskRunner.promptsSince >= YSK_CLEAR_AFTER_PROMPTS) {
        await settleYsk($, flagged, 'ignored', () => {
          flagged = null
        })
      }
    }
    return next(e)
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

    const fromCache = async (key: string) => lookup(await readCache(), key)

    const run = (mode: Mode) => {
      const label = mode === 'lost' ? '跟丟了 · 整段' : '白話 · 往回 1 turn'
      view = 'retell'
      void openPane($, mode === 'lost' ? '跟丟了' : '白話')
      if (state.status === 'busy') return
      state = { status: 'busy', label }
      redraw()
      const started = Date.now()
      void (async () => {
        try {
          const messages = await $.session.messages()
          const picked = mode === 'lost' ? messages : lastTurns(messages, 1)
          const cachePicked = mode === 'lost' ? messages : lastCacheTurns(messages, 1)
          const transcript = transcriptOf(picked)
          const system = mode === 'lost' ? await readOverride('wait-what', DEFAULT_WAIT_WHAT) : await readOverride('plain', DEFAULT_PLAIN)
          const payload = `${PAYLOAD_HEAD}\n\n${transcript}`
          const key = await sharedKeyFor(mode, cacheMessagesOf(cachePicked))
          const hit = await fromCache(key)
          if (hit !== null) {
            state = { status: 'done', label, text: hit.answer, seconds: '0.0', source: hit.source, chars: transcript.length, fallback: null, cached: true }
            redraw()
            return
          }
          const answer = await ask($, system, payload)
          const seconds = ((Date.now() - started) / 1000).toFixed(1)
          state = { status: 'done', label, text: answer.text, seconds, source: answer.source, chars: transcript.length, fallback: answer.fallback, cached: false }
          await writeCache(key, answer.text, mode === 'lost' ? '跟丟了' : '白話', answer.source)
        } catch (err) {
          state = { status: 'error', label, text: String(err instanceof Error ? err.message : err) }
        }
        redraw()
      })()
    }

    const sessionId = await $.session.id()
    const recap = latest !== null && latest.sessionId === sessionId ? latest : null
    const recapLine = recap === null ? null : `recap · ${recap.now}${recap.next.length > 0 ? ` → ${recap.next}` : ''}`
    const lit = flagged !== null && flagged.sessionId === sessionId && flagged.isUnread ? flagged : null

    const openYsk = () => {
      view = 'ysk'
      void openPane($, lit !== null ? lit.item.tag : '該知道')
      if (lit !== null) void settleYsk($, lit, 'opened', settled)
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Button key="ww:plain" label="白話" autoFocus onPress={() => run('plain')} />
          <Button key="ww:lost" label="跟丟了" onPress={() => run('lost')} />
          <Button key="ww:ysk" label={lit !== null ? '該知道 ●' : '該知道'} variant={lit !== null ? 'primary' : undefined} dimColor={lit === null} onPress={openYsk} />
        </Box>
        {recapLine !== null ? <Text dimColor wrap="truncate-end">{recapLine}</Text> : null}
        {await next(e)}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = await $.ui.resolve(e)
    const width = e.props.bodyColumns

    if (view === 'ysk') {
      const shown = flagged !== null && flagged.sessionId === (await $.session.id()) ? flagged : null
      if (shown === null) {
        return <Text dimColor wrap="wrap">目前沒有要提醒的事。main 每次停下來等你時，背景會檢查一次。</Text>
      }
      const answered = shown.answer === 'helpful' ? '有幫助' : shown.answer === 'not_relevant' ? '不相關' : null
      return (
        <Box flexDirection="column" width={width}>
          <Text bold wrap="wrap">{`${shown.item.tag} · ${shown.item.title}`}</Text>
          <Markdown text={shown.item.explain} />
          <Text dimColor wrap="truncate-end">{`來源 ${shown.source}`}</Text>
          {answered !== null ? (
            <Text dimColor>{`已記錄：${answered}`}</Text>
          ) : (
            <Box flexDirection="row" columnGap={1}>
              <Button key="ysk:helpful" label="有幫助" onPress={() => void settleYsk($, shown, 'helpful', settled)} />
              <Button key="ysk:not-relevant" label="不相關" onPress={() => void settleYsk($, shown, 'not_relevant', settled)} />
            </Box>
          )}
        </Box>
      )
    }

    return state.status === 'idle' ? <Text dimColor>按「白話」或「跟丟了」開始重講。</Text>
      : state.status === 'busy' ? <Text dimColor>{`${state.label} · 重講中…`}</Text>
      : state.status === 'error' ? <Text color="red" wrap="wrap">{`${state.label} · 失敗：${state.text}`}</Text>
      : (
        <Box flexDirection="column" width={width}>
          <Text dimColor wrap="wrap">{state.cached ? `${state.label}  (快取命中 · 來源 ${state.source})` : `${state.label}  (送出 ${state.chars.toLocaleString()} 字 → ${state.source} · ${state.seconds}s)`}</Text>
          {state.fallback !== null ? <Text dimColor color="yellow" wrap="wrap">{`退回原因：${state.fallback}`}</Text> : null}
          <Markdown text={state.text.slice(0, MARKDOWN_MAX)} />
        </Box>
      )
  })
}
