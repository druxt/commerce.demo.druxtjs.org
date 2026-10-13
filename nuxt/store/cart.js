// The cart, backed by Drupal Commerce over commerce_api.
//
// Drupal owns the order. This store holds no independent state beyond what the
// last response said, so there is no cache to fall out of step. Every mutation
// posts to Drupal and then re-reads the cart, because Commerce recalculates
// totals, tax and promotions server-side and a locally computed total would be
// a guess.
//
// Calls go to `/jsonapi/...` on this origin, which Nuxt proxies to Drupal. That
// matters for more than tidiness: the anonymous cart is tied to a session
// cookie, and a same-origin request carries it without any CORS or credentials
// handling. They go through the Druxt client's axios instance, so the demo
// layer's request log sees them like every other request.

const API = '/jsonapi'
const JSON_API = 'application/vnd.api+json'

// Every response is JSON:API, and its errors are a documented shape. Reading
// them here means callers get a usable message rather than "request failed".
const request = async (axios, url, options = {}) => {
  const res = await axios.request({
    url,
    method: options.method || 'GET',
    data: options.body,
    headers: { Accept: JSON_API, 'Content-Type': JSON_API, ...(options.headers || {}) },
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
})

export const getters = {
  count: (state) => state.lines.reduce((n, line) => n + line.quantity, 0),
  total: (state) => ((state.order || {}).total_price || {}).formatted || '',
  subtotal: (state) => ((((state.order || {}).order_total || {}).subtotal) || {}).formatted || '',
  isEmpty: (state) => !state.lines.length,
  orderId: (state) => (state.order || {}).id,
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

  async add({ commit, dispatch }, { type, id, quantity = 1 }) {
    commit('setBusy', true)
    commit('setError', undefined)
    try {
      await request(this.$druxt.axios, `${API}/cart/add`, {
        method: 'POST',
        body: JSON.stringify({ data: [{ type, id, meta: { quantity } }] }),
      })
      await dispatch('load')
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
