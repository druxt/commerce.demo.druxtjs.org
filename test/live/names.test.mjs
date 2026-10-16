import test from 'node:test'
import assert from 'node:assert/strict'
import { nameFor, ADJECTIVES, NOUNS } from '../../nuxt/server/live/names.js'

test('a guest gets a shop name, the same one for the same id', () => {
  const a = nameFor(null, { id: 'abc123' })
  assert.equal(a, nameFor(null, { id: 'abc123' }))
  const [adjective, noun] = a.split(' ')
  assert.ok(ADJECTIVES.includes(adjective))
  assert.ok(NOUNS.includes(noun))
  assert.notEqual(a, nameFor(null, { id: 'abc124' }))
})

test('a signed-in account keeps its own name', () => {
  assert.equal(nameFor({ preferred_username: 'operator' }, { id: 'x' }), 'operator')
  assert.equal(nameFor({ name: 'Sam' }, { id: 'x' }), 'Sam')
})

test('nothing in the pool reads as food', () => {
  const food =
    /saffron|nutmeg|ginger|basil|sumac|clove|cinnamon|pepper|mint|sage|thyme|curry|tangy|smoky|crispy|toasted|roasted|zesty/i
  for (const word of [...ADJECTIVES, ...NOUNS]) assert.ok(!food.test(word), word)
})
