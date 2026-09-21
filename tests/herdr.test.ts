import { describe, expect, test } from 'bun:test'
import { listArgs, paneFromSplit, paneIsAlive, runArgs, splitArgs } from '../hooks/herdr.ts'

const splitReply = JSON.stringify({ id: 'cli:pane:split', result: { pane: { pane_id: 'w4:pPM' }, type: 'pane_info' } })
const listReply = JSON.stringify({
  id: 'cli:pane:list',
  result: { panes: [{ pane_id: 'w4:pPM' }, { pane_id: 'w4:pPJ' }], type: 'pane_list' },
})

describe('pane commands', () => {
  test('the split goes right, keeps focus home, and carries the cwd', () => {
    expect(splitArgs('/repo')).toEqual(
      ['herdr', 'pane', 'split', '--current', '--direction', 'right', '--no-focus', '--cwd', '/repo'])
  })

  test('an unknown cwd is left out instead of passed empty', () => {
    expect(splitArgs(null)).toEqual(['herdr', 'pane', 'split', '--current', '--direction', 'right', '--no-focus'])
  })

  test('running types the command into the pane and presses enter', () => {
    expect(runArgs('w4:pPM', 'ww 1')).toEqual(['herdr', 'pane', 'run', 'w4:pPM', 'ww 1'])
  })

  test('the listing is scoped to one workspace', () => {
    expect(listArgs('w4')).toEqual(['herdr', 'pane', 'list', '--workspace', 'w4'])
  })
})

describe('reading herdr replies', () => {
  test('a successful split hands back the new pane id', () => {
    expect(paneFromSplit(splitReply)).toBe('w4:pPM')
  })

  test('a refused split hands back nothing', () => {
    expect(paneFromSplit(JSON.stringify({ error: { code: 'pane_not_found' }, id: 'cli:pane:split' }))).toBeNull()
  })

  test('output that is not json hands back nothing', () => {
    expect(paneFromSplit('herdr: command not found')).toBeNull()
  })

  test('a listed pane counts as alive', () => {
    expect(paneIsAlive(listReply, 'w4:pPM')).toBe(true)
  })

  test('a pane that is no longer listed does not count as alive', () => {
    expect(paneIsAlive(listReply, 'w4:pGONE')).toBe(false)
  })

  test('an error envelope does not count anything as alive', () => {
    expect(paneIsAlive(JSON.stringify({ error: { code: 'workspace_not_found' } }), 'w4:pPM')).toBe(false)
  })

  test('a broken listing does not count anything as alive', () => {
    expect(paneIsAlive('', 'w4:pPM')).toBe(false)
  })
})
