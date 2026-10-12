import test from 'node:test'
import assert from 'node:assert/strict'
import { accountOf, createHubClient, orderForToken } from '../../nuxt/server/live/drupal.js'

const json = (status, body) => ({
  status,
  ok: status < 400,
  json: async () => body,
})

test('the hub client fetches one token and sends it as a bearer', async () => {
  const calls = []
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    if (String(url).endsWith('/oauth/token'))
      return json(200, { access_token: 'abc', expires_in: 3600 })
    return json(200, { data: { id: '1' } })
  }
  const hub = createHubClient({
    drupalUrl: 'http://drupal',
    clientId: 'commerce_hub',
    clientSecret: 's',
    scope: 'hub',
    fetch,
  })
  await hub.get('/jsonapi/x')
  await hub.post('/jsonapi/message/demo_session', {
    data: { type: 'message--demo_session', attributes: {} },
  })
  await hub.patch('/jsonapi/orders/default/o1', { data: {} })
  assert.equal(calls.filter((c) => c.url.endsWith('/oauth/token')).length, 1)
  assert.match(calls[0].init.body, /grant_type=client_credentials/)
  assert.match(calls[0].init.body, /scope=hub/)
  assert.equal(calls[1].init.headers.Authorization, 'Bearer abc')
  assert.equal(calls[2].init.method, 'POST')
  assert.equal(calls[3].init.method, 'PATCH')
  assert.doesNotMatch(JSON.stringify(calls.map((c) => c.url)), /client_secret/)
})

test('a Drupal error becomes the first error detail', async () => {
  const fetch = async (url) =>
    String(url).endsWith('/oauth/token')
      ? json(200, { access_token: 'abc', expires_in: 3600 })
      : json(422, { errors: [{ detail: 'Nope' }] })
  const hub = createHubClient({
    drupalUrl: 'http://drupal',
    clientId: 'c',
    clientSecret: 's',
    fetch,
  })
  await assert.rejects(() => hub.get('/jsonapi/x'), /Nope/)
})

test('a refused token request is an error too', async () => {
  const fetch = async () => json(401, { error: 'invalid_client' })
  const hub = createHubClient({
    drupalUrl: 'http://drupal',
    clientId: 'c',
    clientSecret: 's',
    fetch,
  })
  await assert.rejects(() => hub.get('/jsonapi/x'), /401/)
})

test('accountOf reads userinfo for the account and the debug route for the roles', async () => {
  const fetch = async (url, init) => {
    const token = init.headers.Authorization.replace('Bearer ', '')
    const known = {
      'op-token-1234567890abcdef': ['authenticated', 'operator'],
      'ed-token-1234567890abcdef': null,
    }
    if (!(token in known)) return json(401, {})
    if (String(url).endsWith('/oauth/userinfo'))
      return json(200, { sub: '2', preferred_username: 'operator' })
    if (String(url).endsWith('/oauth/debug'))
      return known[token]
        ? json(200, { id: 2, roles: known[token], permissions: [] })
        : json(403, { message: 'no' })
    return json(404, {})
  }
  assert.deepEqual(await accountOf('http://drupal', 'op-token-1234567890abcdef', { fetch }), {
    sub: '2',
    name: 'operator',
    roles: ['authenticated', 'operator'],
  })
  // Signed in, but the debug route refuses: an account with no role.
  assert.deepEqual(await accountOf('http://drupal', 'ed-token-1234567890abcdef', { fetch }), {
    sub: '2',
    name: 'operator',
    roles: [],
  })
  assert.equal(await accountOf('http://drupal', 'bad-token-1234567890abcdef', { fetch }), null)
  assert.equal(await accountOf('http://drupal', 'short', { fetch }), null)
  assert.equal(await accountOf('http://drupal', '', { fetch }), null)
})

test('orderForToken returns the order for its cart token and null otherwise', async () => {
  const fetch = async (url, init) =>
    init.headers['Commerce-Cart-Token'] === 'owner'
      ? json(200, {
          data: { id: 'o1', attributes: { order_number: '7', state: 'fulfillment' } },
        })
      : json(403, { errors: [{ status: '403' }] })
  assert.deepEqual(
    await orderForToken('http://drupal', '0f1a1b1c-0000-4000-8000-000000000001', 'owner', {
      fetch,
    }),
    { id: 'o1', number: '7', state: 'fulfillment', total: '', email: '' }
  )
  assert.equal(
    await orderForToken('http://drupal', '0f1a1b1c-0000-4000-8000-000000000001', 'thief', {
      fetch,
    }),
    null
  )
  assert.equal(await orderForToken('http://drupal', 'not-a-uuid', 'owner', { fetch }), null)
  assert.equal(
    await orderForToken('http://drupal', '0f1a1b1c-0000-4000-8000-000000000001', '', { fetch }),
    null
  )
})
