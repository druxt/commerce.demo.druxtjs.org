// The board's writes and Drupal's answers. The list itself lives in the
// session store, fed by the hub and by Drupal's own record.
export const state = () => ({ busy: {}, lastResponse: {}, error: '' })

export const mutations = {
  busy(state, { uuid, on }) {
    state.busy = { ...state.busy, [uuid]: on }
  },
  responded(state, { uuid, response }) {
    state.lastResponse = { ...state.lastResponse, [uuid]: response }
  },
  error(state, message) {
    state.error = message
  },
}

const JSON_API = 'application/vnd.api+json'

export const actions = {
  // Drupal's own list for the session, read as the operator. The hub's list
  // is what arrived while this console was open; this is the record.
  async load({ rootState, commit }) {
    const code = rootState.session.code
    if (!code) return
    const url =
      `/jsonapi/orders/default?filter[field_demo_session]=${encodeURIComponent(code)}` +
      '&sort=-changed&include=shipments&fields[order--default]=order_number,state,total_price,mail,placed,shipments&fields[shipment--default]=state'
    const res = await this.$axios
      .get(url, { headers: { Accept: JSON_API }, validateStatus: () => true })
      .catch((error) => ({ status: error.message }))
    if (res.status !== 200) return commit('error', `Drupal answered ${res.status}`)
    commit('error', '')
    commit(
      'session/orders',
      [...(res.data.data || [])].reverse().map((o) => {
        const ref = (((o.relationships || {}).shipments || {}).data || [])[0]
        const shipment = ref && (res.data.included || []).find((r) => r.id === ref.id)
        return {
          uuid: o.id,
          number: o.attributes.order_number,
          state: o.attributes.state,
          total: (o.attributes.total_price || {}).formatted || '',
          // Commerce names the customer's address `mail`.
          email: o.attributes.mail || '',
          placed: o.attributes.placed,
          shipment: shipment ? shipment.attributes.state : null,
          shipmentId: ref ? ref.id : null,
        }
      }),
      { root: true }
    )
  },

  // One transition, as a PATCH of the order's state, or of its shipment's
  // when `shipmentId` is given. Commerce's workflow decides; the answer,
  // allowed or refused, is kept for the board to show.
  async transition({ commit }, { uuid, to, shipmentId }) {
    commit('busy', { uuid, on: true })
    const started = Date.now()
    const path = shipmentId
      ? `/jsonapi/shipments/default/${shipmentId}`
      : `/jsonapi/orders/default/${uuid}`
    const type = shipmentId ? 'shipment--default' : 'order--default'
    try {
      const res = await this.$axios.patch(
        path,
        { data: { type, id: shipmentId || uuid, attributes: { state: to } } },
        { headers: { Accept: JSON_API, 'Content-Type': JSON_API }, validateStatus: () => true }
      )
      const body = res.data || {}
      const ok = res.status === 200 && body.data
      commit('responded', {
        uuid,
        response: {
          status: res.status,
          ms: Date.now() - started,
          to,
          path,
          state: ok ? body.data.attributes.state : undefined,
          error: ok
            ? ''
            : (body.errors || [{}])[0].detail ||
              (body.errors || [{}])[0].title ||
              `Drupal answered ${res.status}`,
          at: Date.now(),
        },
      })
      if (ok && shipmentId)
        commit('session/shipped', { uuid, shipment: body.data.attributes.state }, { root: true })
      else if (ok)
        commit('session/moved', { uuid, state: body.data.attributes.state }, { root: true })
    } catch (error) {
      // No answer at all, so the board shows this failure, not an older result.
      commit('responded', {
        uuid,
        response: {
          status: 0,
          ms: Date.now() - started,
          to,
          path,
          error: error.message,
          at: Date.now(),
        },
      })
    } finally {
      commit('busy', { uuid, on: false })
    }
  },
}
