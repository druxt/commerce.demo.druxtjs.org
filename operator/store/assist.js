// The session's assist threads, as the hub tells them: waiting ones to
// claim, claimed ones to answer. The console joins a thread's room to claim
// it and speaks on it as the operator.
export const state = () => ({
  threads: [],
  selected: '',
  following: '',
  error: '',
  picks: null,
  asking: false,
})

export const getters = {
  waiting: (state) => state.threads.filter((t) => t.state === 'waiting'),
  claimed: (state) => state.threads.filter((t) => t.state === 'with_operator'),
  others: (state) => state.threads.filter((t) => t.state === 'concierge'),
  current: (state) => state.threads.find((t) => t.code === state.selected) || null,
}

export const mutations = {
  threads(state, list) {
    state.threads = list
  },
  thread(state, t) {
    const known = state.threads.some((x) => x.code === t.code)
    state.threads = known
      ? state.threads.map((x) => (x.code === t.code ? t : x))
      : [...state.threads, t]
  },
  select(state, code) {
    state.selected = code
    state.picks = null
  },
  following(state, code) {
    state.following = code
  },
  error(state, message) {
    state.error = message
  },
  picks(state, picks) {
    state.picks = picks
  },
  asking(state, on) {
    state.asking = on
  },
}

// The followed session's socket listeners, removed when the console unfollows it.
let listeners = []
const stopListening = () => {
  listeners.forEach((off) => off())
  listeners = []
}

const bearer = (auth) =>
  String((auth.strategy.token && auth.strategy.token.get()) || '').replace(/^Bearer\s+/i, '')

export const actions = {
  // Follow a session's threads. Called when the session attaches.
  follow({ state, commit }, code) {
    if (!code || state.following === code) return
    commit('following', code)
    const sockets = this.$sockets
    stopListening()
    const on = (type, fn) =>
      listeners.push(sockets.on(type, (m) => m.channel === 'assist:new' && fn(m.payload)))
    on('threads', (p) => p.session === code && commit('threads', p.threads))
    on('assist:waiting', (t) => t.session === code && commit('thread', t))
    on('assist:thread', (t) => t.session === code && commit('thread', t))
    const list = () =>
      sockets.send('list', 'assist:new', { token: bearer(this.$auth), session: code })
    listeners.push(sockets.on('hello', list))
    sockets.join('assist:new')
    list()
  },

  unfollow({ commit }) {
    stopListening()
    this.$sockets.leave('assist:new')
    commit('following', '')
    commit('threads', [])
  },

  // Claim a thread: join its room, then prove the operator.
  claim({ commit }, code) {
    const sockets = this.$sockets
    const channel = `assist:${code}`
    return new Promise((resolve) => {
      const offOp = sockets.on('operator', (m) => {
        if (m.channel !== channel) return
        offOp()
        offErr()
        resolve(true)
      })
      const offErr = sockets.on('error', (m) => {
        if (m.channel !== channel) return
        offOp()
        offErr()
        commit('error', m.payload.message)
        resolve(false)
      })
      sockets.join(channel)
      sockets.send('claim', channel, { token: bearer(this.$auth) })
    })
  },

  // An operator's turn, with picks to forward if any.
  say(context, { code, text, picks }) {
    this.$sockets.send('turn', `assist:${code}`, { author: 'operator', text, picks })
  },

  handback({ commit }, code) {
    this.$sockets.send('handback', `assist:${code}`, {})
    this.$sockets.leave(`assist:${code}`)
    commit('select', '')
  },

  // The concierge's picks for a question, to forward. Through this origin's
  // proxy to the storefront's route, with the operator's token.
  async askConcierge({ commit, state }, question) {
    const code = state.selected
    commit('asking', true)
    commit('picks', null)
    try {
      const res = await this.$axios.post(
        '/_assist',
        { message: question, conversation: `operator:${code}` },
        { headers: { 'Content-Type': 'application/json' }, validateStatus: () => true }
      )
      // Another thread was opened while it thought: these picks are not for it.
      if (state.selected !== code) return
      const picks = res.data && res.data.picks ? res.data.picks : []
      commit('picks', {
        question,
        note: (res.data || {}).note || '',
        picks: picks.map((p) => ({ ...p, on: true })),
      })
    } catch (e) {
      commit('error', 'The concierge did not answer.')
    } finally {
      commit('asking', false)
    }
  },
}
