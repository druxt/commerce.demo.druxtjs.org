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
const SHIPMENT_TAG = /^commerce_shipment:(\d+)$/
// commerce_api hides Drupal's internal ids; commerce_demo_live gives the
// order's and the shipment's back, which is what the purged tags name. The
// order comes with its shipments, so the state of the first is the order's
// shipping state.
const ORDER_FIELDS =
  'include=shipments&fields[order--default]=order_number,state,field_demo_session,shipments&fields[shipment--default]=state'
const ORDER_PATH = (id) => `/jsonapi/orders/default?filter[order_id]=${encodeURIComponent(id)}&${ORDER_FIELDS}`
const ORDER_BY_UUID = (uuid) => `/jsonapi/orders/default/${uuid}?${ORDER_FIELDS}`
const SHIPMENT_PATH = (id) =>
  `/jsonapi/shipments/default?filter[shipment_id]=${encodeURIComponent(id)}&fields[shipment--default]=order_id`

/** The order's state and its first shipment's, from an order document. */
const stateOf = (found, body = {}) => {
  const attributes = found.attributes || {}
  const ref = ((((found.relationships || {}).shipments || {}).data) || [])[0]
  const shipment = ref && (body.included || []).find((r) => r.id === ref.id)
  return {
    uuid: found.id,
    number: attributes.order_number,
    state: attributes.state,
    shipment: shipment ? (shipment.attributes || {}).state : null,
    shipmentId: ref ? ref.id : null,
  }
}

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
      // The shipment's state comes from the hub's own read of the order.
      let shipped = {}
      try {
        const body = await drupal.get(ORDER_BY_UUID(uuid))
        if (body.data) shipped = stateOf(body.data, body)
      } catch (error) {
        log(`order ${uuid}: shipments not read: ${error.message}`)
      }
      hub.send(client, 'order:state', channel, { uuid, number: found.number, state: found.state, shipment: shipped.shipment || null })
    },
  }

  /**
   * Drupal purged these tags. Each order among them is read again as the hub
   * and its new state told to its room and its session's consoles.
   *
   * @param {string[]} tags - The purged cache tags.
   */
  const tell = (found, body) => {
    const payload = stateOf(found, body)
    tellRoom(hubApi, found.id, 'order:state', payload)
    const code = (found.attributes || {}).field_demo_session || registry.sessionOf(found.id)
    if (code) {
      registry.remember(found.id, { number: payload.number, state: payload.state, shipment: payload.shipment, shipmentId: payload.shipmentId }, code)
      registry.tellConsoles(code, 'order:state', payload)
    }
  }

  const onTags = async (tags = []) => {
    if (!hubApi) return
    // Read one at a time, however many there are: a bulk change purges many
    // orders at once, and a cut-off would leave some rooms on the old state.
    const ids = [...new Set(tags.map((t) => (ORDER_TAG.exec(t) || [])[1]).filter(Boolean))]
    for (const id of ids) {
      let body
      try {
        body = await drupal.get(ORDER_PATH(id))
      } catch (error) {
        log(`order ${id}: not read after purge: ${error.message}`)
        continue
      }
      for (const found of body.data || []) tell(found, body)
    }
    // A shipment moved on its own: its order's room and consoles hear it.
    const shipments = [...new Set(tags.map((t) => (SHIPMENT_TAG.exec(t) || [])[1]).filter(Boolean))]
    for (const id of shipments) {
      try {
        const found = await drupal.get(SHIPMENT_PATH(id))
        const orderRef = ((((found.data || [])[0] || {}).relationships || {}).order_id || {}).data
        if (!orderRef) continue
        const body = await drupal.get(ORDER_BY_UUID(orderRef.id))
        if (body.data) tell(body.data, body)
      } catch (error) {
        log(`shipment ${id}: not read after purge: ${error.message}`)
      }
    }
  }

  return { orders, order, onTags, owners }
}

module.exports = { ordersHandler }
