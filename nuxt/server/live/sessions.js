/**
 * Demo sessions on the hub.
 *
 * `session:new` is where a console asks for a session: it joins, sends
 * `open` with its operator token, and gets `session` with a code. Visitors
 * who arrive through the session's link join `session:<code>`. A visitor
 * sends `placed` when checkout places an order, with the cart token that
 * owns it; the hub checks that with Drupal, marks the order with the
 * session, and tells the session's consoles.
 *
 * The hub adds a client to a channel before this handler hears of it, so
 * a channel that needs proof keeps its own set of who gave it, and speaks
 * only to them.
 */
const { roomCode, isCode } = require('./code')

const sessionHandler = ({
  drupal,
  drupalUrl,
  accountOf,
  orderForToken,
  rand,
  log = () => {},
} = {}) => {
  const sessions = new Map()
  const codes = new Set()
  const byOrder = new Map()
  let hubApi = null

  /** Who hears a message on a session's console channel. */
  const tellConsoles = (hub, code, type, payload) => {
    const allowed = (sessions.get(code) || {}).consoles || new Set()
    for (const member of hub.members(`orders:${code}`)) {
      if (allowed.has(member.id)) hub.send(member, type, `orders:${code}`, payload)
    }
  }

  const tellCount = (hub, code) => {
    const s = sessions.get(code)
    if (s) tellConsoles(hub, code, 'counts', { visitors: s.visitors.size })
  }

  const fail = (hub, client, channel, message) =>
    hub.send(client, 'error', channel, { message })

  const registry = {
    get: (code) => sessions.get(code),
    sessionOf: (uuid) => byOrder.get(uuid),
    codes,
    /** A console proved its token on `orders:<code>`; it hears that session. */
    allowConsole: (code, clientId) => {
      const s = sessions.get(code)
      if (s) s.consoles.add(clientId)
      return !!s
    },
    tellConsoles: (code, type, payload) => hubApi && tellConsoles(hubApi, code, type, payload),
    /** An order's state as the hub last saw it. */
    remember: (uuid, order, code) => {
      const s = sessions.get(code)
      if (s) s.orders.set(uuid, { ...(s.orders.get(uuid) || {}), ...order })
      if (code) byOrder.set(uuid, code)
    },
    visitors: (code) => ((sessions.get(code) || {}).visitors || new Set()).size,
    /** A console ended it: the code is free again and its visitors are strangers. */
    end: (code) => {
      if (!sessions.has(code)) return false
      sessions.delete(code)
      codes.delete(code)
      for (const [uuid, c] of byOrder) if (c === code) byOrder.delete(uuid)
      return true
    },
  }

  const handler = {
    registry,

    join(hub, channel, client) {
      hubApi = hub
      const code = channel.slice('session:'.length)
      if (code === 'new') return
      if (!isCode(code) || !sessions.has(code)) {
        return fail(hub, client, channel, 'That demo session has ended.')
      }
      sessions.get(code).visitors.add(client.id)
      tellCount(hub, code)
    },

    leave(hub, channel, client) {
      const code = channel.slice('session:'.length)
      const s = sessions.get(code)
      if (!s) return
      s.visitors.delete(client.id)
      tellCount(hub, code)
    },

    async message(hub, channel, client, type, payload = {}) {
      hubApi = hub
      const code = channel.slice('session:'.length)

      // A console opens a session with its operator token.
      if (code === 'new' && type === 'open') {
        const account = await accountOf(drupalUrl, payload.token)
        if (!account || !account.roles.includes('operator')) {
          return fail(hub, client, channel, 'Only an operator can open a demo session.')
        }
        const next = roomCode(codes, rand)
        codes.add(next)
        sessions.set(next, {
          code: next,
          operator: client.id,
          operatorName: account.name,
          opened: Date.now(),
          visitors: new Set(),
          consoles: new Set([client.id]),
          orders: new Map(),
        })
        try {
          await drupal.post('/jsonapi/message/demo_session', {
            data: { type: 'message--demo_session', attributes: { field_code: next } },
          })
        } catch (error) {
          log(`session ${next}: Drupal did not record it: ${error.message}`)
        }
        log(`session ${next} opened by ${account.name}`)
        return hub.send(client, 'session', channel, { code: next })
      }

      const s = sessions.get(code)
      if (!s || !s.visitors.has(client.id)) {
        return fail(hub, client, channel, 'Join the session first.')
      }

      // A visitor placed an order: proven by the cart token that owns it.
      if (type === 'placed') {
        const order = await orderForToken(drupalUrl, payload.uuid, payload.token)
        if (!order) return fail(hub, client, channel, 'That order is not yours.')
        const { id, ...rest } = order
        registry.remember(id, rest, code)
        try {
          await drupal.patch(`/jsonapi/orders/default/${order.id}`, {
            data: { type: 'order--default', id: order.id, attributes: { field_demo_session: code } },
          })
        } catch (error) {
          log(`session ${code}: order ${order.number} not marked: ${error.message}`)
        }
        log(`session ${code}: order ${order.number} placed`)
        return tellConsoles(hub, code, 'order:placed', { uuid: id, ...rest })
      }
    },
  }

  return handler
}

module.exports = { sessionHandler }
