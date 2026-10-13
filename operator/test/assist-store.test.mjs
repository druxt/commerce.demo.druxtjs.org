import test from 'node:test'
import assert from 'node:assert/strict'
import { state as initial, mutations, actions } from '../store/assist.js'

// The store as Vuex runs it: commits apply the mutations to one state.
const store = (post) => {
  const state = initial()
  const commit = (type, payload) => mutations[type](state, payload)
  const context = { $axios: { post } }
  return { state, commit, ask: (q) => actions.askConcierge.call(context, { commit, state }, q) }
}

test("the concierge's picks for one thread do not land on the next one selected", async () => {
  let answer
  const s = store(() => new Promise((resolve) => (answer = resolve)))
  s.commit('select', 'AAAAAA')
  const asked = s.ask('a hat')
  s.commit('select', 'BBBBBB')
  answer({ data: { note: 'For A', picks: [{ sku: 'HAT', why: 'warm' }] } })
  await asked
  assert.equal(s.state.picks, null)
  assert.equal(s.state.asking, false)
})

test('the picks land when the thread is still the one selected', async () => {
  const s = store(async () => ({ data: { note: 'For A', picks: [{ sku: 'HAT', why: 'warm' }] } }))
  s.commit('select', 'AAAAAA')
  await s.ask('a hat')
  assert.deepEqual(s.state.picks.picks, [{ sku: 'HAT', why: 'warm', on: true }])
})

test("an older question's answer leaves the newer one asking", async () => {
  const answers = []
  const s = store(() => new Promise((resolve) => answers.push(resolve)))
  s.commit('select', 'AAAAAA')
  const first = s.ask('a hat')
  s.commit('select', 'BBBBBB')
  const second = s.ask('a scarf')
  answers[0]({ data: { note: 'For A', picks: [{ sku: 'HAT', why: 'warm' }] } })
  await first
  assert.equal(s.state.asking, true)
  answers[1]({ data: { note: 'For B', picks: [{ sku: 'SCARF', why: 'long' }] } })
  await second
  assert.equal(s.state.asking, false)
  assert.equal(s.state.picks.note, 'For B')
})
