import test from 'node:test'
import assert from 'node:assert/strict'
import { createAssistRoute, createCaps } from '../../nuxt/server/assist/index.js'
import { compactCatalogue } from '../../nuxt/server/assist/catalogue.js'
import { CATALOGUE } from './catalogue.fixture.mjs'

// Drupal, as the catalogue reads it: products with their variations included.
const drupalBody = (lines) => ({
  data: lines.map((l) => ({
    type: 'product--physical',
    id: `p-${l.sku}`,
    attributes: { title: l.product },
    relationships: {
      variations: { data: [{ type: 'product-variation--physical', id: `v-${l.sku}` }] },
      product_collections: {
        data: [{ type: 'taxonomy_term--product_collections', id: `c-${l.category}` }],
      },
    },
  })),
  included: [
    ...lines.map((l) => ({
      type: 'product-variation--physical',
      id: `v-${l.sku}`,
      attributes: { sku: l.sku, title: l.title, price: { number: String(l.price) } },
    })),
    ...[...new Set(lines.map((l) => l.category))].map((c) => ({
      type: 'taxonomy_term--product_collections',
      id: `c-${c}`,
      attributes: { name: c },
    })),
  ],
})

const fetchFor =
  (modelText) =>
  async (url, init = {}) => {
    const u = String(url)
    if (u.includes('/jsonapi/products/physical'))
      return { ok: true, status: 200, json: async () => drupalBody(CATALOGUE) }
    if (u.includes('/jsonapi/products/media'))
      return { ok: true, status: 200, json: async () => ({ data: [], included: [] }) }
    if (u.includes('anthropic')) {
      if (typeof modelText === 'function') return modelText(init)
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: modelText }] }),
      }
    }
    throw new Error('unexpected ' + u)
  }

const request = (body, { method = 'POST', address = '1.1.1.1', forwarded = address } = {}) => ({
  method,
  headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
  socket: { remoteAddress: address },
  on(event, fn) {
    if (event === 'data') fn(JSON.stringify(body))
    if (event === 'end') fn()
  },
})
const response = () => {
  const res = { statusCode: 200, headers: {}, body: '' }
  res.setHeader = (k, v) => (res.headers[k.toLowerCase()] = v)
  res.end = (b = '') => (res.body += b)
  res.json = () => JSON.parse(res.body)
  return res
}
const call = async (route, body, opts) => {
  const res = response()
  await route(request(body, opts), res)
  return res
}

test('without a key the matcher answers, with no-store', async () => {
  const route = createAssistRoute({
    drupalUrl: 'http://drupal',
    apiKey: '',
    fetch: fetchFor(''),
    log: () => {},
  })
  const res = await call(route, { message: 'a gift under $40' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['cache-control'], 'no-store')
  const body = res.json()
  assert.equal(body.source, 'scripted')
  assert.equal(body.bucket, 'gift')
  assert.deepEqual(
    body.picks.map((p) => p.sku),
    ['3plantpots', 'candle4', 'UT-KnitHat-Green']
  )
  assert.equal(body.chips.length, 5)
})

test('with a key the model answers, invented SKUs dropped, and only invented ones means the matcher', async () => {
  const good = createAssistRoute({
    drupalUrl: 'http://drupal',
    apiKey: 'k',
    fetch: fetchFor(
      '{"note":"Two.","picks":[{"sku":"NOT-A-SKU","why":"no"},{"sku":"candle4","why":"a candle"}]}'
    ),
    log: () => {},
  })
  const body = (await call(good, { message: 'anything' })).json()
  assert.equal(body.source, 'model')
  assert.deepEqual(body.picks, [{ sku: 'candle4', why: 'a candle' }])
  const bad = createAssistRoute({
    drupalUrl: 'http://drupal',
    apiKey: 'k',
    fetch: fetchFor('{"note":"x","picks":[{"sku":"NOT-A-SKU"}]}'),
    log: () => {},
  })
  assert.equal((await call(bad, { message: 'something warm' })).json().source, 'scripted')
})

test('the eleventh request in a minute from one address is scripted, and a long message is cut', async () => {
  let seen = ''
  const fetch = fetchFor((init) => {
    seen = JSON.parse(init.body).messages[0].content
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: '{"note":"ok","picks":[{"sku":"whtsh","why":"soft"}]}' }],
      }),
    }
  })
  let t = 1000
  const route = createAssistRoute({
    drupalUrl: 'http://drupal',
    apiKey: 'k',
    fetch,
    now: () => t,
    log: () => {},
  })
  for (let i = 0; i < 10; i++)
    assert.equal((await call(route, { message: 'x'.repeat(600) })).json().source, 'model')
  assert.ok(seen.includes(`"${'x'.repeat(500)}"`))
  assert.ok(!seen.includes('x'.repeat(501)))
  assert.equal((await call(route, { message: 'x' })).json().source, 'scripted')
  assert.equal((await call(route, { message: 'x' }, { address: '2.2.2.2' })).json().source, 'model')
  t += 61000
  assert.equal((await call(route, { message: 'x' })).json().source, 'model')
})

test('the address a request is counted by is the one the router saw, not one the client wrote', async () => {
  const fetch = fetchFor('{"note":"ok","picks":[{"sku":"whtsh","why":"soft"}]}')
  const route = createAssistRoute({
    drupalUrl: 'http://drupal',
    apiKey: 'k',
    fetch,
    now: () => 1000,
    limits: { perMinute: 1 },
    log: () => {},
  })
  const router = '10.0.0.9'
  const ask = (forwarded) => call(route, { message: 'x' }, { address: router, forwarded })
  assert.equal((await ask('9.9.9.1, 3.3.3.3')).json().source, 'model')
  assert.equal((await ask('9.9.9.2, 3.3.3.3')).json().source, 'scripted')
  assert.equal((await ask('4.4.4.4')).json().source, 'model')
  // With no proxy in front, the socket's own address.
  const direct = createAssistRoute({
    drupalUrl: 'http://drupal',
    apiKey: 'k',
    fetch,
    now: () => 1000,
    limits: { perMinute: 1 },
    log: () => {},
  })
  assert.equal(
    (await call(direct, { message: 'x' }, { address: '5.5.5.5', forwarded: '' })).json().source,
    'model'
  )
  assert.equal(
    (await call(direct, { message: 'x' }, { address: '5.5.5.5', forwarded: '' })).json().source,
    'scripted'
  )
})

test('a conversation has twelve model turns and a day has its cap; a GET is refused', async () => {
  let t = 0
  const caps = createCaps({ perMinute: 100, perConversation: 2, perDay: 3, now: () => t })
  assert.equal(caps.allow('a', 'c1'), true)
  assert.equal(caps.allow('a', 'c1'), true)
  assert.equal(caps.allow('a', 'c1'), false)
  assert.equal(caps.allow('b', 'c2'), true)
  assert.equal(caps.allow('b', 'c3'), false)
  t = 86400000 * 2
  assert.equal(caps.allow('b', 'c3'), true)
  const route = createAssistRoute({
    drupalUrl: 'http://drupal',
    apiKey: '',
    fetch: fetchFor(''),
    log: () => {},
  })
  assert.equal((await call(route, {}, { method: 'GET' })).statusCode, 405)
})

test('the catalogue follows every page drupal gives it', async () => {
  const half = Math.ceil(CATALOGUE.length / 2)
  const seen = []
  const fetch = async (url) => {
    const u = String(url)
    seen.push(u)
    if (u.startsWith('http://drupal/page-2'))
      return { ok: true, status: 200, json: async () => drupalBody(CATALOGUE.slice(half)) }
    if (u.includes('/jsonapi/products/physical'))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ...drupalBody(CATALOGUE.slice(0, half)),
          links: { next: { href: 'http://drupal/page-2' } },
        }),
      }
    return { ok: true, status: 200, json: async () => ({ data: [], included: [] }) }
  }
  const lines = await compactCatalogue('http://drupal', { fetch })
  assert.equal(lines.length, CATALOGUE.length)
  assert.equal(seen.length, 3)
})

test('a body of null gets the scripted default answer', async () => {
  const route = createAssistRoute({
    drupalUrl: 'http://drupal',
    apiKey: '',
    fetch: fetchFor(''),
    log: () => {},
  })
  const res = await call(route, null)
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().bucket, 'default')
})
