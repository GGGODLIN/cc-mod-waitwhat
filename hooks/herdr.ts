export const splitArgs = (cwd: string | null) => [
  'herdr',
  'pane',
  'split',
  '--current',
  '--direction',
  'right',
  '--no-focus',
  ...(cwd === null ? [] : ['--cwd', cwd]),
]

export const runArgs = (pane: string, command: string) => ['herdr', 'pane', 'run', pane, command]

export const listArgs = (workspace: string) => ['herdr', 'pane', 'list', '--workspace', workspace]

const envelope = (stdout: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    return parsed.error === undefined && parsed.result !== undefined ? parsed : null
  } catch {
    return null
  }
}

export const paneFromSplit = (stdout: string): string | null => {
  const parsed = envelope(stdout)
  if (parsed === null) return null
  const pane = (parsed.result as { pane?: { pane_id?: unknown } } | undefined)?.pane
  return typeof pane?.pane_id === 'string' && pane.pane_id.length > 0 ? pane.pane_id : null
}

export const paneIsAlive = (stdout: string, pane: string): boolean => {
  const parsed = envelope(stdout)
  if (parsed === null) return false
  const panes = (parsed.result as { panes?: unknown } | undefined)?.panes
  if (!Array.isArray(panes)) return false
  return panes.some((entry) => (entry as { pane_id?: unknown }).pane_id === pane)
}
