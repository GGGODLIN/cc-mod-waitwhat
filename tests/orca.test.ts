import { describe, expect, test } from 'bun:test'
import { commandFor, handleFromSplit, listArgs, paneIsAlive, sendArgs, splitArgs } from '../hooks/orca.ts'

const splitReply = JSON.stringify({ ok: true, result: { split: { handle: 'term_new', tabId: 'tab-1' } } })
const listReply = JSON.stringify({
  ok: true,
  result: { terminals: [{ handle: 'term_live', orphaned: false }, { handle: 'term_gone', orphaned: true }] },
})

describe('pane commands', () => {
  test('白話 retells one turn and 跟丟了 retells everything', () => {
    expect(commandFor('plain')).toBe('ww 1')
    expect(commandFor('lost')).toBe('ww')
  })

  test('the split carries the command and asks for json', () => {
    expect(splitArgs('term_self', 'ww 1')).toEqual(
      ['orca', 'terminal', 'split', '--terminal', 'term_self', '--direction', 'vertical', '--command', 'ww 1', '--json'])
  })

  test('reuse types the command into the pane and presses enter', () => {
    expect(sendArgs('term_pane', 'ww')).toEqual(
      ['orca', 'terminal', 'send', '--terminal', 'term_pane', '--text', 'ww', '--enter', '--json'])
  })

  test('the listing needs no arguments beyond json', () => {
    expect(listArgs()).toEqual(['orca', 'terminal', 'list', '--json'])
  })
})

describe('reading orca replies', () => {
  test('a successful split hands back the new handle', () => {
    expect(handleFromSplit(splitReply)).toBe('term_new')
  })

  test('a refused split hands back nothing', () => {
    expect(handleFromSplit(JSON.stringify({ ok: false, error: { code: 'invalid_argument' } }))).toBeNull()
  })

  test('output that is not json hands back nothing', () => {
    expect(handleFromSplit('orca: command not found')).toBeNull()
  })

  test('a listed pane counts as alive', () => {
    expect(paneIsAlive(listReply, 'term_live')).toBe(true)
  })

  test('an orphaned pane does not count as alive', () => {
    expect(paneIsAlive(listReply, 'term_gone')).toBe(false)
  })

  test('a pane that is no longer listed does not count as alive', () => {
    expect(paneIsAlive(listReply, 'term_closed')).toBe(false)
  })

  test('a broken listing does not count anything as alive', () => {
    expect(paneIsAlive('', 'term_live')).toBe(false)
  })
})
