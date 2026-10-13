import test from 'node:test'
import assert from 'node:assert/strict'
import { productHandler, countCarts } from '../../nuxt/server/live/products.js'
import { fakeHub, client } from './fake-hub.mjs'

const P1 = 'p1-uuid'
const P2 = 'p2-uuid'
const carts = (orders) => ({
  data: orders.map((items, i) => ({
    id: `o${i}`,
    relationships: {
      order_items: { data: items.map((v) => ({ type: 'order-item--default', id: `${i}-${v}` })) },
    },
  })),
  included: [
    ...orders.flatMap((items, i) =>
      items.map((v) => ({
        type: 'order-item--default',
        id: `${i}-${v}`,
        relationships: {
          purchased_entity: { data: { type: 'product-variation--physical', id: v } },
        },
      }))
    ),
    {
      type: 'product-variation--physical',
      id: 'v1',
      relationships: { product_id: { data: { id: P1 } } },
    },
    {
      type: 'product-variation--physical',
      id: 'v1b',
      relationships: { product_id: { data: { id: P1 } } },
    },
    {
      type: 'product-variation--physical',
      id: 'v2',
      relationships: { product_id: { data: { id: P2 } } },
    },
  ],
})

test('countCarts counts carts, not items, per product', () => {
  const counts = countCarts(carts([['v1', 'v1b'], ['v1', 'v2'], ['v2']]))
  assert.equal(counts.get(P1), 2)
  assert.equal(counts.get(P2), 2)
  assert.deepEqual([...countCarts({}).keys()], [])
})

test('a room hears who is looking and how many carts, and a purge moves the cart count', async () => {
  let body = carts([['v1']])
  const drupal = { get: async () => body }
  const timers = []
  const { handler, onTags } = productHandler({ drupal, setTimer: (fn) => (timers.push(fn), 1) })
  const hub = fakeHub()
  const a = client('a')
  await hub.enter(handler, `product:${P1}`, a)
  // Before any read, the count is 0; the joiner hears it alone.
  assert.deepEqual(
    hub.sent.filter((m) => m.to === 'a' && m.type === 'carts').map((m) => m.payload.count),
    [0]
  )
  assert.equal(hub.sent.find((m) => m.type === 'looking').payload.count, 1)
  const b = client('b')
  await hub.enter(handler, `product:${P1}`, b)
  assert.equal(hub.sent.filter((m) => m.type === 'looking').pop().payload.count, 2)

  hub.sent.length = 0
  onTags(['node:1'])
  assert.equal(timers.length, 0)
  onTags(['commerce_order:3'])
  onTags(['commerce_order_list'])
  assert.equal(timers.length, 1)
  await timers[0]()
  const moved = hub.sent.filter((m) => m.type === 'carts')
  assert.deepEqual(
    moved.map((m) => [m.to, m.payload.count]),
    [[`*product:${P1}`, 1]]
  )

  // A room nobody is in hears nothing; a count that did not move is not repeated.
  hub.sent.length = 0
  body = carts([['v1'], ['v2']])
  onTags(['commerce_order:4'])
  await timers[1]()
  assert.deepEqual(
    hub.sent.filter((m) => m.type === 'carts'),
    []
  )

  // A late joiner gets the count the hub holds.
  const c = client('c')
  await hub.enter(handler, `product:${P2}`, c)
  assert.equal(hub.sent.find((m) => m.to === 'c' && m.type === 'carts').payload.count, 1)
  await hub.exit(handler, `product:${P1}`, b)
  assert.equal(hub.sent.filter((m) => m.type === 'looking').pop().payload.count, 1)
})

test('a failed read keeps the last counts', async () => {
  const drupal = {
    get: async () => {
      throw new Error('down')
    },
  }
  const log = []
  const { refresh, counts } = productHandler({ drupal, log: (m) => log.push(m) })
  await refresh()
  assert.equal(counts().size, 0)
  assert.match(log[0], /down/)
})
