import test from 'node:test'
import assert from 'node:assert/strict'
import { askIntent, intentConfigured, PERSON_FLOOR } from '../../nuxt/server/assist/intent.js'
import { BUCKETS } from '../../nuxt/server/assist/matcher.js'

const answering =
  (want, seen = []) =>
  async (url, init) => {
    seen.push({ url: String(url), init })
    return { ok: true, status: 200, json: async () => ({ model: 'laya', answers: { want } }) }
  }

test('asks the systemone endpoint one choice of every bucket and a person, the catch-all last', async () => {
  const seen = []
  const out = await askIntent({
    message: 'my ears are cold',
    baseUrl: 'http://laya:8000/',
    apiKey: 'k',
    model: 'typed-decisions',
    fetch: answering({ type: 'choice', choice: 'warm', confidence: 0.8 }, seen),
  })
  assert.deepEqual(out, { bucket: 'warm', confidence: 0.8 })
  assert.equal(seen[0].url, 'http://laya:8000/v1/systemone')
  assert.equal(seen[0].init.headers.authorization, 'Bearer k')
  const body = JSON.parse(seen[0].init.body)
  assert.equal(body.model, 'typed-decisions')
  assert.equal(body.state, 'my ears are cold')
  const keys = Object.keys(body.questions.want.criteria)
  assert.equal(body.questions.want.type, 'choice')
  assert.deepEqual(keys.slice(-2), ['person', 'default'])
  assert.equal(keys.length, BUCKETS.length + 1)
  for (const b of BUCKETS) assert.ok(b.means, `${b.key} has no meaning`)
})

test('without a key it sends no authorization, for a laya on a private network', async () => {
  const seen = []
  await askIntent({
    message: 'x',
    baseUrl: 'http://laya:8000',
    apiKey: '',
    fetch: answering({ choice: 'read', confidence: 0.5 }, seen),
  })
  assert.equal(seen[0].init.headers.authorization, undefined)
})

test('an unknown choice, a refusal, a throw and a timeout are all no answer', async () => {
  const base = { message: 'x', baseUrl: 'http://laya', apiKey: 'k' }
  assert.equal(
    await askIntent({ ...base, fetch: answering({ choice: 'yachts', confidence: 1 }) }),
    null
  )
  assert.equal(await askIntent({ ...base, fetch: async () => ({ ok: false, status: 503 }) }), null)
  assert.equal(
    await askIntent({
      ...base,
      fetch: async () => {
        throw new Error('ECONNREFUSED')
      },
    }),
    null
  )
  const hang = (url, init) =>
    new Promise((resolve, reject) =>
      init.signal.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      )
    )
  const logged = []
  assert.equal(
    await askIntent({ ...base, fetch: hang, timeoutMs: 10, log: (m) => logged.push(m) }),
    null
  )
  assert.deepEqual(logged, ['intent: timed out'])
})

test('a person needs the floor; a bucket does not', async () => {
  const base = { message: 'x', baseUrl: 'http://laya', apiKey: 'k' }
  const below = PERSON_FLOOR - 0.01
  assert.equal(
    await askIntent({ ...base, fetch: answering({ choice: 'person', confidence: below }) }),
    null
  )
  assert.deepEqual(
    await askIntent({ ...base, fetch: answering({ choice: 'person', confidence: PERSON_FLOOR }) }),
    {
      bucket: 'person',
      confidence: PERSON_FLOOR,
    }
  )
  assert.deepEqual(
    await askIntent({ ...base, fetch: answering({ choice: 'gift', confidence: below }) }),
    {
      bucket: 'gift',
      confidence: below,
    }
  )
})

test('a key or a base url turns it on', () => {
  assert.equal(intentConfigured({}), false)
  assert.equal(intentConfigured({ TYPESAFE_API_KEY: 'k' }), true)
  assert.equal(intentConfigured({ TYPESAFE_BASE_URL: 'http://laya:8000' }), true)
})
