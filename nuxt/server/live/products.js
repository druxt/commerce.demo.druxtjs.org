/**
 * Product rooms: who has a product page open, and how many carts hold it,
 * as counts and nothing more. A product page joins `product:<uuid>`;
 * everyone in the room hears `looking` whenever the count changes, and
 * `carts` whenever a cart changes. The cart counts come from Drupal, read
 * as the hub after a purge of an order tag, so adding to a cart in one
 * browser moves the number in every other.
 */
const ORDER_TAG = /^commerce_order(:|_list)/

const CARTS_PATH =
  '/jsonapi/orders/default?filter[cart]=1&include=order_items.purchased_entity' +
  '&fields[order--default]=order_items&fields[order-item--default]=purchased_entity&page[limit]=50'

/** Distinct carts per product uuid, from Drupal's carts with their items. */
const countCarts = (body = {}) => {
  const included = new Map((body.included || []).map((r) => [`${r.type}:${r.id}`, r]))
  const counts = new Map()
  for (const order of body.data || []) {
    const products = new Set()
    for (const ref of (((order.relationships || {}).order_items || {}).data || [])) {
      const item = included.get(`${ref.type}:${ref.id}`)
      const bought = item && (((item.relationships || {}).purchased_entity || {}).data || null)
      const variation = bought && included.get(`${bought.type}:${bought.id}`)
      const product = variation && (((variation.relationships || {}).product_id || {}).data || {}).id
      if (product) products.add(product)
    }
    for (const product of products) counts.set(product, (counts.get(product) || 0) + 1)
  }
  return counts
}

const productHandler = ({ drupal, log = () => {}, debounceMs = 400, setTimer = setTimeout } = {}) => {
  let counts = new Map()
  let hubApi = null
  let timer = null

  const tellLooking = (hub, channel) =>
    hub.broadcast(channel, 'looking', { count: hub.members(channel).length })

  const cartsOf = (channel) => counts.get(channel.slice('product:'.length)) || 0

  /** Read the carts again and tell every room whose count moved. */
  const refresh = async () => {
    if (!drupal) return
    let body
    try {
      body = await drupal.get(CARTS_PATH)
    } catch (error) {
      return log(`carts: not read: ${error.message}`)
    }
    const next = countCarts(body)
    const changed = new Set([...counts.keys(), ...next.keys()].filter((id) => (counts.get(id) || 0) !== (next.get(id) || 0)))
    counts = next
    if (!hubApi) return
    for (const id of changed) {
      const channel = `product:${id}`
      if (hubApi.members(channel).length) hubApi.broadcast(channel, 'carts', { count: next.get(id) || 0 })
    }
  }

  const handler = {
    join(hub, channel, client) {
      hubApi = hub
      tellLooking(hub, channel)
      hub.send(client, 'carts', channel, { count: cartsOf(channel) })
    },
    leave(hub, channel) {
      hubApi = hub
      tellLooking(hub, channel)
    },
  }

  /** Drupal purged these tags; an order among them means a cart may have changed. */
  const onTags = (tags = []) => {
    if (!tags.some((t) => ORDER_TAG.test(t))) return
    if (timer) return
    timer = setTimer(() => {
      timer = null
      refresh()
    }, debounceMs)
  }

  return { handler, onTags, refresh, counts: () => counts }
}

module.exports = { productHandler, countCarts, CARTS_PATH }
