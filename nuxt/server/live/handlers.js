/**
 * The storefront's own channels on the live socket: demo sessions, a
 * session's orders, one order, and who is looking at a product.
 * `@druxt-contrib/sockets` loads this under `nuxt dev`; start.js in
 * production. The hub speaks to Drupal as the `commerce_hub` consumer.
 */
const socketServer = require('@druxt-contrib/sockets/server')
const { createHubClient, accountOf, orderForToken } = require('./drupal')
const { sessionHandler } = require('./sessions')
const { ordersHandler } = require('./orders')
const { productHandler } = require('./products')
const { cartHandler } = require('./carts')
const { assistHandler } = require('./assist')

module.exports = ({ drupalUrl, log = () => {} } = {}) => {
  const hubSecret = process.env.DRUXT_HUB_SECRET || 'hub-secret-for-local-only'
  const drupal = createHubClient({
    drupalUrl,
    clientId: process.env.DRUXT_HUB_CLIENT_ID || 'commerce_hub',
    clientSecret: hubSecret,
  })
  const session = sessionHandler({ drupal, drupalUrl, accountOf, orderForToken, log })
  const { orders, order, onTags } = ordersHandler({
    registry: session.registry,
    drupal,
    drupalUrl,
    accountOf,
    orderForToken,
    log,
  })
  const product = productHandler({ drupal, log })
  const handlers = {
    session,
    orders,
    order,
    product: product.handler,
    catalogue: product.catalogue,
    cart: cartHandler({ orderForToken, drupalUrl, log }).handler,
    assist: assistHandler({ drupal, drupalUrl, accountOf, registry: session.registry, secret: hubSecret, log }),
  }
  // Cart counts start from Drupal's carts as they are now.
  product.refresh()

  // The sockets server tells open pages about purged tags; order rooms hear
  // theirs after that. Under `nuxt dev` the module attaches the server right
  // after loading this file, so the wrap waits a tick for it.
  const wrapped = new WeakSet()
  const watch = (sockets) => {
    if (!sockets || wrapped.has(sockets)) return
    wrapped.add(sockets)
    const contentChanged = sockets.contentChanged.bind(sockets)
    sockets.contentChanged = (tags) => {
      contentChanged(tags)
      onTags(tags).catch((error) => log(`live: ${error.message}`))
      product.onTags(tags)
    }
  }
  setImmediate(() => watch(socketServer.current()))

  const allTags = (tags) => {
    product.onTags(tags)
    return onTags(tags)
  }
  Object.defineProperty(handlers, 'onTags', { value: allTags, enumerable: false })
  Object.defineProperty(handlers, 'watch', { value: watch, enumerable: false })
  return handlers
}
