export const CACHE_FILE = '.cache/cc-sidecar-waitwhat.json'
export const CACHE_LIMIT = 200

export type CacheEntry = { answer: string; label: string; source: string; at: number }
export type CacheMap = Record<string, CacheEntry>
export type CacheMode = 'plain' | 'lost'
export interface CacheMessage { role: 'user' | 'assistant'; text: string }

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')

const normalizeText = (text: string) =>
  text.replace(/\r\n?/g, '\n').replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '')

export const sharedKeyFor = async (
  mode: CacheMode,
  messages: ReadonlyArray<CacheMessage>
): Promise<string> => {
  const normalized = messages
    .map(({ role, text }) => [role, normalizeText(text)] as const)
    .filter(([, text]) => text.length > 0)
  const payload = JSON.stringify([mode, normalized])
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload)))
}

export const parseCache = (text: string): CacheMap => {
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as CacheMap) : {}
  } catch {
    return {}
  }
}

export const lookup = (entries: CacheMap, key: string) => {
  const entry = entries[key]
  return entry !== undefined && typeof entry.answer === 'string' && entry.answer.length > 0 ? entry : null
}

export const withEntry = (entries: CacheMap, key: string, entry: CacheEntry): CacheMap => {
  const merged = { ...entries, [key]: entry }
  if (Object.keys(merged).length <= CACHE_LIMIT) return merged
  const kept = Object.entries(merged)
    .sort(([, a], [, b]) => (a.at ?? 0) - (b.at ?? 0))
    .slice(-CACHE_LIMIT)
  return Object.fromEntries(kept)
}
