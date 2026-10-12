// The demo session this console holds. Opened on the hub with the operator's
// token, kept in sessionStorage so a reload keeps the code, ended on the hub.
const KEY = 'operatorSession'

const stored = {
  get: () => {
    try {
      return window.sessionStorage.getItem(KEY) || ''
    } catch (e) {
      return ''
    }
  },
  set: (code) => {
    try {
      if (code) window.sessionStorage.setItem(KEY, code)
      else window.sessionStorage.removeItem(KEY)
    } catch (e) {
      // No storage: a reload starts a new session.
    }
  },
}

export const state = () => ({
  code: '',
  openedAt: 0,
  visitors: 0,
  orders: [],
  attached: '',
})

export const mutations = {
  opened(state, { code, openedAt }) {
    state.code = code
    state.openedAt = openedAt
    state.visitors = 0
    state.orders = []
  },
  attached(state, code) {
    state.attached = code
  },
  visitors(state, n) {
    state.visitors = n
  },
  orders(state, list) {
    // The hub's list comes newest last; the board shows newest first. An
    // order the board already marks new stays marked.
    const known = new Map(state.orders.map((o) => [o.uuid, o]))
    state.orders = [...list].reverse().map((o) => {
      const was = known.get(o.uuid) || {}
      return { ...o, isNew: !!was.isNew, placedAt: was.placedAt }
    })
  },
  placed(state, order) {
    if (!state.orders.find((o) => o.uuid === order.uuid)) {
      state.orders = [{ ...order, isNew: true, placedAt: Date.now() }, ...state.orders]
    }
  },
  moved(state, { uuid, state: next, number }) {
    const known = state.orders.find((o) => o.uuid === uuid)
    if (known) state.orders = state.orders.map((o) => (o.uuid === uuid ? { ...o, state: next } : o))
    else
      state.orders = [
        { uuid, number, state: next, isNew: true, placedAt: Date.now() },
        ...state.orders,
      ]
  },
  settle(state, uuid) {
    state.orders = state.orders.map((o) => (o.uuid === uuid ? { ...o, isNew: false } : o))
  },
  ended(state) {
    state.code = ''
    state.openedAt = 0
    state.visitors = 0
    state.orders = []
    state.attached = ''
  },
}

// The attached room's socket listeners, removed when the console leaves it.
let listeners = []
const stopListening = () => {
  listeners.forEach((off) => off())
  listeners = []
}

const bearer = (auth) =>
  String((auth.strategy.token && auth.strategy.token.get()) || '').replace(/^Bearer\s+/i, '')

export const actions = {
  // Ask the hub for a session; the answer is its code.
  open({ commit, dispatch }) {
    const sockets = this.$sockets
    const token = bearer(this.$auth)
    return new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(timer)
        offSession()
        offError()
        sockets.leave('session:new')
      }
      const offSession = sockets.on('session', (m) => {
        if (m.channel !== 'session:new') return
        done()
        commit('opened', { code: m.payload.code, openedAt: Date.now() })
        stored.set(m.payload.code)
        dispatch('attach').then(resolve)
      })
      const offError = sockets.on('error', (m) => {
        if (m.channel !== 'session:new') return
        done()
        reject(new Error(m.payload.message))
      })
      // A message sent while the socket is down is dropped, so stop waiting.
      const timer = setTimeout(() => {
        done()
        reject(new Error('The live hub did not answer. Try again.'))
      }, 10000)
      sockets.join('session:new')
      sockets.send('open', 'session:new', { token })
    })
  },

  // Join the session's console room and claim it, and listen to it. Once per
  // code: a reload reads the code back from storage first.
  attach({ state, commit }) {
    const code = state.code || stored.get()
    if (!code || state.attached === code) return
    if (!state.code) commit('opened', { code, openedAt: Date.now() })
    commit('attached', code)
    const sockets = this.$sockets
    const channel = `orders:${code}`
    const claim = () => sockets.send('claim', channel, { token: bearer(this.$auth) })
    stopListening()
    const on = (type, fn) =>
      listeners.push(sockets.on(type, (m) => m.channel === channel && fn(m.payload)))
    on('orders', (p) => commit('orders', p.orders))
    on('counts', (p) => commit('visitors', p.visitors))
    on('order:placed', (p) => commit('placed', p))
    on('order:state', (p) => commit('moved', p))
    on('ended', () => {
      stopListening()
      commit('ended')
      stored.set('')
    })
    on('error', (p) => {
      if (/ended/.test(p.message)) {
        stopListening()
        commit('ended')
        stored.set('')
      }
    })
    listeners.push(sockets.on('hello', claim))
    sockets.join(channel)
    claim()
  },

  // Leave the room without ending the session: a sign-out, or a reload that
  // the next sign-in re-attaches.
  detach({ state, commit }) {
    stopListening()
    if (state.attached) this.$sockets.leave(`orders:${state.attached}`)
    commit('attached', '')
  },

  end({ state, commit }) {
    if (!state.code) return
    this.$sockets.send('end', `orders:${state.code}`, {})
    this.$sockets.leave(`orders:${state.code}`)
    stopListening()
    commit('ended')
    stored.set('')
  },
}
