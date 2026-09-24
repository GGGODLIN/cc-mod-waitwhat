import type { EngineInterface, On, SessionMessage, Timer } from 'claude-code'
import { DEFAULT_PROXY, clip, firstApiKey, httpHeaders, httpReplyText } from './model.ts'
import {
  RECAP_FALLBACK_MODEL,
  RECAP_INPUT_BUDGET,
  RECAP_MODEL,
  type RecapFields,
  type RecapRecord,
  delayFor,
  fingerprintOf,
  isTooLarge,
  parseRecap,
  recapBody,
  recapPath,
  tailWithin,
} from './recap.ts'

const KEY_FILE = '.cli-proxy-api/config.yaml'

const apiKeyOf = async ($: EngineInterface, home: string) => {
  const fromEnv = await $.env.get('SIDECAR_API_KEY')
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv
  const path = `${home}/${KEY_FILE}`
  return (await $.fs.exists(path)) ? firstApiKey(await $.fs.read(path)) : null
}

const askOnce = async ($: EngineInterface, apiKey: string | null, model: string, messages: SessionMessage[], budget: number) => {
  const url = (await $.env.get('SIDECAR_PROXY')) ?? DEFAULT_PROXY
  const response = await $.http.fetch(url, { method: 'POST', headers: httpHeaders(apiKey), body: recapBody(model, tailWithin(messages, budget)) })
  return { ...response, model }
}

type Asked = Awaited<ReturnType<typeof askOnce>>

const fieldsOf = (got: Asked, reasons: string[]) => {
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

// Groq first; one retry at half the tail when its per-minute token limit refuses the size;
// then the fallback model once. A null answer leaves Collie on its "你：<prompt>" line.
const askRecap = async ($: EngineInterface, apiKey: string | null, messages: SessionMessage[]) => {
  const reasons: string[] = []
  let primary = await askOnce($, apiKey, RECAP_MODEL, messages, RECAP_INPUT_BUDGET)
  if (!primary.ok && isTooLarge(primary.status, primary.text)) primary = await askOnce($, apiKey, RECAP_MODEL, messages, RECAP_INPUT_BUDGET / 2)
  const fromPrimary = fieldsOf(primary, reasons)
  if (fromPrimary !== null) return { fields: fromPrimary, model: RECAP_MODEL, reasons }
  const fallback = await askOnce($, apiKey, RECAP_FALLBACK_MODEL, messages, RECAP_INPUT_BUDGET)
  const fromFallback = fieldsOf(fallback, reasons)
  return fromFallback !== null ? { fields: fromFallback, model: RECAP_FALLBACK_MODEL, reasons } : { fields: null, model: null, reasons }
}

type Runner = { pending: Timer | null; lastRunAt: number | null; lastFingerprint: string; running: boolean }

const recapNow = async ($: EngineInterface, runner: Runner, onWrite: (record: RecapRecord) => void) => {
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
    const answer = await askRecap($, await apiKeyOf($, home), messages)
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

export function registerRecap(on: On, onWrite: (record: RecapRecord) => void) {
  const runner: Runner = { pending: null, lastRunAt: null, lastFingerprint: '', running: false }

  const cancel = () => {
    runner.pending?.cancel()
    runner.pending = null
  }

  on('turn.start', ($, e, next) => {
    cancel()
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    cancel()
    runner.pending = $.clock.after(delayFor(await $.clock.now(), runner.lastRunAt), () => {
      runner.pending = null
      void recapNow($, runner, onWrite)
    })
    return result
  })
}
