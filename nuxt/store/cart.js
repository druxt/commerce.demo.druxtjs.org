// The cart, backed by Drupal Commerce over commerce_api.
//
// Drupal owns the order. This store holds no independent state beyond what the
// last response said, so there is no cache to fall out of step. Every mutation
// posts to Drupal and then re-reads the cart, because Commerce recalculates
// totals, tax and promotions server-side and a locally computed total would be
// a guess.
//
// Calls go to `/jsonapi/...` on this origin, which Nuxt proxies to Drupal.
// They go through the Druxt client's axios instance, so the demo layer's
// request log sees them like every other request.
//
// The cart belongs to a token this browser makes once and keeps, sent as
// commerce_api's `Commerce-Cart-Token` header. A cookie would do for the cart
// alone, but the token is also what the browser shows the live hub to prove an
// order is its own, and a cookie cannot be read for that.

const API = '/jsonapi'
const JSON_API = 'application/vnd.api+json'
const TOKEN_KEY = 'commerceCartToken'

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

// Every response is JSON:API, and its errors are a documented shape. Reading
// them here means callers get a usable message rather than "request failed".
const request = async (axios, url, options = {}) => {
  const res = await axios.request({
    url,
    method: options.method || 'GET',
    data: options.body,
    headers: {
      Accept: JSON_API,
      'Content-Type': JSON_API,
      ...(cartToken() ? { 'Commerce-Cart-Token': cartToken() } : {}),
      ...(options.headers || {}),
    },
    withCredentials: true,
    validateStatus: () => true,
  })
  const body = res.data && typeof res.data === 'object' ? res.data : {}
  if (body.errors) {
    const error = new Error(body.errors[0].detail || body.errors[0].title || 'Request failed')
    // Drupal's own answer: the request reached it and was refused.
    error.drupal = true
    throw error
  }
  if (res.status >= 400) throw new Error(`${res.status} ${res.statusText}`)
  return body
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
  // cart per store; this demo has one store, so the first is the cart.
  async load({ commit }) {
    try {
      const body = await request(this.$druxt.axios, `${API}/carts?include=order_items`)
      const order = (body.data || [])[0]
      if (!order) return commit('setCart', { order: undefined, lines: [] })

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
          unitPrice: (item.attributes.unit_price || {}).formatted || '',
          total: (item.attributes.total_price || {}).formatted || '',
        }))

      // Flatten the resource: getters read `total_price` and friends directly,
      // and keeping `attributes` nested made them silently undefined.
      commit('setCart', { order: { id: order.id, type: order.type, ...order.attributes }, lines })
    } catch (error) {
      commit('setError', error.message)
    }
  },

  // `title` is for whoever watches the store (the live layer names what was
  // added); Drupal is told the variation.
  async add({ commit, dispatch }, { type, id, quantity = 1 }) {
    commit('setBusy', true)
    commit('setError', undefined)
    try {
      await request(this.$druxt.axios, `${API}/cart/add`, {
        method: 'POST',
        body: JSON.stringify({ data: [{ type, id, meta: { quantity } }] }),
      })
      await dispatch('load')
      // The cart shows itself with the new line.
      // open: the drawer would cover it, and the button there says Added.
      commit('setDrawer', true)
    } catch (error) {
      commit('setError', error.message)
    } finally {
      commit('setBusy', false)
    }
  },

  async remove({ state, commit, dispatch }, line) {
    commit('setBusy', true)
    try {
      await request(this.$druxt.axios, `${API}/carts/${state.order.id}/items`, {
        method: 'DELETE',
        body: JSON.stringify({ data: [{ type: line.type, id: line.id }] }),
      })
      await dispatch('load')
    } catch (error) {
      commit('setError', error.message)
    } finally {
      commit('setBusy', false)
    }
  },

  // Checkout writes go to commerce_api's checkout resource on the cart's
  // order: contact and billing first, then the payment instrument, then the
  // payment itself, which places the order. Each returns Drupal's document.
  async checkout({ state }, attributes) {
    return request(this.$druxt.axios, `${API}/checkout/${state.order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { type: 'order--default', id: state.order.id, attributes } }),
    })
  },

  async pay({ state, dispatch }) {
    const body = await request(this.$druxt.axios, `${API}/checkout/${state.order.id}/payment`, {
      method: 'POST',
      body: JSON.stringify({ data: { type: 'payment--payment-default', attributes: { capture: true } } }),
    })
    // The order is no longer a cart; the next read gives an empty one.
    await dispatch('load')
    return body
  },

  // A placed order, by id, readable by the browser that placed it.
  async order(context, id) {
    return request(this.$druxt.axios, `${API}/checkout/${id}`)
  },

  // The shipping rates Commerce offers this order, once it has an address.
  async shippingRates({ state }) {
    const body = await request(this.$druxt.axios, `${API}/checkout/${state.order.id}/shipping-methods`)
    return (body.data || []).map((rate) => ({
      id: rate.id,
      label: ((rate.attributes || {}).service || {}).label || rate.id,
      description: (rate.attributes || {}).description || '',
      amount: ((rate.attributes || {}).amount || {}).formatted || '',
    }))
  },

  async setQuantity({ state, commit, dispatch }, { line, quantity }) {
    if (quantity < 1) return dispatch('remove', line)
    commit('setBusy', true)
    try {
      await request(this.$druxt.axios, `${API}/carts/${state.order.id}/items/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ data: { type: line.type, id: line.id, attributes: { quantity } } }),
      })
      await dispatch('load')
    } catch (error) {
      commit('setError', error.message)
    } finally {
      commit('setBusy', false)
    }
  },
}
