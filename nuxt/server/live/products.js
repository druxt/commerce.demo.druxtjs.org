/**
 * Product rooms and the catalogue's live numbers: who has a product page
 * open, how many carts hold a product, and how many units are left. Counts
 * and levels, nothing more. A product page joins `product:<uuid>` and hears
 * `looking`, `carts` and `stock` for its product. The catalogue joins
 * `catalogue:live` and hears `carts` and `stock` for everything, so a card
 * can say "in 2 carts" or "only 1 left". The numbers come from Drupal, read
 * as the hub after a purge of an order tag, so a checkout in one browser
 * moves them in every other.
 */
const ORDER_TAG = /^commerce_order(:|_list)|^commerce_product_variation/

const CARTS_PATH =
  '/jsonapi/orders/default?filter[cart]=1&include=order_items.purchased_entity' +
  '&fields[order--default]=order_items&fields[order-item--default]=purchased_entity&page[limit]=50'
const STOCK_PATHS = [
  '/jsonapi/product-variations/physical?fields[product-variation--physical]=sku,stock,product_id&page[limit]=50',
  '/jsonapi/product-variations/media-physical?fields[product-variation--media-physical]=sku,stock,product_id&page[limit]=50',
]

/**
 * Every page of a collection, up to twenty, as one document. A page holds 50,
 * and a SKU or a cart past the first would read as gone.
 */
const readAll = async (drupal, path, pages = 20) => {
  const all = { data: [], included: [] }
  for (let next = path; next && pages--; ) {
    const body = await drupal.get(next)
    all.data.push(...(body.data || []))
    all.included.push(...(body.included || []))
    next = ((body.links || {}).next || {}).href
  }
  return all
}

/** Distinct carts per product uuid, from Drupal's carts with their items. */
const countCarts = (body = {}) => {
  const included = new Map((body.included || []).map((r) => [`${r.type}:${r.id}`, r]))
  const counts = new Map()
  for (const order of body.data || []) {
    const products = new Set()
    for (const ref of ((order.relationships || {}).order_items || {}).data || []) {
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

/** Stock per SKU and the product each SKU belongs to, from the variations. */
const readStock = (bodies = []) => {
  const levels = new Map()
  const productOf = new Map()
  for (const body of bodies) {
    for (const v of (body || {}).data || []) {
      const sku = (v.attributes || {}).sku
      if (!sku) continue
      const level = (v.attributes || {}).stock
      levels.set(sku, typeof level === 'number' ? level : null)
      const product = (((v.relationships || {}).product_id || {}).data || {}).id
      if (product) productOf.set(sku, product)
    }
  }
  return { levels, productOf }
}

const productHandler = ({ drupal, log = () => {}, debounceMs = 400, setTimer = setTimeout } = {}) => {
  let counts = new Map()
  let stock = { levels: new Map(), productOf: new Map() }
  let hubApi = null
  let timer = null

  const tellLooking = (hub, channel) =>
    hub.broadcast(channel, 'looking', { count: hub.members(channel).length })

  const productId = (channel) => channel.slice('product:'.length)
  const cartsOf = (channel) => counts.get(productId(channel)) || 0
  const stockOf = (product) => {
    const out = {}
    for (const [sku, owner] of stock.productOf) if (owner === product) out[sku] = stock.levels.get(sku)
    return out
  }
  const allStock = () => Object.fromEntries(stock.levels)
  const allCarts = () => Object.fromEntries(counts)

  /** Read the carts and the stock again and tell every room whose numbers moved. */
  const refresh = async () => {
    if (!drupal) return
    let cartsBody
    let stockBodies
    try {
      cartsBody = await readAll(drupal, CARTS_PATH)
      stockBodies = await Promise.all(STOCK_PATHS.map((p) => readAll(drupal, p).catch(() => ({ data: [] }))))
    } catch (error) {
      return log(`carts: not read: ${error.message}`)
    }
    const nextCounts = countCarts(cartsBody)
    const nextStock = readStock(stockBodies)
    const movedCarts = new Set([...counts.keys(), ...nextCounts.keys()].filter((id) => (counts.get(id) || 0) !== (nextCounts.get(id) || 0)))
    const movedSkus = [...new Set([...stock.levels.keys(), ...nextStock.levels.keys()])].filter((sku) => stock.levels.get(sku) !== nextStock.levels.get(sku))
    counts = nextCounts
    stock = nextStock
    if (!hubApi) return
    for (const id of movedCarts) {
      const channel = `product:${id}`
      if (hubApi.members(channel).length) hubApi.broadcast(channel, 'carts', { count: nextCounts.get(id) || 0 })
    }
    const movedProducts = new Set(movedSkus.map((sku) => stock.productOf.get(sku)).filter(Boolean))
    for (const id of movedProducts) {
      const channel = `product:${id}`
      if (hubApi.members(channel).length) hubApi.broadcast(channel, 'stock', { levels: stockOf(id) })
    }
    if (hubApi.members('catalogue:live').length) {
      if (movedCarts.size) hubApi.broadcast('catalogue:live', 'carts', { counts: Object.fromEntries([...movedCarts].map((id) => [id, nextCounts.get(id) || 0])) })
      if (movedSkus.length) hubApi.broadcast('catalogue:live', 'stock', { levels: Object.fromEntries(movedSkus.map((sku) => [sku, stock.levels.get(sku)])) })
    }
  }

  const handler = {
    join(hub, channel, client) {
      hubApi = hub
      tellLooking(hub, channel)
      hub.send(client, 'carts', channel, { count: cartsOf(channel) })
      hub.send(client, 'stock', channel, { levels: stockOf(productId(channel)) })
    },
    leave(hub, channel) {
      hubApi = hub
      tellLooking(hub, channel)
    },
  }

  /** The catalogue's room: every count and level on join, the changes after. */
  const catalogue = {
    join(hub, channel, client) {
      hubApi = hub
      hub.send(client, 'carts', channel, { counts: allCarts() })
      hub.send(client, 'stock', channel, { levels: allStock() })
    },
  }

  /** Drupal purged these tags; an order among them means a cart or the stock may have moved. */
  const onTags = (tags = []) => {
    if (!tags.some((t) => ORDER_TAG.test(t))) return
    if (timer) return
    timer = setTimer(() => {
      timer = null
      return refresh()
    }, debounceMs)
  }

  return { handler, catalogue, onTags, refresh, counts: () => counts, stock: () => stock }
}

module.exports = { productHandler, countCarts, readStock, CARTS_PATH, STOCK_PATHS }
