export const DEFAULT_PROXY = 'http://127.0.0.1:8317/v1/chat/completions'
export const DEFAULT_HTTP_MODEL = 'gemini-3.8-flash-high'
export const DEFAULT_FALLBACK_MODEL = 'haiku'
export const SOURCES = ['auto', 'cmd', 'http'] as const

export type Source = (typeof SOURCES)[number]

export const sourceOf = (value: string | undefined): Source =>
  SOURCES.includes(value as Source) ? (value as Source) : 'auto'

export const splitArgv = (command: string) => {
  const argv: string[] = []
  let current = ''
  let quote: string | null = null
  let pending = false
  for (const ch of command) {
    if (quote !== null) {
      if (ch === quote) quote = null
      else current += ch
      pending = true
    } else if (ch === '"' || ch === "'") {
      quote = ch
      pending = true
    } else if (/\s/.test(ch)) {
      if (pending) argv.push(current)
      current = ''
      pending = false
    } else {
      current += ch
      pending = true
    }
  }
  if (pending) argv.push(current)
  return argv
}

export const cmdStdin = (system: string, payload: string) => `${system}\n\n---\n\n${payload}`

export const firstApiKey = (yaml: string) => {
  let inside = false
  for (const line of yaml.split('\n')) {
    if (/^api-keys:\s*$/.test(line)) {
      inside = true
      continue
    }
    if (!inside) continue
    const entry = /^\s*-\s*"?([^"\s]+)"?\s*$/.exec(line)
    if (entry !== null) return entry[1] ?? null
    if (line.trim().length > 0 && !line.startsWith(' ')) break
  }
  return null
}

export const httpBody = (model: string, system: string, payload: string) =>
  JSON.stringify({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: payload },
    ],
    temperature: 0.3,
  })

export const httpHeaders = (apiKey: string | null) => ({
  'Content-Type': 'application/json',
  ...(apiKey !== null ? { Authorization: `Bearer ${apiKey}` } : {}),
})

export const httpReplyText = (text: string) => {
  const parsed = JSON.parse(text) as { choices?: { message?: { content?: unknown } }[] }
  const content = parsed.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim().length === 0) throw new Error('回應裡沒有 choices[0].message.content')
  return content.trim()
}

export const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)
