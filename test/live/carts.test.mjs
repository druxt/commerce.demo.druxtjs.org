import test from 'node:test'
import assert from 'node:assert/strict'
import { cartHandler } from '../../nuxt/server/live/carts.js'
import { fakeHub, client, errorsTo } from './fake-hub.mjs'

const UUID = '0f1a1b1c-0000-4000-8000-000000000001'
const orderForToken = async (url, uuid, token) =>
  token === 'owner-cart' ? { id: uuid, number: '21', state: 'fulfillment' } : null
const setup = () => {
  const hub = fakeHub()
  const { handler, rooms } = cartHandler({
    orderForToken,
    drupalUrl: 'http://drupal',
    rand: () => 0.1,
  })
  return { hub, handler, rooms }
}
const open = async ({ hub, handler }, owner) => {
  await hub.enter(handler, 'cart:new', owner)
  await handler.message(hub, 'cart:new', owner, 'open', { token: 'owner-cart' })
  return hub.sent.find((m) => m.to === owner.id && m.type === 'room').payload.code
}

test('the owner opens a room and the code admits a guest, who gets the token once', async () => {
  const s = setup()
  const owner = client('o')
  const code = await open(s, owner)
  assert.equal(code.length, 6)
  await s.hub.enter(s.handler, `cart:${code}`, owner)
  const guest = client('g')
  await s.hub.enter(s.handler, `cart:${code}`, guest)
  const handed = s.hub.sent.filter((m) => m.type === 'token')
  assert.deepEqual(
    handed.map((m) => [m.to, m.payload.token]),
    [
      ['o', 'owner-cart'],
      ['g', 'owner-cart'],
    ]
  )
  assert.equal(handed[1].payload.owner, 'o')
  const members = s.hub.sent.filter((m) => m.type === 'members').pop().payload.members
  assert.deepEqual(
    members.map((m) => [m.id, m.owner]),
    [
      ['o', true],
      ['g', false],
    ]
  )
  // The token is never broadcast.
  assert.ok(s.hub.sent.filter((m) => m.type === 'token').every((m) => !m.to.startsWith('*')))
})

test('a dead code is refused, an empty token opens nothing, and a stranger cannot speak', async () => {
  const s = setup()
  await s.hub.enter(s.handler, 'cart:ZZZZZZ', client('x'))
  assert.deepEqual(errorsTo(s.hub, 'x'), ['That room has ended.'])
  const nobody = client('n')
  await s.hub.enter(s.handler, 'cart:new', nobody)
  await s.handler.message(s.hub, 'cart:new', nobody, 'open', { token: '' })
  assert.deepEqual(errorsTo(s.hub, 'n'), ['No cart to share.'])
  const code = await open(s, client('o'))
  await s.handler.message(s.hub, `cart:${code}`, client('s'), 'changed', {
    what: { verb: 'added', title: 'Hat' },
  })
  assert.equal(s.hub.sent.filter((m) => m.type === 'changed').length, 0)
  assert.deepEqual(errorsTo(s.hub, 's'), ['Join the room first.'])
})

test('changes name who did it and a placement closes the room', async () => {
  const s = setup()
  const owner = client('o')
  const code = await open(s, owner)
  await s.hub.enter(s.handler, `cart:${code}`, owner)
  const guest = client('g')
  await s.hub.enter(s.handler, `cart:${code}`, guest)
  await s.handler.message(s.hub, `cart:${code}`, guest, 'changed', {
    what: { verb: 'added', title: 'Knit Hat' },
  })
  const changed = s.hub.sent.find((m) => m.type === 'changed')
  assert.deepEqual(changed.payload, {
    by: 'g',
    byName: 'g',
    what: { verb: 'added', title: 'Knit Hat' },
  })
  // A verb off the list and a long title are bounded.
  await s.handler.message(s.hub, `cart:${code}`, guest, 'changed', {
    what: { verb: 'hacked', title: 'x'.repeat(300) },
  })
  const bounded = s.hub.sent.filter((m) => m.type === 'changed').pop().payload.what
  assert.equal(bounded.verb, 'changed')
  assert.equal(bounded.title.length, 120)
  // A placement the room's token did not make is refused; the owner's closes it.
  await s.handler.message(s.hub, `cart:${code}`, guest, 'placed', { uuid: 'not-a-uuid' })
  assert.deepEqual(errorsTo(s.hub, 'g'), ['No such order.'])
  assert.ok(s.rooms.get(code))
  await s.handler.message(s.hub, `cart:${code}`, owner, 'placed', { uuid: UUID })
  const closed = s.hub.sent.find((m) => m.type === 'closed')
  assert.deepEqual(closed.payload, { number: '21', by: 'o', byName: 'o' })
  assert.equal(s.rooms.get(code), undefined)
  await s.hub.enter(s.handler, `cart:${code}`, client('late'))
  assert.deepEqual(errorsTo(s.hub, 'late'), ['That room has ended.'])
})

test('a placement the token does not own is refused', async () => {
  const hub = fakeHub()
  const { handler, rooms } = cartHandler({
    orderForToken: async () => null,
    drupalUrl: 'http://drupal',
    rand: () => 0.1,
  })
  const owner = client('o')
  const code = await open({ hub, handler }, owner)
  await hub.enter(handler, `cart:${code}`, owner)
  await handler.message(hub, `cart:${code}`, owner, 'placed', { uuid: UUID })
  assert.deepEqual(errorsTo(hub, 'o'), ['That order is not this cart.'])
  assert.ok(rooms.get(code))
})

test('leaving updates the members and an empty room is forgotten', async () => {
  const s = setup()
  const owner = client('o')
  const code = await open(s, owner)
  await s.hub.enter(s.handler, `cart:${code}`, owner)
  const guest = client('g')
  await s.hub.enter(s.handler, `cart:${code}`, guest)
  await s.hub.exit(s.handler, `cart:${code}`, owner)
  assert.deepEqual(
    s.hub.sent
      .filter((m) => m.type === 'members')
      .pop()
      .payload.members.map((m) => m.id),
    ['g']
  )
  assert.ok(s.rooms.get(code))
  await s.hub.exit(s.handler, `cart:${code}`, guest)
  assert.equal(s.rooms.get(code), undefined)
})

test('an order placed from two phones at once closes the room once', async () => {
  const s = setup()
  const owner = client('o')
  const code = await open(s, owner)
  await s.hub.enter(s.handler, `cart:${code}`, owner)
  const guest = client('g')
  await s.hub.enter(s.handler, `cart:${code}`, guest)
  await Promise.all([
    s.handler.message(s.hub, `cart:${code}`, owner, 'placed', { uuid: UUID }),
    s.handler.message(s.hub, `cart:${code}`, guest, 'placed', { uuid: UUID }),
  ])
  assert.equal(s.hub.sent.filter((m) => m.type === 'closed').length, 1)
})

test('with no source given, a room code does not come from Math.random', async () => {
  const random = Math.random
  Math.random = () => {
    throw new Error('Math.random')
  }
  try {
    const hub = fakeHub()
    const { handler } = cartHandler({ orderForToken, drupalUrl: 'http://drupal' })
    assert.equal((await open({ hub, handler }, client('o'))).length, 6)
  } finally {
    Math.random = random
  }
})

test('a room nobody joins is forgotten, and one somebody joined is kept', async () => {
  const timers = []
  const hub = fakeHub()
  const { handler, rooms } = cartHandler({
    orderForToken,
    drupalUrl: 'http://drupal',
    rand: (() => {
      let n = 0
      return () => ((n++ % 7) + 0.5) / 32
    })(),
    setTimer: (fn) => timers.push(fn),
  })
  const lost = await open({ hub, handler }, client('a'))
  const owner = client('o')
  const kept = await open({ hub, handler }, owner)
  await hub.enter(handler, `cart:${kept}`, owner)
  assert.notEqual(lost, kept)
  for (const fn of timers) fn()
  assert.equal(rooms.get(lost), undefined)
  assert.ok(rooms.get(kept))
})
