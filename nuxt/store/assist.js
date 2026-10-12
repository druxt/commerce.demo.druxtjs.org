// The assist panel: open or not, the thread, and what the catalogue is
// filtered to. The concierge answers through `/_assist` on this origin. The
// thread itself lives on the hub and in Drupal when the live layer is there:
// every turn goes out on the socket and comes back as the record; the panel
// shows the greeting locally and the rest as it arrives.

const GREETING =
  'I know every product in the store. Tell me who it is for or what it needs to do, and I will narrow it down. Ask for a person any time.'
const CHIPS = ['A gift under $40', 'Furnishing a dining room', 'Something to read', 'For a kid, outdoors', 'Talk to a person']
const SCRIPTED_DELAY = 400

const greeting = () => ({ role: 'bot', text: GREETING, chips: CHIPS, at: 0 })

const fallbackId = () => {
  try {
    let id = window.sessionStorage.getItem('druxtAssistConversation')
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      window.sessionStorage.setItem('druxtAssistConversation', id)
    }
    return id
  } catch (e) {
    return ''
  }
}

export const state = () => ({
  open: false,
  pending: false,
  seed: '',
  conversation: '',
  // The thread as shown: the greeting, then what the socket delivered, or
  // what this tab did when the live layer is absent.
  messages: [greeting()],
  threadState: 'concierge',
  operatorName: '',
  waitingSince: 0,
  picksShown: [],
})

export const getters = {
  productCount: (state, getters, rootState) => rootState.catalogue.items.length,
  withOperator: (state) => state.threadState === 'with_operator',
}

/** A hub turn as a panel message. */
const fromTurn = (turn) => ({
  role: turn.author === 'visitor' ? 'user' : 'bot',
  who: turn.author === 'operator' ? `${turn.by || 'operator'} · operator` : '',
  text: turn.body,
  picks: turn.picks,
  at: turn.at,
})

export const mutations = {
  open(state, seed) {
    state.open = true
    state.seed = seed || ''
  },
  close(state) {
    state.open = false
    state.seed = ''
  },
  pending(state, on) {
    state.pending = on
  },
  conversation(state, id) {
    state.conversation = id
  },
  push(state, message) {
    state.messages = [...state.messages, { at: Date.now(), ...message }]
  },
  thread(state, { turns, threadState, operatorName }) {
    state.messages = [greeting(), ...turns.map(fromTurn)]
    state.threadState = threadState
    state.operatorName = operatorName || ''
  },
  threadState(state, { threadState, operatorName }) {
    state.threadState = threadState
    if (operatorName !== undefined) state.operatorName = operatorName
    state.waitingSince = threadState === 'waiting' ? Date.now() : 0
  },
  picksShown(state, skus) {
    state.picksShown = skus
  },
  reset(state) {
    state.messages = [greeting()]
    state.picksShown = []
    state.pending = false
    state.threadState = 'concierge'
    state.operatorName = ''
    state.waitingSince = 0
    state.conversation = ''
  },
}

export const actions = {
  // Open the panel and, with the live layer, the conversation on the hub.
  async openPanel({ commit, state, dispatch }, { seed } = {}) {
    commit('open', seed)
    if (!state.conversation) await dispatch('connect')
  },

  async connect({ commit, state }) {
    const live = this.$live
    if (!live) return commit('conversation', fallbackId())
    try {
      const code = await live.openConversation(this.$router.currentRoute.fullPath)
      commit('conversation', code)
      if (!state.listening) {
        state.listening = true
        live.onThread((type, payload) => {
          if (type === 'thread') commit('thread', { turns: payload.turns || [], threadState: payload.state, operatorName: payload.operatorName })
          if (type === 'turn') {
            // A visitor's own turns are shown as they are sent; the rest arrive here.
            if (payload.author !== 'visitor') commit('push', fromTurn(payload))
            if (payload.author === 'operator') commit('pending', false)
          }
          if (type === 'operator') {
            commit('push', { role: 'sys', text: `${payload.name} joined · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` })
            commit('threadState', { threadState: 'with_operator', operatorName: payload.name })
          }
          if (type === 'state') commit('threadState', { threadState: payload.state })
          if (type === 'handback') {
            commit('push', { role: 'sys', text: 'The concierge is back on the thread.' })
            commit('threadState', { threadState: 'concierge', operatorName: '' })
          }
        })
      }
    } catch (e) {
      commit('conversation', fallbackId())
    }
  },

  closePanel({ commit }) {
    commit('close')
  },

  // One turn: the question goes on the thread, the answer follows. With a
  // person on the thread the question goes to them and the concierge is
  // quiet. A scripted answer waits out a short delay so it reads as considered.
  async ask({ commit, state, getters, rootState }, message) {
    const text = String(message || '').trim()
    if (!text || state.pending) return
    commit('push', { role: 'user', text })
    const live = this.$live
    const extra = { route: this.$router.currentRoute.fullPath, cartCount: rootState.cart.lines.length }
    if (live && live.thread.code) live.turn('visitor', text, undefined, extra)
    if (getters.withOperator) return
    commit('pending', true)
    const started = Date.now()
    let answer
    try {
      const res = await this.$druxt.axios.post(
        '/_assist',
        { message: text, conversation: state.conversation },
        { headers: { 'Content-Type': 'application/json' }, validateStatus: () => true }
      )
      answer = res.data && res.data.picks ? res.data : null
    } catch (e) {
      answer = null
    }
    if (!answer) answer = { note: 'The concierge is away; here is what people buy most.', picks: [], source: 'scripted' }
    if (answer.source !== 'model') {
      const wait = SCRIPTED_DELAY - (Date.now() - started)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    }
    // A person arrived while the concierge thought: their thread, not its.
    if (state.threadState === 'with_operator') return commit('pending', false)
    commit('push', { role: 'bot', text: answer.note, picks: answer.picks, source: answer.source })
    if (live && live.thread.code) live.turn('concierge', answer.note, answer.picks)
    commit('pending', false)
  },

  // Ask for a person. The session's consoles hear it; without a session
  // there is nobody to hear, and the panel says so instead.
  talk({ commit }) {
    const live = this.$live
    if (!live || !live.session || !live.thread.code) {
      return commit('push', { role: 'sys', text: 'No operator session is open right now, so the concierge answers on its own.' })
    }
    commit('push', { role: 'user', text: 'Can I talk to a person?' })
    live.turn('visitor', 'Can I talk to a person?')
    commit('push', { role: 'bot', text: 'Asking the operator. They get this thread as it is, with what you asked.' })
    live.turn('concierge', 'Asking the operator. They get this thread as it is, with what you asked.')
    live.wait()
    commit('threadState', { threadState: 'waiting' })
  },

  cancelWait({ commit }) {
    if (this.$live) this.$live.cancelWait()
    commit('threadState', { threadState: 'concierge' })
  },

  // The catalogue narrowed to the picks, by a route change and nothing else.
  showPicks({ commit }, skus) {
    commit('picksShown', skus)
    this.$router.push({ path: '/catalogue', query: { picks: skus.join(',') } })
  },

  async reset({ commit, dispatch }) {
    if (this.$live) this.$live.resetConversation()
    commit('reset')
    await dispatch('connect')
  },
}
