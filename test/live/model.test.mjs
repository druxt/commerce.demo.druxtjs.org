import test from 'node:test'
import assert from 'node:assert/strict'
import { askModel, parseAnswer, validate, prompt } from '../../nuxt/server/assist/model.js'
import { CATALOGUE } from './catalogue.fixture.mjs'

const answerBody = (text) => ({
  ok: true,
  status: 200,
  json: async () => ({ content: [{ type: 'text', text }] }),
})

test('parseAnswer reads plain and fenced JSON and refuses prose', () => {
  assert.deepEqual(parseAnswer('{"note":"a","picks":[]}'), { note: 'a', picks: [] })
  assert.deepEqual(parseAnswer('Sure:\n```json\n{"note":"b","picks":[]}\n```'), {
    note: 'b',
    picks: [],
  })
  assert.deepEqual(parseAnswer('Here you go {"note":"c","picks":[]} thanks'), {
    note: 'c',
    picks: [],
  })
  assert.equal(parseAnswer('I would suggest the flamingo.'), null)
  assert.equal(parseAnswer(''), null)
})

test('validate bounds the note and the reasons, drops unknown SKUs and duplicates, keeps four', () => {
  const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ')
  const out = validate(
    {
      note: long,
      picks: [
        { sku: 'NOT-A-SKU', why: 'no' },
        { sku: 'candle4', why: long },
        { sku: 'candle4', why: 'again' },
        { sku: '3plantpots', why: 'pots' },
        { sku: 'whtsh', why: 'soft' },
        { sku: 'blkchr', why: 'chair' },
        { sku: 'whttbl', why: 'desk' },
      ],
    },
    CATALOGUE
  )
  assert.equal(out.note.split(' ').length, 18)
  assert.deepEqual(
    out.picks.map((p) => p.sku),
    ['candle4', '3plantpots', 'whtsh', 'blkchr']
  )
  assert.equal(out.picks[0].why.split(' ').length, 10)
  assert.equal(validate({ note: 'x', picks: [{ sku: 'NOT-A-SKU' }] }, CATALOGUE), null)
  assert.equal(validate(null, CATALOGUE), null)
})

test('askModel does nothing without a key', async () => {
  let called = false
  const out = await askModel({
    message: 'x',
    catalogue: CATALOGUE,
    apiKey: '',
    fetch: async () => {
      called = true
    },
  })
  assert.equal(out, null)
  assert.equal(called, false)
})

test('askModel sends the key, the model and the catalogue, and validates the answer', async () => {
  let sent
  const fetch = async (url, init) => {
    sent = { url: String(url), init }
    return answerBody(
      '{"note":"Warm things.","picks":[{"sku":"UT-KnitHat-Green","why":"warm"},{"sku":"FAKE","why":"no"}]}'
    )
  }
  const out = await askModel({
    message: 'something warm',
    catalogue: CATALOGUE,
    apiKey: 'k',
    model: 'm',
    fetch,
  })
  assert.deepEqual(out, { note: 'Warm things.', picks: [{ sku: 'UT-KnitHat-Green', why: 'warm' }] })
  assert.equal(sent.init.headers['x-api-key'], 'k')
  const body = JSON.parse(sent.init.body)
  assert.equal(body.model, 'm')
  assert.equal(
    body.messages[0].content.split('\n').filter((l) => l.startsWith('{"sku"')).length,
    CATALOGUE.length
  )
  assert.ok(body.messages[0].content.includes('"something warm"'))
})

test('askModel gives null on a failed call, a bad status, prose, and a timeout', async () => {
  const base = { message: 'x', catalogue: CATALOGUE, apiKey: 'k' }
  assert.equal(
    await askModel({
      ...base,
      fetch: async () => {
        throw new Error('down')
      },
    }),
    null
  )
  assert.equal(await askModel({ ...base, fetch: async () => ({ ok: false, status: 529 }) }), null)
  assert.equal(
    await askModel({ ...base, fetch: async () => answerBody('Try the flamingo.') }),
    null
  )
  const never = (url, init) =>
    new Promise((resolve, reject) =>
      init.signal.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      )
    )
  assert.equal(await askModel({ ...base, fetch: never, timeoutMs: 10 }), null)
})

test('the prompt carries one line per variation and the shape', () => {
  const text = prompt('hi', CATALOGUE.slice(0, 2))
  assert.ok(text.includes('{"sku":"level-headphones"'))
  assert.ok(text.includes('"picks":[{"sku":"SKU","why":"under 10 words"}]'))
})
