export const HANDLE_VAR = 'ORCA_TERMINAL_HANDLE'

const COMMANDS = { plain: 'ww 1', lost: 'ww' } as const

export type PaneMode = keyof typeof COMMANDS

export const commandFor = (mode: PaneMode) => COMMANDS[mode]

export const splitArgs = (handle: string, command: string) =>
  ['orca', 'terminal', 'split', '--terminal', handle, '--direction', 'vertical', '--command', command, '--json']

export const sendArgs = (handle: string, command: string) =>
  ['orca', 'terminal', 'send', '--terminal', handle, '--text', command, '--enter', '--json']

export const listArgs = () => ['orca', 'terminal', 'list', '--json']

const envelope = (stdout: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    return parsed.ok === true ? parsed : null
  } catch {
    return null
  }
}

export const handleFromSplit = (stdout: string): string | null => {
  const parsed = envelope(stdout)
  if (parsed === null) return null
  const split = (parsed.result as { split?: { handle?: unknown } } | undefined)?.split
  return typeof split?.handle === 'string' && split.handle.length > 0 ? split.handle : null
}

export const paneIsAlive = (stdout: string, handle: string): boolean => {
  const parsed = envelope(stdout)
  if (parsed === null) return false
  const terminals = (parsed.result as { terminals?: unknown } | undefined)?.terminals
  if (!Array.isArray(terminals)) return false
  return terminals.some((entry) => {
    const pane = entry as { handle?: unknown; orphaned?: unknown }
    return pane.handle === handle && pane.orphaned !== true
  })
}
