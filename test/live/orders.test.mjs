import test from 'node:test'
import assert from 'node:assert/strict'
import { ordersHandler } from '../../nuxt/server/live/orders.js'
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
const UUID = '0f1a1b1c-0000-4000-8000-000000000001'

const setup = (drupalGet) => {
  const hub = fakeHub()
  const drupal = {
    post: async () => ({}),
    patch: async () => ({}),
    get: drupalGet || (async () => ({ data: [] })),
  }
  const session = sessionHandler({
    drupal,
    drupalUrl: 'http://drupal',
    accountOf,
    orderForToken,
    rand: () => 0.1,
  })
  const { orders, order, onTags } = ordersHandler({
    registry: session.registry,
    drupal,
    drupalUrl: 'http://drupal',
    accountOf,
    orderForToken,
  })
  return { hub, session, orders, order, onTags }
}

const openSession = async ({ hub, session }) => {
  const op = client('op')
  await hub.enter(session, 'session:new', op)
  await session.message(hub, 'session:new', op, 'open', { token: operatorToken })
  return { op, code: hub.sent.find((m) => m.type === 'session').payload.code }
}

test('a console claims a session with an operator token and gets its orders', async () => {
  const s = setup()
  const { hub, session, orders } = s
  const { op, code } = await openSession(s)
  const visitor = client('v')
  await hub.enter(session, `session:${code}`, visitor)
  await session.message(hub, `session:${code}`, visitor, 'placed', { uuid: UUID, token: 'cart-1' })
  const console2 = client('c2')
  await hub.enter(orders, `orders:${code}`, console2)
  await orders.message(hub, `orders:${code}`, console2, 'claim', { token: operatorToken })
  const list = hub.sent.find((m) => m.to === 'c2' && m.type === 'orders')
  assert.deepEqual(list.payload.orders, [
    { uuid: UUID, number: '9', state: 'fulfillment', total: '$10.00', email: 'v@example.com' },
  ])
  // An editor, a stranger, and a dead code are refused.
  const editor = client('e')
  await hub.enter(orders, `orders:${code}`, editor)
  await orders.message(hub, `orders:${code}`, editor, 'claim', {
    token: 'ed-token-1234567890abcdef',
  })
  await orders.message(hub, `orders:${code}`, client('x'), 'claim', { token: 'nope' })
  await orders.message(hub, 'orders:ZZZZZZ', op, 'claim', { token: operatorToken })
  assert.equal(errorsTo(hub, 'e').length, 1)
  assert.equal(errorsTo(hub, 'x').length, 1)
  assert.equal(errorsTo(hub, 'op').length, 1)
})

test('an order room needs the cart token, and the claim brings the state', async () => {
  const { hub, order } = setup()
  const owner = client('v')
  await hub.enter(order, `order:${UUID}`, owner)
  await order.message(hub, `order:${UUID}`, owner, 'claim', { token: 'cart-1' })
  const state = hub.sent.find((m) => m.to === 'v' && m.type === 'order:state')
  assert.equal(state.payload.state, 'fulfillment')
  const thief = client('t')
  await hub.enter(order, `order:${UUID}`, thief)
  await order.message(hub, `order:${UUID}`, thief, 'claim', { token: 'thief' })
  await order.message(hub, 'order:not-a-uuid', client('n'), 'claim', { token: 'cart-1' })
  assert.equal(errorsTo(hub, 't').length, 1)
  assert.equal(errorsTo(hub, 'n').length, 1)
})

test('a purged order tag reaches the proven room and the session consoles, and nobody else', async () => {
  // Drupal's order names the session by its code, which exists once opened.
  const known = { code: '' }
  const get = async (path) =>
    path.includes('order_id%5D=12') || path.includes('order_id]=12')
      ? {
          data: [
            {
              id: UUID,
              attributes: {
                order_number: '12',
                state: 'completed',
                field_demo_session: known.code,
              },
            },
          ],
        }
      : { data: [] }
  const s = setup(get)
  const { hub, orders, order, onTags } = s
  const { op, code } = await openSession(s)
  known.code = code
  const owner = client('v')
  await hub.enter(order, `order:${UUID}`, owner)
  await order.message(hub, `order:${UUID}`, owner, 'claim', { token: 'cart-1' })
  const lurker = client('l')
  await hub.enter(order, `order:${UUID}`, lurker)
  await hub.enter(orders, `orders:${code}`, op)
  await orders.message(hub, `orders:${code}`, op, 'claim', { token: operatorToken })
  hub.sent.length = 0
  s.session.registry.remember(UUID, { number: '12', state: 'fulfillment' }, code)
  await onTags(['node:1', 'commerce_order:12', 'commerce_order:12'])
  const states = hub.sent.filter((m) => m.type === 'order:state')
  assert.deepEqual(states.map((m) => m.to).sort(), ['op', 'v'])
  assert.ok(states.every((m) => m.payload.state === 'completed'))
  assert.equal(s.session.registry.get(code).orders.get(UUID).state, 'completed')
  // Leaving the room forgets the proof.
  await hub.exit(order, `order:${UUID}`, owner)
  hub.sent.length = 0
  await onTags(['commerce_order:12'])
  assert.deepEqual(
    hub.sent.filter((m) => m.type === 'order:state').map((m) => m.to),
    ['op']
  )
})

test('onTags with no order tags, or before any hub, does nothing', async () => {
  const { onTags, hub } = setup()
  await onTags(['node:1'])
  await onTags(['commerce_order:1'])
  assert.equal(hub.sent.length, 0)
})

test('a console ends its session, and the placed payload carries the total', async () => {
  const s = setup()
  const { hub, session, orders } = s
  const { op, code } = await openSession(s)
  await hub.enter(orders, `orders:${code}`, op)
  await orders.message(hub, `orders:${code}`, op, 'claim', { token: operatorToken })
  const visitor = client('v')
  await hub.enter(session, `session:${code}`, visitor)
  await session.message(hub, `session:${code}`, visitor, 'placed', { uuid: UUID, token: 'cart-1' })
  const placed = hub.sent.find((m) => m.type === 'order:placed')
  assert.deepEqual(placed.payload, {
    uuid: UUID,
    number: '9',
    state: 'fulfillment',
    total: '$10.00',
    email: 'v@example.com',
  })
  // A stranger cannot end it; the console can.
  await orders.message(hub, `orders:${code}`, client('x'), 'end', {})
  assert.ok(s.session.registry.get(code))
  await orders.message(hub, `orders:${code}`, op, 'end', {})
  assert.equal(s.session.registry.get(code), undefined)
  assert.ok(hub.sent.some((m) => m.to === 'op' && m.type === 'ended'))
})

test('a shipment purge reaches the order room with the shipment state', async () => {
  const orderDoc = (shipment) => ({
    data: [
      {
        id: UUID,
        attributes: { order_number: '12', state: 'fulfillment', field_demo_session: '' },
        relationships: { shipments: { data: [{ type: 'shipment--default', id: 'ship-1' }] } },
      },
    ],
    included: [{ type: 'shipment--default', id: 'ship-1', attributes: { state: shipment } }],
  })
  let shipped = 'ready'
  const get = async (path) => {
    if (path.startsWith('/jsonapi/shipments/default?'))
      return {
        data: [
          {
            id: 'ship-1',
            relationships: { order_id: { data: { type: 'order--default', id: UUID } } },
          },
        ],
      }
    if (path.startsWith(`/jsonapi/orders/default/${UUID}`)) {
      const doc = orderDoc(shipped)
      return { data: doc.data[0], included: doc.included }
    }
    return orderDoc(shipped)
  }
  const { hub, order, onTags } = setup(get)
  const owner = client('v')
  await hub.enter(order, `order:${UUID}`, owner)
  await order.message(hub, `order:${UUID}`, owner, 'claim', { token: 'cart-1' })
  assert.equal(
    hub.sent.find((m) => m.to === 'v' && m.type === 'order:state').payload.shipment,
    'ready'
  )
  hub.sent.length = 0
  shipped = 'shipped'
  await onTags(['commerce_shipment:1'])
  const moved = hub.sent.find((m) => m.to === 'v' && m.type === 'order:state')
  assert.equal(moved.payload.shipment, 'shipped')
  assert.equal(moved.payload.state, 'fulfillment')
})
