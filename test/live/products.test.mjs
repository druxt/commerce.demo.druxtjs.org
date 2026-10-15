import test from 'node:test'
import assert from 'node:assert/strict'
import { productHandler, countCarts, readStock } from '../../nuxt/server/live/products.js'
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

const stockBody = (rows) => ({
  data: rows.map(([sku, stock, product]) => ({
    attributes: { sku, stock },
    relationships: { product_id: { data: { id: product } } },
  })),
})

test('readStock maps each SKU to its level and its product', () => {
  const { levels, productOf } = readStock([
    stockBody([
      ['v1', 14, P1],
      ['v2', 0, P2],
    ]),
    { data: [] },
  ])
  assert.equal(levels.get('v1'), 14)
  assert.equal(levels.get('v2'), 0)
  assert.equal(productOf.get('v2'), P2)
})

test('a product room and the catalogue room hear the stock move after an order purge', async () => {
  let stock = stockBody([
    ['v1', 2, P1],
    ['v2', 5, P2],
  ])
  const drupal = {
    get: async (path) =>
      path.includes('/orders/')
        ? carts([['v1']])
        : path.includes('/physical?')
          ? stock
          : { data: [] },
  }
  const timers = []
  const { handler, catalogue, onTags } = productHandler({
    drupal,
    setTimer: (fn) => (timers.push(fn), 1),
  })
  const hub = fakeHub()
  const page = client('p')
  await hub.enter(handler, `product:${P1}`, page)
  const list = client('l')
  await hub.enter(catalogue, 'catalogue:live', list)
  // Before any read, the catalogue gets empty maps; after a read, the levels.
  assert.deepEqual(hub.sent.find((m) => m.to === 'l' && m.type === 'stock').payload.levels, {})
  onTags(['commerce_order:9'])
  await timers[0]()
  hub.sent.length = 0
  const again = client('l2')
  await hub.enter(catalogue, 'catalogue:live', again)
  assert.deepEqual(hub.sent.find((m) => m.to === 'l2' && m.type === 'stock').payload.levels, {
    v1: 2,
    v2: 5,
  })
  assert.deepEqual(hub.sent.find((m) => m.to === 'l2' && m.type === 'carts').payload.counts, {
    [P1]: 1,
  })
  // The last unit sells: the room and the catalogue hear only what moved.
  hub.sent.length = 0
  stock = stockBody([
    ['v1', 0, P1],
    ['v2', 5, P2],
  ])
  onTags(['commerce_order:10'])
  await timers[1]()
  const roomStock = hub.sent.find((m) => m.to === `*product:${P1}` && m.type === 'stock')
  assert.deepEqual(roomStock.payload.levels, { v1: 0 })
  const listStock = hub.sent.find((m) => m.to === '*catalogue:live' && m.type === 'stock')
  assert.deepEqual(listStock.payload.levels, { v1: 0 })
  assert.equal(hub.sent.filter((m) => m.type === 'carts').length, 0)
})

test('the carts and the stock are read past their first page', async () => {
  const next = (href) => ({ links: { next: { href } } })
  const pages = {
    physical: {
      ...stockBody([['v1', 2, P1]]),
      ...next('http://drupal/jsonapi/product-variations/physical?page%5Boffset%5D=50'),
    },
    'physical-2': stockBody([['v2', 0, P2]]),
    carts: {
      ...carts([['v1']]),
      ...next('http://drupal/jsonapi/orders/default?page%5Boffset%5D=50'),
    },
    'carts-2': carts([['v1']]),
  }
  const drupal = {
    get: async (path) =>
      path.includes('/orders/')
        ? path.includes('offset')
          ? pages['carts-2']
          : pages.carts
        : path.includes('/physical?')
          ? path.includes('offset')
            ? pages['physical-2']
            : pages.physical
          : { data: [] },
  }
  const { refresh, counts, stock } = productHandler({ drupal })
  await refresh()
  assert.deepEqual(Object.fromEntries(stock().levels), { v1: 2, v2: 0 })
  assert.equal(counts().get(P1), 2)
})

test('a failed stock read keeps the last levels and tries again', async () => {
  let down = false
  const drupal = {
    get: async (path) => {
      if (path.includes('/orders/')) return carts([])
      if (down && path.includes('/media-physical')) throw new Error('stock down')
      return path.includes('/media-physical?') ? stockBody([['v1', 0, P1]]) : { data: [] }
    },
  }
  const log = []
  const timers = []
  const { refresh, stock } = productHandler({
    drupal,
    log: (m) => log.push(m),
    setTimer: (fn) => (timers.push(fn), 1),
  })
  await refresh()
  assert.equal(stock().levels.get('v1'), 0)
  down = true
  await refresh()
  // Sold out stays sold out, not unknown.
  assert.equal(stock().levels.get('v1'), 0)
  assert.match(log.pop(), /stock: not read, the last levels stand: stock down/)
  assert.equal(timers.length, 1)
  down = false
  await timers[0]()
  assert.equal(stock().levels.get('v1'), 0)
  assert.equal(timers.length, 1)
})

test('a product purge tells the catalogue room to read again', async () => {
  const { catalogue, onTags } = productHandler({
    drupal: { get: async () => ({ data: [] }) },
    setTimer: () => 1,
  })
  const hub = fakeHub()
  await hub.enter(catalogue, 'catalogue:live', client('l'))
  hub.sent.length = 0
  onTags(['commerce_product:4'])
  assert.equal(
    hub.sent.filter((m) => m.to === '*catalogue:live' && m.type === 'products').length,
    1
  )
  onTags(['node:1'])
  assert.equal(hub.sent.filter((m) => m.type === 'products').length, 1)
  // A room nobody is in hears nothing.
  const quiet = productHandler({ drupal: { get: async () => ({ data: [] }) }, setTimer: () => 1 })
  const hub2 = fakeHub()
  await hub2.enter(quiet.handler, 'product:x', client('p'))
  hub2.sent.length = 0
  quiet.onTags(['commerce_product:4'])
  assert.equal(hub2.sent.length, 0)
})
