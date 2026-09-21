const COMMANDS = { plain: 'ww 1', lost: 'ww' } as const

export type PaneMode = keyof typeof COMMANDS

export const commandFor = (mode: PaneMode) => COMMANDS[mode]
