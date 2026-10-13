import test from 'node:test'
import assert from 'node:assert/strict'
import { roomCode, isCode, CODE_CHARS } from '../../nuxt/server/live/code.js'

test('a room code is six allowed characters and not one taken', () => {
  const code = roomCode(new Set())
  assert.equal(code.length, 6)
  for (const c of code) assert.ok(CODE_CHARS.includes(c))
  assert.ok(isCode(code))
  // A fixed source gives the same code, so a taken one forces another.
  let n = 0
  // A period that does not divide six, so the second attempt differs.
  const rand = () => ((n++ % 5) + 0.5) / CODE_CHARS.length
  const first = roomCode(new Set(), rand)
  n = 0
  assert.notEqual(roomCode(new Set([first]), rand), first)
})

test('isCode refuses the wrong shape', () => {
  assert.equal(isCode('ABCDE'), false)
  assert.equal(isCode('ABCDE1'), false)
  assert.equal(isCode(123456), false)
  assert.equal(isCode('abcdef'), false)
})

test('a source that never frees a code gives up', () => {
  const taken = new Set([roomCode(new Set(), () => 0)])
  assert.throws(() => roomCode(taken, () => 0), /No free room code/)
})
