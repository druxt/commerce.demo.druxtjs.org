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
      '&sort=-changed&fields[order--default]=order_number,state,total_price,email,placed'
    const res = await this.$axios.get(url, {
      headers: { Accept: JSON_API },
      validateStatus: () => true,
    })
    if (res.status !== 200) return commit('error', `Drupal answered ${res.status}`)
    commit('error', '')
    commit(
      'session/orders',
      [...(res.data.data || [])].reverse().map((o) => ({
        uuid: o.id,
        number: o.attributes.order_number,
        state: o.attributes.state,
        total: (o.attributes.total_price || {}).formatted || '',
        email: o.attributes.email || '',
        placed: o.attributes.placed,
      })),
      { root: true }
    )
  },

  // One transition, as a PATCH of the order's state. Commerce's workflow
  // decides; the answer, allowed or refused, is kept for the board to show.
  async transition({ commit }, { uuid, to }) {
    commit('busy', { uuid, on: true })
    const started = Date.now()
    try {
      const res = await this.$axios.patch(
        `/jsonapi/orders/default/${uuid}`,
        { data: { type: 'order--default', id: uuid, attributes: { state: to } } },
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
          state: ok ? body.data.attributes.state : undefined,
          error: ok
            ? ''
            : (body.errors || [{}])[0].detail ||
              (body.errors || [{}])[0].title ||
              `Drupal answered ${res.status}`,
          at: Date.now(),
        },
      })
      if (ok) commit('session/moved', { uuid, state: body.data.attributes.state }, { root: true })
    } finally {
      commit('busy', { uuid, on: false })
    }
  },
}
