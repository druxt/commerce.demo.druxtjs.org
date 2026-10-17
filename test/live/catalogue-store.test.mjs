import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

// The script tests run with nothing installed, so the store's query builder is
// a stand-in here: every method hands the same object back, as the real one does.
const params =
  'export class DrupalJsonApiParams { addFields() { return this } addInclude() { return this } addPageLimit() { return this } addPageOffset() { return this } }'
register(
  'data:text/javascript,' +
    encodeURIComponent(
      `export const resolve = (specifier, context, next) => specifier === 'drupal-jsonapi-params' ? { url: 'data:text/javascript,${encodeURIComponent(params)}', shortCircuit: true } : next(specifier, context)`
    )
)

// A fresh copy of the store for each test: it keeps its request in flight in
// the module.
let copies = 0
const freshStore = () => import(`../../nuxt/store/catalogue.js?copy=${copies++}`)

// A store whose catalogue reads wait until the test answers them. Each read
// asks for three collections, the two product types and the terms.
const harness = (store) => {
  const state = store.state()
  const reads = []
  const dispatch = (type, payload) => {
    if (type === 'druxt/getCollection') {
      const read = Math.floor(reads.flat().length / 3)
      return new Promise((resolve) => {
        reads[read] = reads[read] || []
        reads[read].push({ payload, resolve })
      })
    }
    return store.actions[type.split('/').pop()](context, payload)
  }
  const commit = (type, payload) => store.mutations[type](state, payload)
  const context = { state, commit, dispatch }
  const settle = () => new Promise((resolve) => setImmediate(resolve))
  // Answer one read with one product titled after the read.
  const answer = async (read, title) => {
    await settle()
    for (const { payload, resolve } of reads[read]) {
      const products = payload.type.startsWith('product--physical')
        ? [{ id: title, type: payload.type, attributes: { title } }]
        : []
      resolve({ data: products, links: {} })
    }
    await settle()
  }
  return { state, dispatch, reads, answer, settle }
}

test('an older read answering last does not replace the newer catalogue', async () => {
  const { state, dispatch, answer } = harness(await freshStore())
  const load = dispatch('catalogue/load')
  const reload = dispatch('catalogue/reload')
  await answer(1, 'new')
  await reload
  await answer(0, 'old')
  await load
  assert.deepEqual(
    state.items.map((i) => i.title),
    ['new']
  )
  assert.equal(state.loaded, true)
})

test('a failed reload keeps the items on screen, and the next load reads again', async () => {
  const { state, dispatch, reads, answer, settle } = harness(await freshStore())
  const load = dispatch('catalogue/load')
  await answer(0, 'first')
  await load
  const reload = dispatch('catalogue/reload')
  await settle()
  reads[1][0].resolve(Promise.reject(new Error('Drupal is down')))
  await assert.rejects(reload, /Drupal is down/)
  assert.deepEqual(
    state.items.map((i) => i.title),
    ['first']
  )
  const again = dispatch('catalogue/load')
  await answer(2, 'second')
  await again
  assert.deepEqual(
    state.items.map((i) => i.title),
    ['second']
  )
})

test('a burst of reloads reads the catalogue once more, not once each', async () => {
  const { state, dispatch, reads, answer } = harness(await freshStore())
  const burst = [
    dispatch('catalogue/reload'),
    dispatch('catalogue/reload'),
    dispatch('catalogue/reload'),
  ]
  await answer(0, 'during')
  for (let read = 1; read < reads.length; read++) await answer(read, 'after')
  await Promise.all(burst)
  assert.equal(reads.length, 2)
  assert.deepEqual(
    state.items.map((i) => i.title),
    ['after']
  )
})
