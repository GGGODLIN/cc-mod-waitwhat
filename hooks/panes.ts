const COMMANDS = { plain: 'ww 1', lost: 'ww' } as const

export type PaneMode = keyof typeof COMMANDS

export type PaneTarget = { host: 'herdr'; workspace: string; cwd: string | null }

export const routeFor = (env: Readonly<Record<string, string | undefined>>): PaneTarget | { host: 'inline' } => {
  const workspace = env.HERDR_WORKSPACE_ID
  return workspace && env.HERDR_PANE_ID
    ? { host: 'herdr', workspace, cwd: env.PWD ? env.PWD : null }
    : { host: 'inline' }
}

export const commandFor = (mode: PaneMode): string => COMMANDS[mode]
