// The cart, backed by Drupal Commerce over commerce_api.
//
// Drupal owns the order. This store holds no independent state beyond what the
// last response said, so there is no cache to fall out of step. Every mutation
// posts to Drupal and then re-reads the cart, because Commerce recalculates
// totals, tax and promotions server-side and a locally computed total would be
// a guess.
//
// Calls go through the Druxt client, `this.$druxt`. The order and its items
// are core JSON:API resources, so the client reads them by type.
// commerce_api's cart and checkout routes are not, so those go through the
// client's axios instance. Either way the demo layer's request log sees them
// like every other request.
//
// The cart belongs to a token this browser makes once and keeps, sent as
// commerce_api's `Commerce-Cart-Token` header. A cookie would do for the cart
// alone, but the token is also what the browser shows the live hub to prove an
// order is its own, and a cookie cannot be read for that.

const JSON_API = 'application/vnd.api+json'
const TOKEN_KEY = 'commerceCartToken'
const TOKEN_HEADER = 'Commerce-Cart-Token'

// randomUUID needs a secure context, and getRandomValues does not.
const randomToken = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')

const SHARED_KEY = 'commerceCartShared'

/** A room's token, held by this tab while it shops with someone. */
const sharedToken = () => {
  try {
    return window.sessionStorage.getItem(SHARED_KEY) || ''
  } catch (e) {
    return ''
  }
}

/** Shop with someone: their cart's token is this tab's until it leaves. */
export const adoptToken = (token) => {
  try {
    window.sessionStorage.setItem(SHARED_KEY, token)
  } catch (e) {
    // No storage: the shared cart lasts as long as the page.
  }
}

export const dropToken = () => {
  try {
    window.sessionStorage.removeItem(SHARED_KEY)
  } catch (e) {
    // Nothing held.
  }
}

/** The cart token this tab shops with: a room's while in one, else its own, made on first use. Empty on the server. */
export const cartToken = () => {
  if (typeof window === 'undefined') return ''
  const shared = sharedToken()
  if (shared) return shared
  try {
    let token = window.localStorage.getItem(TOKEN_KEY)
    if (!token) {
      token = randomToken()
      window.localStorage.setItem(TOKEN_KEY, token)
    }
    return token
  } catch (e) {
    // No storage: the session cookie carries the cart instead.
    return ''
  }
}

// The token rides on the client's headers, so every request it makes carries
// it. A shared room swaps the token under the store, so each action checks
// the client still holds this tab's before it asks Drupal anything.
const carryToken = (druxt) => {
  const token = cartToken()
  if (token && druxt.axios.defaults.headers.common[TOKEN_HEADER] !== token) {
    druxt.addHeaders({ [TOKEN_HEADER]: token })
  }
}

// commerce_api's cart and checkout routes are custom JSON:API resources. They
// are not in the index, so no client method can address them by type, and
// the client has no DELETE. They take the client's axios instance instead,
// and a failure goes through the client's own error handling.
const commerce = async (druxt, method, path, data) => {
  const url = `${druxt.options.endpoint}${path}`
  try {
    const res = await druxt.axios.request({
      method,
      url,
      data: data && { data },
      headers: { 'Content-Type': JSON_API },
    })
    return res.data
  } catch (error) {
    druxt.error(error, { url })
  }
}

// The client's errors lead with the status and URL, for a log. A shopper is
// shown the JSON:API error Drupal gave, from the response the error keeps.
const reason = (error) => {
  const res = error.response
  const first = ((((res || {}).data || {}).errors) || [])[0] || {}
  return first.detail || first.title || (res ? `${res.status} ${res.statusText}` : error.message)
}

// For the actions that throw to a caller, which shows the message. An error
// with JSON:API errors in it is Drupal's own answer: the request reached it
// and was refused.
const withReason = async (request) => {
  try {
    return await request()
  } catch (error) {
    const thrown = new Error(reason(error))
    thrown.drupal = !!((((error.response || {}).data || {}).errors) || []).length
    throw thrown
  }
}

export const state = () => ({
  order: undefined,
  lines: [],
  busy: false,
  error: undefined,
  // The drawer: the cart in the layout, on every route.
  drawer: false,
})

export const getters = {
  count: (state) => state.lines.reduce((n, line) => n + line.quantity, 0),
  total: (state) => ((state.order || {}).total_price || {}).formatted || '',
  subtotal: (state) => ((((state.order || {}).order_total || {}).subtotal) || {}).formatted || '',
  isEmpty: (state) => !state.lines.length,
  orderId: (state) => (state.order || {}).id,
  // A line's product and image, from the catalogue the rest of the store holds.
  productOf: (state, getters, rootState) => (line) =>
    rootState.catalogue.items.find((p) => p.variations.some((v) => v.id === line.variationId)) || null,
  imageOf: (state, getters) => (line) => (getters.productOf(line) || {}).image || '',
  pathOf: (state, getters) => (line) => (getters.productOf(line) || {}).path || '',
  token: () => cartToken(),
  shared: () => typeof window !== 'undefined' && !!sharedToken(),
}

export const mutations = {
  setCart(state, { order, lines }) {
    state.order = order
    state.lines = lines
  },
  setBusy(state, busy) {
    state.busy = busy
  },
  setError(state, error) {
    state.error = error
  },
  setDrawer(state, open) {
    state.drawer = open
  },
}

export const actions = {
  // Read the cart. Commerce returns a collection because a site can have one
  // cart per store; this demo has one store, so the first is the cart. Only
  // its id is needed from commerce_api. The client then reads the order and
  // its items by type. It asks Drupal itself rather than going through the
  // Druxt store, since each action changes the cart and a stored copy would
  // be stale.
  async load({ commit }) {
    try {
      carryToken(this.$druxt)
      const { data: carts } = await this.$druxt.get(`${this.$druxt.options.endpoint}/carts`, {
        params: { 'fields[order--default]': 'state' },
      })
      const cart = (carts.data || [])[0]
      if (!cart) return commit('setCart', { order: undefined, lines: [] })

      const body = await this.$druxt.getResource(cart.type, cart.id, { include: 'order_items' })
      const order = body.data
      const included = body.included || []
      const refs = ((order.relationships || {}).order_items || {}).data || []
      const lines = refs
        .map((ref) => included.find((r) => r.id === ref.id && r.type === ref.type))
        .filter(Boolean)
        .map((item) => ({
          id: item.id,
          type: item.type,
          title: item.attributes.title,
          quantity: Number(item.attributes.quantity),
          // The variation bought, which the catalogue knows the product and image of.
          variationId: ((((item.relationships || {}).purchased_entity || {}).data) || {}).id || '',
          unitPrice: (item.attributes.unit_price || {}).formatted || '',
          total: (item.attributes.total_price || {}).formatted || '',
        }))

      // Flatten the resource: getters read `total_price` and friends directly,
      // and keeping `attributes` nested made them silently undefined.
      commit('setCart', { order: { id: order.id, type: order.type, ...order.attributes }, lines })
    } catch (error) {
      commit('setError', reason(error))
    }
  },

  // `title` is for whoever watches the store (the live layer names what was
  // added); Drupal is told the variation.
  async add({ commit, dispatch, rootState }, { type, id, quantity = 1 }) {
    commit('setBusy', true)
    commit('setError', undefined)
    try {
      carryToken(this.$druxt)
      await commerce(this.$druxt, 'post', '/cart/add', [{ type, id, meta: { quantity } }])
      await dispatch('load')
      // The cart shows itself with the new line, unless the assist panel is
      // open: the drawer would cover it, and the button there says Added.
      if (!rootState.assist.open) commit('setDrawer', true)
    } catch (error) {
      commit('setError', reason(error))
    } finally {
      commit('setBusy', false)
    }
  },

  async remove({ state, commit, dispatch }, line) {
    commit('setBusy', true)
    try {
      carryToken(this.$druxt)
      await commerce(this.$druxt, 'delete', `/carts/${state.order.id}/items`, [{ type: line.type, id: line.id }])
      await dispatch('load')
    } catch (error) {
      commit('setError', reason(error))
    } finally {
      commit('setBusy', false)
    }
  },

  // Checkout writes go to commerce_api's checkout resource on the cart's
  // order: contact and billing first, then the payment instrument, then the
  // payment itself, which places the order. Each returns Drupal's document.
  async checkout({ state }, attributes) {
    carryToken(this.$druxt)
    const { id } = state.order
    return withReason(() =>
      commerce(this.$druxt, 'patch', `/checkout/${id}`, { type: 'order--default', id, attributes })
    )
  },

  async pay({ state, dispatch }) {
    carryToken(this.$druxt)
    const body = await withReason(() =>
      commerce(this.$druxt, 'post', `/checkout/${state.order.id}/payment`, {
        type: 'payment--payment-default',
        attributes: { capture: true },
      })
    )
    // The order is no longer a cart; the next read gives an empty one.
    await dispatch('load')
    return body
  },

  // A placed order, by id, readable by the browser that placed it.
  async order(context, id) {
    carryToken(this.$druxt)
    return withReason(() => this.$druxt.getResource('order--default', id))
  },

  // The shipping rates Commerce offers this order, once it has an address.
  async shippingRates({ state }) {
    carryToken(this.$druxt)
    const body = await withReason(() => commerce(this.$druxt, 'get', `/checkout/${state.order.id}/shipping-methods`))
    return (body.data || []).map((rate) => ({
      id: rate.id,
      label: ((rate.attributes || {}).service || {}).label || rate.id,
      description: (rate.attributes || {}).description || '',
      amount: ((rate.attributes || {}).amount || {}).formatted || '',
    }))
  },

  // A line is an order item, which core JSON:API serves, but the client's
  // updateResource saves the item alone and the order keeps its old total.
  // commerce_api's route saves the order too, so Commerce recalculates it.
  async setQuantity({ state, commit, dispatch }, { line, quantity }) {
    if (quantity < 1) return dispatch('remove', line)
    commit('setBusy', true)
    try {
      carryToken(this.$druxt)
      await commerce(this.$druxt, 'patch', `/carts/${state.order.id}/items/${line.id}`, {
        type: line.type,
        id: line.id,
        attributes: { quantity },
      })
      await dispatch('load')
    } catch (error) {
      commit('setError', reason(error))
    } finally {
      commit('setBusy', false)
    }
  },
}
