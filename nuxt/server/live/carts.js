/**
 * Cart rooms: one cart, several phones. The owner opens a room with the cart
 * token that owns the cart; the hub keeps the token and hands it, once and
 * privately, to whoever the code admits. Members hear each other's changes
 * and the checkout that closes the room, checked against the room's own
 * token. The token is never broadcast and never in a URL.
 */
const { roomCode, isCode } = require('./code')
const { UUID } = require('./drupal')

const cartHandler = ({ orderForToken, drupalUrl, rand = Math.random, log = () => {} } = {}) => {
  const rooms = new Map()
  const codes = new Set()

  const fail = (hub, client, channel, message) => hub.send(client, 'error', channel, { message })
  const membersOf = (hub, room, channel) =>
    hub.members(channel).map((m) => ({ id: m.id, name: m.name || m.id, owner: m.id === room.owner }))
  const tellMembers = (hub, room, channel) =>
    hub.broadcast(channel, 'members', { members: membersOf(hub, room, channel) })
  const end = (code) => {
    rooms.delete(code)
    codes.delete(code)
  }

  const handler = {
    join(hub, channel, client) {
      const code = channel.slice('cart:'.length)
      if (code === 'new') return
      const room = isCode(code) && rooms.get(code)
      if (!room) return fail(hub, client, channel, 'That room has ended.')
      hub.send(client, 'token', channel, {
        token: room.token,
        owner: room.owner,
        members: membersOf(hub, room, channel),
      })
      tellMembers(hub, room, channel)
    },

    leave(hub, channel) {
      const code = channel.slice('cart:'.length)
      const room = rooms.get(code)
      if (!room) return
      if (!hub.members(channel).length) return end(code)
      tellMembers(hub, room, channel)
    },

    async message(hub, channel, client, type, payload = {}) {
      const code = channel.slice('cart:'.length)
      if (code === 'new' && type === 'open') {
        const token = String(payload.token || '')
        if (!token) return fail(hub, client, channel, 'No cart to share.')
        const next = roomCode(codes, rand)
        codes.add(next)
        rooms.set(next, { code: next, token, owner: client.id, opened: Date.now() })
        log(`cart room ${next} opened`)
        return hub.send(client, 'room', channel, { code: next })
      }
      const room = isCode(code) && rooms.get(code)
      if (!room) return fail(hub, client, channel, 'That room has ended.')
      if (!hub.members(channel).some((m) => m.id === client.id)) {
        return fail(hub, client, channel, 'Join the room first.')
      }
      const who = { by: client.id, byName: client.name || client.id }
      if (type === 'changed') {
        // What changed, in two bounded words: a verb from a short list and
        // the line's title, so a member cannot make the room say anything.
        const what = payload.what || {}
        const verb = ['added', 'removed', 'changed'].includes(what.verb) ? what.verb : 'changed'
        const title = String(what.title || '').slice(0, 120)
        return hub.broadcast(channel, 'changed', { ...who, what: { verb, title } })
      }
      if (type === 'placed') {
        if (!UUID.test(payload.uuid || '')) return fail(hub, client, channel, 'No such order.')
        // Checked against the room's token, never the sender's.
        const order = await orderForToken(drupalUrl, payload.uuid, room.token)
        if (!order) return fail(hub, client, channel, 'That order is not this cart.')
        // Another member's order closed the room while this one was checked.
        if (rooms.get(code) !== room) return
        end(code)
        log(`cart room ${code} closed by order ${order.number}`)
        return hub.broadcast(channel, 'closed', { number: order.number, ...who })
      }
    },
  }

  return { handler, rooms }
}

module.exports = { cartHandler }
