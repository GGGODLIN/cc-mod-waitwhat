const COMMANDS = { plain: 'ww 1', lost: 'ww' } as const

export type PaneMode = keyof typeof COMMANDS

export type PaneTarget =
  | { host: 'orca'; handle: string }
  | { host: 'herdr'; workspace: string; cwd: string | null }

export type PaneChoice = {
  host: 'choice'
  orca: Extract<PaneTarget, { host: 'orca' }>
  herdr: Extract<PaneTarget, { host: 'herdr' }>
}

export const routeFor = (env: Readonly<Record<string, string | undefined>>): PaneTarget | PaneChoice | { host: 'inline' } => {
  const handle = env.ORCA_TERMINAL_HANDLE
  const workspace = env.HERDR_WORKSPACE_ID
  const orca: PaneChoice['orca'] | null = handle && env.ORCA_PANE_KEY && env.ORCA_WORKTREE_ID
    ? { host: 'orca', handle } : null
  const herdr: PaneChoice['herdr'] | null = workspace && env.HERDR_PANE_ID
    ? { host: 'herdr', workspace, cwd: env.PWD ? env.PWD : null } : null
  if (orca !== null && herdr !== null) return { host: 'choice', orca, herdr }
  return orca ?? herdr ?? { host: 'inline' }
}

export const commandFor = (mode: PaneMode, host?: PaneTarget['host']) => {
  // The pane shell may inherit Herdr; isolate ww, not the shell or the Orca CLI.
  const prefix = host === 'orca'
    ? 'env -u HERDR_ENV -u HERDR_PANE_ID -u HERDR_WORKSPACE_ID -u HERDR_TAB_ID -u HERDR_SOCKET_PATH -u HERDR_BIN_PATH '
    : ''
  return `${prefix}${COMMANDS[mode]}`
}
