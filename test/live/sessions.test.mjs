import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionHandler } from '../../nuxt/server/live/sessions.js'
import { fakeHub, client, errorsTo } from './fake-hub.mjs'

const operatorToken = 'op-token-1234567890abcdef'
const accountOf = async (url, bearer) =>
  bearer === operatorToken
    ? { sub: '2', name: 'operator', roles: ['operator'] }
    : bearer === 'ed-token-1234567890abcdef'
      ? { sub: '3', name: 'editor', roles: [] }
      : null
const orderForToken = async (url, uuid, token) =>
  token === 'cart-1'
    ? { id: uuid, number: '9', state: 'fulfillment', total: '$10.00', email: 'v@example.com' }
    : null
const drupal = () => {
  const writes = []
  return {
    writes,
    post: async (path, document) => {
      writes.push(['POST', path, document])
      return { data: { id: 'm1' } }
    },
    patch: async (path, document) => {
      writes.push(['PATCH', path, document])
      return {}
    },
  }
}
const UUID = '0f1a1b1c-0000-4000-8000-000000000001'

const open = async (handler, hub, who = client('op'), token = operatorToken) => {
  await hub.enter(handler, 'session:new', who)
  await handler.message(hub, 'session:new', who, 'open', { token })
  const opened = hub.sent.find((m) => m.to === who.id && m.type === 'session')
  return opened ? opened.payload.code : null
}

test('an operator opens a session and gets a code Drupal records', async () => {
  const hub = fakeHub()
  const d = drupal()
  const handler = sessionHandler({
    drupal: d,
    drupalUrl: 'http://drupal',
    accountOf,
    orderForToken,
    rand: () => 0.1,
  })
  const code = await open(handler, hub)
  assert.equal(code.length, 6)
  assert.ok(handler.registry.get(code))
  assert.equal(d.writes[0][1], '/jsonapi/message/demo_session')
  assert.equal(d.writes[0][2].data.attributes.field_code, code)
})

test('a visitor and an editor cannot open one', async () => {
  const hub = fakeHub()
  const handler = sessionHandler({
    drupal: drupal(),
    drupalUrl: 'http://drupal',
    accountOf,
    orderForToken,
  })
  assert.equal(await open(handler, hub, client('v'), 'nope'), null)
  assert.equal(await open(handler, hub, client('e'), 'ed-token-1234567890abcdef'), null)
  assert.equal(errorsTo(hub, 'v').length, 1)
  assert.equal(errorsTo(hub, 'e').length, 1)
})

test('a visitor joins by code, reports a placed order, and only consoles hear it', async () => {
  const hub = fakeHub()
  const d = drupal()
  const handler = sessionHandler({
    drupal: d,
    drupalUrl: 'http://drupal',
    accountOf,
    orderForToken,
    rand: () => 0.1,
  })
  const op = client('op')
  const code = await open(handler, hub, op)
  // The console watches the session's orders once it has claimed that room.
  await hub.enter({}, `orders:${code}`, op)
  const visitor = client('v')
  await hub.enter(handler, `session:${code}`, visitor)
  assert.equal(errorsTo(hub, 'v').length, 0)
  const bystander = client('b')
  await hub.enter({}, `orders:${code}`, bystander)

  await handler.message(hub, `session:${code}`, visitor, 'placed', { uuid: UUID, token: 'cart-1' })
  assert.deepEqual([...handler.registry.get(code).orders.keys()], [UUID])
  assert.equal(handler.registry.sessionOf(UUID), code)
  const patch = d.writes.find((w) => w[0] === 'PATCH')
  assert.equal(patch[1], `/jsonapi/orders/default/${UUID}`)
  assert.equal(patch[2].data.attributes.field_demo_session, code)
  const placed = hub.sent.filter((m) => m.type === 'order:placed')
  assert.deepEqual(
    placed.map((m) => m.to),
    ['op']
  )
  assert.equal(placed[0].payload.number, '9')

  // A placement the token does not own is refused and not recorded.
  await handler.message(hub, `session:${code}`, visitor, 'placed', {
    uuid: UUID.replace(/1$/, '2'),
    token: 'thief',
  })
  assert.equal(handler.registry.get(code).orders.size, 1)
  assert.equal(errorsTo(hub, 'v').length, 1)
})

test('a code that does not exist, or a visitor who never joined, is refused', async () => {
  const hub = fakeHub()
  const handler = sessionHandler({
    drupal: drupal(),
    drupalUrl: 'http://drupal',
    accountOf,
    orderForToken,
    rand: () => 0.1,
  })
  await hub.enter(handler, 'session:ZZZZZZ', client('v'))
  assert.equal(errorsTo(hub, 'v').length, 1)
  const code = await open(handler, hub)
  const stranger = client('s')
  await handler.message(hub, `session:${code}`, stranger, 'placed', { uuid: UUID, token: 'cart-1' })
  assert.equal(errorsTo(hub, 's').length, 1)
  assert.equal(handler.registry.get(code).orders.size, 0)
})

test('a session survives a Drupal write failing, and leaving forgets the visitor', async () => {
  const hub = fakeHub()
  const failing = {
    post: async () => {
      throw new Error('down')
    },
    patch: async () => {
      throw new Error('down')
    },
  }
  const handler = sessionHandler({
    drupal: failing,
    drupalUrl: 'http://drupal',
    accountOf,
    orderForToken,
    rand: () => 0.1,
  })
  const code = await open(handler, hub)
  assert.ok(code)
  const visitor = client('v')
  await hub.enter(handler, `session:${code}`, visitor)
  await hub.exit(handler, `session:${code}`, visitor)
  assert.equal(handler.registry.get(code).visitors.size, 0)
})

test('consoles hear the visitor count move, and an end closes the session', async () => {
  const hub = fakeHub()
  const handler = sessionHandler({
    drupal: drupal(),
    drupalUrl: 'http://drupal',
    accountOf,
    orderForToken,
    rand: () => 0.1,
  })
  const op = client('op')
  const code = await open(handler, hub, op)
  await hub.enter({}, `orders:${code}`, op)
  const visitor = client('v')
  await hub.enter(handler, `session:${code}`, visitor)
  const counts = hub.sent.filter((m) => m.type === 'counts')
  assert.deepEqual(
    counts.map((m) => [m.to, m.channel, m.payload.visitors]),
    [['op', `orders:${code}`, 1]]
  )
  await hub.exit(handler, `session:${code}`, visitor)
  assert.equal(hub.sent.filter((m) => m.type === 'counts').pop().payload.visitors, 0)
  // Ending it forgets the code; a visitor's next join is refused.
  assert.equal(handler.registry.end(code), true)
  assert.equal(handler.registry.get(code), undefined)
  assert.equal(handler.registry.end(code), false)
  await hub.enter(handler, `session:${code}`, client('late'))
  assert.equal(errorsTo(hub, 'late').length, 1)
})
