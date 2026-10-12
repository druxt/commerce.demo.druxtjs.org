/**
 * Orders on the hub.
 *
 * `orders:<code>` is a session's console channel: a console joins and sends
 * `claim` with its operator token, and from then on hears the session's
 * orders. `order:<uuid>` is one order's room: the browser that placed it
 * joins and sends `claim` with its cart token, which Drupal checks, and
 * from then on hears the order's state. Drupal's purge of an order's cache
 * tag is what moves the state: the hub reads the order as itself and tells
 * the room and the session's consoles.
 *
 * Nothing here is broadcast: a room may hold a client that joined and never
 * proved anything, and it hears nothing.
 */
const { isCode } = require('./code')
const { UUID } = require('./drupal')

const ORDER_TAG = /^commerce_order:(\d+)$/
// commerce_api hides Drupal's internal ids; commerce_demo_live gives the
// order's back as `order_id`, which is what the purged tag names.
const ORDER_PATH = (id) =>
  `/jsonapi/orders/default?filter[order_id]=${encodeURIComponent(id)}&fields[order--default]=order_number,state,field_demo_session`

const ordersHandler = ({ registry, drupal, drupalUrl, accountOf, orderForToken, log = () => {} } = {}) => {
  // Order rooms: uuid to the client ids that proved the cart token.
  const owners = new Map()
  let hubApi = null

  const fail = (hub, client, channel, message) =>
    hub.send(client, 'error', channel, { message })

  const tellRoom = (hub, uuid, type, payload) => {
    const allowed = owners.get(uuid) || new Set()
    for (const member of hub.members(`order:${uuid}`)) {
      if (allowed.has(member.id)) hub.send(member, type, `order:${uuid}`, payload)
    }
  }

  const orders = {
    join(hub) {
      hubApi = hub
    },

    async message(hub, channel, client, type, payload = {}) {
      hubApi = hub
      const code = channel.slice('orders:'.length)
      const session = isCode(code) && registry.get(code)
      // A proven console ends its session: the code is free, the room told.
      if (type === 'end') {
        if (!session || !session.consoles.has(client.id)) return
        registry.end(code)
        log(`session ${code} ended`)
        for (const member of hub.members(channel)) hub.send(member, 'ended', channel, { code })
        return
      }
      if (type !== 'claim') return
      if (!session) return fail(hub, client, channel, 'That demo session has ended.')
      const account = await accountOf(drupalUrl, payload.token)
      if (!account || !account.roles.includes('operator')) {
        return fail(hub, client, channel, 'Only an operator can watch a session.')
      }
      registry.allowConsole(code, client.id)
      hub.send(client, 'orders', channel, {
        code,
        orders: [...session.orders.entries()].map(([uuid, o]) => ({ uuid, ...o })),
      })
    },
  }

  const order = {
    join(hub) {
      hubApi = hub
    },

    leave(hub, channel, client) {
      const uuid = channel.slice('order:'.length)
      const set = owners.get(uuid)
      if (set) {
        set.delete(client.id)
        if (!set.size) owners.delete(uuid)
      }
    },

    async message(hub, channel, client, type, payload = {}) {
      hubApi = hub
      const uuid = channel.slice('order:'.length)
      if (type !== 'claim') return
      if (!UUID.test(uuid)) return fail(hub, client, channel, 'No such order.')
      const found = await orderForToken(drupalUrl, uuid, payload.token)
      if (!found) return fail(hub, client, channel, 'That order is not yours to follow.')
      if (!owners.has(uuid)) owners.set(uuid, new Set())
      owners.get(uuid).add(client.id)
      hub.send(client, 'order:state', channel, { uuid, number: found.number, state: found.state })
    },
  }

  /**
   * Drupal purged these tags. Each order among them is read again as the hub
   * and its new state told to its room and its session's consoles.
   *
   * @param {string[]} tags - The purged cache tags.
   */
  const onTags = async (tags = []) => {
    const ids = tags.map((t) => (ORDER_TAG.exec(t) || [])[1]).filter(Boolean)
    if (!ids.length || !hubApi) return
    for (const id of [...new Set(ids)].slice(0, 20)) {
      let body
      try {
        body = await drupal.get(ORDER_PATH(id))
      } catch (error) {
        log(`order ${id}: not read after purge: ${error.message}`)
        continue
      }
      for (const found of body.data || []) {
        const attributes = found.attributes || {}
        const payload = { uuid: found.id, number: attributes.order_number, state: attributes.state }
        tellRoom(hubApi, found.id, 'order:state', payload)
        const code = attributes.field_demo_session || registry.sessionOf(found.id)
        if (code) {
          registry.remember(found.id, { number: payload.number, state: payload.state }, code)
          registry.tellConsoles(code, 'order:state', payload)
        }
      }
    }
  }

  return { orders, order, onTags, owners }
}

module.exports = { ordersHandler }
