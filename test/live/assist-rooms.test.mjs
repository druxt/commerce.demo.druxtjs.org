import test from 'node:test'
import assert from 'node:assert/strict'
import { assistHandler } from '../../nuxt/server/live/assist.js'
import { fakeHub, client, errorsTo } from './fake-hub.mjs'

const operatorToken = 'op-token-1234567890abcdef'
const accountOf = async (url, bearer) =>
  bearer === operatorToken ? { sub: '2', name: 'Sam', roles: ['authenticated', 'operator'] } : null
const drupalStub = (rows = {}) => {
  const writes = []
  return {
    writes,
    post: async (path, document) => {
      writes.push(['POST', path, document])
      return { data: { id: `id-${writes.length}` } }
    },
    patch: async (path, document) => {
      writes.push(['PATCH', path, document])
      return {}
    },
    get: async (path) => rows[path.split('?')[0]] || { data: [] },
  }
}
const registry = { get: (code) => (code === 'SESS22' ? { code } : undefined) }
const setup = (drupal = drupalStub()) => {
  const hub = fakeHub()
  // The real hub lets handlers reach clients by id.
  hub.clients = new Map()
  const enter = hub.enter
  hub.enter = (handler, channel, c) => {
    hub.clients.set(c.id, c)
    return enter(handler, channel, c)
  }
  // A source that moves, so a second conversation gets a second code.
  let n = 0
  const rand = () => ((n++ % 7) + 0.5) / 32
  const handler = assistHandler({
    drupal,
    drupalUrl: 'http://drupal',
    accountOf,
    registry,
    rand,
  })
  return { hub, handler, drupal }
}
const open = async ({ hub, handler }, visitor, session = 'SESS22') => {
  await hub.enter(handler, 'assist:new', visitor)
  await handler.message(hub, 'assist:new', visitor, 'open', { session, route: '/product/x' })
  const code = hub.sent.find((m) => m.to === visitor.id && m.type === 'conversation').payload.code
  await hub.enter(handler, `assist:${code}`, visitor)
  return code
}
const watch = async ({ hub, handler }, console_, session = 'SESS22') => {
  await hub.enter(handler, 'assist:new', console_)
  await handler.message(hub, 'assist:new', console_, 'list', { token: operatorToken, session })
}

test('a visitor opens a conversation, turns are written and replayed on a new join', async () => {
  const s = setup()
  const v = client('v')
  const code = await open(s, v)
  assert.equal(code.length, 6)
  assert.equal(s.drupal.writes[0][1], '/jsonapi/message/conversation')
  await s.handler.message(s.hub, `assist:${code}`, v, 'turn', {
    author: 'visitor',
    text: 'Something to read',
  })
  await s.handler.message(s.hub, `assist:${code}`, v, 'turn', {
    author: 'concierge',
    text: 'Three classics.',
    picks: [{ sku: 'book-alice-hard-copy', why: 'short' }],
  })
  const chats = s.drupal.writes.filter((w) => w[1] === '/jsonapi/message/chat')
  assert.equal(chats.length, 2)
  assert.equal(chats[1][2].data.attributes.field_author, 'concierge')
  assert.equal(JSON.parse(chats[1][2].data.attributes.field_picks)[0].sku, 'book-alice-hard-copy')
  assert.equal(chats[1][2].data.relationships.field_conversation.data.id, 'id-1')
  // The same tab after a reload: the thread comes back.
  const again = client('v2')
  await s.hub.enter(s.handler, `assist:${code}`, again)
  const thread = s.hub.sent.filter((m) => m.to === 'v2' && m.type === 'thread').pop().payload
  assert.deepEqual(
    thread.turns.map((t) => t.author),
    ['visitor', 'concierge']
  )
  assert.equal(thread.state, 'concierge')
})

test('a dead code is refused and a stranger cannot speak in a thread', async () => {
  const s = setup()
  await s.hub.enter(s.handler, 'assist:ZZZZZZ', client('x'))
  assert.deepEqual(errorsTo(s.hub, 'x'), ['That conversation has ended.'])
  const code = await open(s, client('v'))
  const stranger = client('s')
  await s.handler.message(s.hub, `assist:${code}`, stranger, 'turn', {
    author: 'visitor',
    text: 'hi',
  })
  assert.deepEqual(errorsTo(s.hub, 's'), ['This is not your conversation.'])
  assert.equal(s.handler.threads.get(code).turns.length, 0)
})

test('waiting reaches only the consoles on the session, a claim needs an operator, then the two talk', async () => {
  const s = setup()
  const c = client('c')
  await watch(s, c)
  const other = client('o2')
  await s.hub.enter(s.handler, 'assist:new', other)
  await s.handler.message(s.hub, 'assist:new', other, 'list', { token: 'nope', session: 'SESS22' })
  assert.equal(errorsTo(s.hub, 'o2').length, 1)
  const v = client('v')
  const code = await open(s, v)
  await s.handler.message(s.hub, `assist:${code}`, v, 'turn', {
    author: 'visitor',
    text: 'Can I talk to a person?',
  })
  await s.handler.message(s.hub, `assist:${code}`, v, 'wait', {})
  const waiting = s.hub.sent.filter((m) => m.type === 'assist:waiting')
  assert.deepEqual(
    waiting.map((m) => m.to),
    ['c']
  )
  assert.equal(waiting[0].payload.question, 'Can I talk to a person?')
  assert.equal(waiting[0].payload.turns.length, 1)
  assert.equal(s.handler.threads.get(code).state, 'waiting')
  // The console opens the thread and claims it; a shopper token cannot.
  await s.hub.enter(s.handler, `assist:${code}`, c)
  await s.handler.message(s.hub, `assist:${code}`, c, 'claim', { token: 'bad' })
  assert.ok(errorsTo(s.hub, 'c').includes('Only an operator can claim a thread.'))
  await s.handler.message(s.hub, `assist:${code}`, c, 'claim', { token: operatorToken })
  const joined = s.hub.sent.find((m) => m.type === 'operator')
  assert.deepEqual(joined.payload, { code, name: 'Sam' })
  assert.equal(s.handler.threads.get(code).state, 'with_operator')
  // The visitor's panel stops relaying the concierge; the operator's turn reaches the room.
  s.hub.sent.length = 0
  await s.handler.message(s.hub, `assist:${code}`, v, 'turn', {
    author: 'concierge',
    text: 'should be dropped',
  })
  assert.equal(s.hub.sent.filter((m) => m.type === 'turn').length, 0)
  await s.handler.message(s.hub, `assist:${code}`, c, 'turn', {
    author: 'operator',
    text: 'Hi, Sam here.',
    picks: [{ sku: 'candle4', why: 'a candle' }],
  })
  const turn = s.hub.sent.find((m) => m.type === 'turn')
  assert.equal(turn.payload.author, 'operator')
  assert.equal(turn.payload.by, 'Sam')
  assert.equal(turn.payload.picks[0].sku, 'candle4')
  await s.handler.message(s.hub, `assist:${code}`, v, 'turn', {
    author: 'operator',
    text: 'impostor',
  })
  assert.ok(errorsTo(s.hub, 'v').includes('A visitor is not the operator.'))
  // Hand back: the concierge answers again.
  await s.handler.message(s.hub, `assist:${code}`, c, 'handback', {})
  assert.equal(s.handler.threads.get(code).state, 'concierge')
  assert.ok(s.hub.sent.some((m) => m.type === 'handback'))
})

test('a visitor with no session cannot wait, and cancel returns to the concierge', async () => {
  const s = setup()
  const lone = client('l')
  const code = await open(s, lone, '')
  await s.handler.message(s.hub, `assist:${code}`, lone, 'wait', {})
  assert.deepEqual(errorsTo(s.hub, 'l'), ['No operator session is open for this visit.'])
  const v = client('v')
  const code2 = await open(s, v)
  await s.handler.message(s.hub, `assist:${code2}`, v, 'wait', {})
  await s.handler.message(s.hub, `assist:${code2}`, v, 'cancel', {})
  assert.equal(s.handler.threads.get(code2).state, 'concierge')
  const states = s.hub.sent.filter((m) => m.type === 'state').map((m) => m.payload.state)
  assert.deepEqual(states, ['waiting', 'concierge'])
})

test('a thread the hub forgot comes back from Drupal', async () => {
  const drupal = drupalStub({
    '/jsonapi/message/conversation': {
      data: [
        {
          id: 'conv-1',
          attributes: { field_code: 'ABCDEF', field_session: 'SESS22', field_state: 'waiting' },
        },
      ],
    },
    '/jsonapi/message/chat': {
      data: [
        {
          attributes: {
            field_author: 'visitor',
            field_body: 'hello',
            field_picks: '',
            created: '2026-10-12T00:00:00+00:00',
          },
        },
        {
          attributes: {
            field_author: 'concierge',
            field_body: 'hi',
            field_picks: '[{"sku":"whtsh","why":"soft"}]',
            created: '2026-10-12T00:00:01+00:00',
          },
        },
        {
          attributes: {
            field_author: 'concierge',
            field_body: 'these',
            field_picks: '[{"sku":',
            created: '2026-10-12T00:00:02+00:00',
          },
        },
      ],
    },
  })
  const s = setup(drupal)
  const v = client('v')
  await s.hub.enter(s.handler, 'assist:ABCDEF', v)
  const thread = s.hub.sent.find((m) => m.type === 'thread').payload
  assert.equal(thread.state, 'waiting')
  // Drupal does not keep when the wait began, so it counts from the recovery.
  assert.ok(thread.waitingSince > 0)
  assert.equal(thread.turns.length, 3)
  assert.equal(thread.turns[1].picks[0].sku, 'whtsh')
  // Picks that do not parse lose only themselves.
  assert.equal(thread.turns[2].body, 'these')
  assert.equal(thread.turns[2].picks, undefined)
  // The recovered thread is the visitor's to continue.
  await s.handler.message(s.hub, 'assist:ABCDEF', v, 'turn', {
    author: 'visitor',
    text: 'still here',
  })
  assert.equal(s.handler.threads.get('ABCDEF').turns.length, 4)
})

test('an operator claims only a thread on a session that is open', async () => {
  const s = setup()
  const v = client('v')
  const code = await open(s, v, '')
  const c = client('c')
  await s.hub.enter(s.handler, `assist:${code}`, c)
  await s.handler.message(s.hub, `assist:${code}`, c, 'claim', { token: operatorToken })
  assert.ok(errorsTo(s.hub, 'c').includes('Only an operator on the session can claim its threads.'))
  assert.equal(s.handler.threads.get(code).operator, null)
})

test('a console that joins a thread with no visitor in it claims it as the operator, and the visitor comes back', async () => {
  const s = setup()
  const v = client('v')
  const code = await open(s, v)
  await s.handler.message(s.hub, `assist:${code}`, v, 'wait', {})
  // The visitor's tab goes, so the thread has nobody in its visitor slot.
  await s.hub.exit(s.handler, `assist:${code}`, v)
  const c = client('c')
  await s.hub.enter(s.handler, `assist:${code}`, c)
  await s.handler.message(s.hub, `assist:${code}`, c, 'claim', { token: operatorToken })
  await s.handler.message(s.hub, `assist:${code}`, c, 'turn', {
    author: 'operator',
    text: 'Sam here.',
  })
  assert.deepEqual(errorsTo(s.hub, 'c'), [])
  assert.equal(s.handler.threads.get(code).turns.pop().author, 'operator')
  // The visitor reloads and can answer.
  const back = client('v2')
  await s.hub.enter(s.handler, `assist:${code}`, back)
  await s.handler.message(s.hub, `assist:${code}`, back, 'turn', {
    author: 'visitor',
    text: 'Thanks.',
  })
  assert.deepEqual(errorsTo(s.hub, 'v2'), [])
  assert.equal(s.handler.threads.get(code).turns.pop().author, 'visitor')
})

test('a thread replayed while it waits says when the wait began', async () => {
  const s = setup()
  const v = client('v')
  const code = await open(s, v)
  await s.handler.message(s.hub, `assist:${code}`, v, 'wait', {})
  const since = s.handler.threads.get(code).waitingSince
  assert.ok(since > 0)
  const again = client('v2')
  await s.hub.enter(s.handler, `assist:${code}`, again)
  const thread = s.hub.sent.filter((m) => m.to === 'v2' && m.type === 'thread').pop().payload
  assert.equal(thread.state, 'waiting')
  assert.equal(thread.waitingSince, since)
})
