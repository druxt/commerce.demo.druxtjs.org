// cspell:ignore ABCDEFGHJKLMNPQRSTUVWXYZ
/** Room codes: six characters, with nothing that reads as another. */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const LENGTH = 6

/**
 * A room code free in `taken`.
 *
 * @param {Set<string>} taken - Codes in use.
 * @param {Function} [rand] - A random source in [0, 1).
 * @returns {string} The code.
 */
function roomCode(taken, rand = Math.random) {
  for (let i = 0; i < 1000; i++) {
    let code = ''
    for (let j = 0; j < LENGTH; j++)
      code += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]
    if (!taken.has(code)) return code
  }
  throw new Error('No free room code')
}

/** Whether a string is shaped like a code: the right characters and length. */
const isCode = (value) =>
  typeof value === 'string' &&
  value.length === LENGTH &&
  [...value].every((c) => CODE_CHARS.includes(c))

module.exports = { roomCode, isCode, CODE_CHARS }
