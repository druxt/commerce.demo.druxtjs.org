import test from 'node:test'
import assert from 'node:assert/strict'
import { createTokenRoute } from '../server/auth.js'

const request = (body, method = 'POST') => ({
  method,
  headers: { 'content-type': 'application/json' },
  on(event, fn) {
    if (event === 'data') fn(JSON.stringify(body))
    if (event === 'end') fn()
  },
})
const response = () => {
  const res = { statusCode: 200, headers: {}, body: '' }
  res.setHeader = (k, v) => (res.headers[k.toLowerCase()] = v)
  res.end = (b = '') => (res.body += b)
  return res
}

test('the password grant goes to Drupal with the consumer id and the console scope', async () => {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url: String(url), body: init.body })
    return { status: 200, text: async () => '{"access_token":"t"}' }
  }
  const route = createTokenRoute({
    drupalUrl: 'http://drupal',
    clientId: 'commerce_operator',
    fetch,
  })
  const res = response()
  await route(
    request({
      grant_type: 'password',
      username: 'operator',
      password: 'pw',
      scope: 'hub',
      client_id: 'other',
    }),
    res
  )
  assert.equal(res.statusCode, 200)
  assert.equal(res.body, '{"access_token":"t"}')
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.equal(calls[0].url, 'http://drupal/oauth/token')
  const sent = new URLSearchParams(calls[0].body)
  assert.equal(sent.get('client_id'), 'commerce_operator')
  assert.equal(sent.get('grant_type'), 'password')
  assert.equal(sent.get('scope'), 'operator')
  assert.equal(sent.get('username'), 'operator')
})

test('a refresh carries only the refresh token', async () => {
  let body = ''
  const fetch = async (url, init) => ((body = init.body), { status: 200, text: async () => '{}' })
  const route = createTokenRoute({ drupalUrl: 'http://drupal', clientId: 'c', fetch })
  await route(
    request({ grant_type: 'refresh_token', refresh_token: 'r', password: 'leak' }),
    response()
  )
  const sent = new URLSearchParams(body)
  assert.equal(sent.get('refresh_token'), 'r')
  assert.equal(sent.get('password'), null)
})

test('other grants, other methods and a dead Drupal are refused', async () => {
  const route = createTokenRoute({
    drupalUrl: 'http://drupal',
    clientId: 'c',
    fetch: async () => {
      throw new Error('down')
    },
  })
  const res = response()
  await route(request({ grant_type: 'client_credentials' }), res)
  assert.equal(res.statusCode, 400)
  const res2 = response()
  await route(request({}, 'GET'), res2)
  assert.equal(res2.statusCode, 405)
  const res3 = response()
  await route(request({ grant_type: 'password', username: 'a', password: 'b' }), res3)
  assert.equal(res3.statusCode, 502)
})

test('a body over the limit is answered 413 and never reaches Drupal', async () => {
  let called = false
  const fetch = async () => ((called = true), { status: 200, text: async () => '{}' })
  const route = createTokenRoute({ drupalUrl: 'http://drupal', clientId: 'c', fetch })
  const res = response()
  await route(request({ grant_type: 'password', padding: 'x'.repeat(65 * 1024) }), res)
  assert.equal(res.statusCode, 413)
  assert.equal(called, false)
})
