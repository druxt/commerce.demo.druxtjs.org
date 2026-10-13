import test from 'node:test'
import assert from 'node:assert/strict'
import { transitionsFor, label } from '../lib/transitions.js'

test('the default fulfillment workflow, as Commerce defines it', () => {
  assert.deepEqual(transitionsFor('draft'), [])
  assert.deepEqual(transitionsFor('fulfillment'), [
    { id: 'fulfill', label: 'Complete', to: 'completed' },
    { id: 'cancel', label: 'Cancel', to: 'canceled' },
  ])
  assert.deepEqual(transitionsFor('completed'), [])
  assert.deepEqual(transitionsFor('canceled'), [])
  assert.deepEqual(transitionsFor('nonsense'), [])
})

test('states have plain labels', () => {
  assert.equal(label('fulfillment'), 'Being fulfilled')
  assert.equal(label('completed'), 'Completed')
  assert.equal(label('draft'), 'Draft')
  assert.equal(label('unknown_thing'), 'unknown_thing')
})
