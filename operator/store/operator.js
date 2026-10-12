// Whether the signed-in token acts as an operator, remembered per token.
export const state = () => ({ token: null, allowed: false })

export const mutations = {
  set(state, { token, allowed }) {
    state.token = token
    state.allowed = allowed
  },
  reset(state) {
    state.token = null
    state.allowed = false
  },
}
