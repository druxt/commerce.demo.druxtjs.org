// The live layer in the browser, on the socket `@druxt-contrib/sockets`
// opens. Everything here is this visitor's own:
//
// - A demo session. A link with `?session=CODE` joins it, and the code stays
//   with the tab; the demo bar shows it. An order placed in the tab is
//   reported to the session, proven by the cart token that owns it.
// - An order room. The order page follows its order, proven the same way,
//   and hears the state Drupal gives it.
// - A product room. The product page hears how many people have it open,
//   and how many carts hold it. Counts, nothing else.
// - A cart room, for shopping together. The owner opens it with the cart's
//   token; a guest who joins with the code is handed that token on the
//   socket and shops the same cart. Members hear each other's changes and
//   the checkout that closes the room.
import Vue from 'vue'
import { cartToken, adoptToken, dropToken } from '~/store/cart'

const SESSION_KEY = 'druxtDemoSession'
const ROOM_KEY = 'druxtCartRoom'
const CODE = /^[A-Z0-9]{6}$/

export default (context, inject) => {
  const { $sockets, $druxtDemo, app, store } = context
  if (!$sockets) return

  const storage = (fn) => {
    try {
      return fn(window.sessionStorage)
    } catch (e) {
      return null
    }
  }

  let session = storage((s) => s.getItem(SESSION_KEY)) || ''

  const setSession = (code) => {
    const previous = session
    session = CODE.test(code || '') ? code : ''
    if (previous && previous !== session) $sockets.leave(`session:${previous}`)
    storage((s) => (session ? s.setItem(SESSION_KEY, session) : s.removeItem(SESSION_KEY)))
    if ($druxtDemo && $druxtDemo.setSession) $druxtDemo.setSession(session)
    if (session) $sockets.join(`session:${session}`)
  }

  // The session's errors: it has ended, or never was.
  $sockets.on('error', (message) => {
    if (session && message.channel === `session:${session}`) setSession('')
  })

  // The cart room this tab is in, if any.
  const room = Vue.observable({
    code: '',
    owner: '',
    you: '',
    guest: false,
    members: [],
    names: {},
    added: {},
    lastChange: null,
    closed: null,
    error: '',
  })

  const channelOf = () => `cart:${room.code}`

  const resetRoom = () => {
    Object.assign(room, {
      code: '',
      owner: '',
      guest: false,
      members: [],
      names: {},
      added: {},
      lastChange: null,
      closed: null,
      error: '',
    })
    storage((s) => s.removeItem(ROOM_KEY))
  }

  const remember = () => storage((s) => s.setItem(ROOM_KEY, JSON.stringify({ code: room.code, guest: room.guest })))

  $sockets.on('members', (m) => {
    if (!room.code || m.channel !== channelOf()) return
    room.members = m.payload.members
    room.you = $sockets.state.id
    const names = { ...room.names }
    for (const member of m.payload.members) names[member.id] = member.name
    room.names = names
  })

  $sockets.on('changed', (m) => {
    if (!room.code || m.channel !== channelOf()) return
    const { by, byName, what } = m.payload
    room.names = { ...room.names, [by]: byName }
    if (what && what.title) room.added = { ...room.added, [what.title]: by }
    if (by === $sockets.state.id) return
    room.lastChange = { by, byName, what, at: Date.now() }
    store.dispatch('cart/load')
  })

  $sockets.on('closed', (m) => {
    if (!room.code || m.channel !== channelOf()) return
    room.closed = { number: m.payload.number, by: m.payload.by, byName: m.payload.byName, at: Date.now() }
    store.dispatch('cart/load')
  })

  $sockets.on('error', (m) => {
    if (room.code && m.channel === channelOf() && /ended/.test(m.payload.message)) {
      const guest = room.guest
      resetRoom()
      if (guest) dropToken()
      room.error = m.payload.message
    }
  })

  // What this tab changes, the room hears. The store's own actions are the
  // signal, so a card, the product page and the cart page all count.
  store.subscribeAction({
    after: (action) => {
      if (!room.code || room.closed || store.state.cart.error) return
      const p = action.payload || {}
      const what = {
        'cart/add': { verb: 'added', title: p.title || 'an item' },
        'cart/remove': { verb: 'removed', title: (p.title || '').toString() },
        'cart/setQuantity': { verb: 'changed', title: ((p.line || {}).title || '').toString() },
      }[action.type]
      if (!what) return
      if (what.verb === 'added') room.added = { ...room.added, [what.title]: $sockets.state.id }
      $sockets.send('changed', channelOf(), { what })
    },
  })

  // The catalogue's live numbers: carts per product, stock per SKU. One
  // room for the whole catalogue, joined once, so a card never counts as a
  // visitor looking at every product.
  const catalogue = Vue.observable({ carts: {}, stock: {}, joined: false })
  $sockets.on('carts', (m) => {
    if (m.channel === 'catalogue:live') catalogue.carts = { ...catalogue.carts, ...(m.payload.counts || {}) }
  })
  $sockets.on('stock', (m) => {
    if (m.channel === 'catalogue:live') catalogue.stock = { ...catalogue.stock, ...(m.payload.levels || {}) }
  })

  const live = {
    get session() {
      return session
    },

    room,
    catalogue,

    /** Hear the catalogue's numbers; joined once and kept for the tab. */
    watchCatalogue() {
      if (catalogue.joined) return
      catalogue.joined = true
      $sockets.join('catalogue:live')
    },

    /** The order this tab placed, for the session's console. */
    placed(uuid) {
      if (!session || !uuid) return
      $sockets.send('placed', `session:${session}`, { uuid, token: cartToken() })
    },

    /** The order this tab placed, for the cart room it shops in. */
    placedInRoom(uuid) {
      if (!room.code || !uuid) return
      $sockets.send('placed', channelOf(), { uuid })
    },

    /** Open a room on this tab's cart. Resolves with the code. */
    openRoom() {
      return new Promise((resolve, reject) => {
        const done = () => {
          offRoom()
          offError()
          $sockets.leave('cart:new')
        }
        const offRoom = $sockets.on('room', (m) => {
          if (m.channel !== 'cart:new') return
          done()
          room.code = m.payload.code
          room.owner = $sockets.state.id
          room.you = $sockets.state.id
          room.guest = false
          room.closed = null
          room.error = ''
          remember()
          $sockets.join(channelOf())
          resolve(room.code)
        })
        const offError = $sockets.on('error', (m) => {
          if (m.channel !== 'cart:new') return
          done()
          reject(new Error(m.payload.message))
        })
        $sockets.join('cart:new')
        $sockets.send('open', 'cart:new', { token: cartToken() })
      })
    },

    /** Join someone's room by code. Resolves once their cart token is this tab's. */
    joinRoom(code) {
      code = String(code || '').toUpperCase()
      if (!CODE.test(code)) return Promise.reject(new Error('A code is six letters and numbers.'))
      return new Promise((resolve, reject) => {
        const channel = `cart:${code}`
        const done = () => {
          offToken()
          offError()
        }
        const offToken = $sockets.on('token', (m) => {
          if (m.channel !== channel) return
          done()
          adoptToken(m.payload.token)
          room.code = code
          room.owner = m.payload.owner
          room.you = $sockets.state.id
          room.guest = m.payload.owner !== $sockets.state.id
          room.closed = null
          room.error = ''
          remember()
          store.dispatch('cart/load')
          resolve(code)
        })
        const offError = $sockets.on('error', (m) => {
          if (m.channel !== channel) return
          done()
          $sockets.leave(channel)
          reject(new Error(m.payload.message))
        })
        $sockets.join(channel)
      })
    },

    /** Leave the room. A guest's tab goes back to a cart of its own. */
    leaveRoom() {
      if (room.code) $sockets.leave(channelOf())
      const guest = room.guest
      resetRoom()
      if (guest) dropToken()
      return store.dispatch('cart/load')
    },

    /**
     * Follow an order: `fn({ uuid, number, state })` on each state the hub
     * gives, `onError(message)` if the order is not this browser's. Returns a
     * function that stops following.
     */
    follow(uuid, fn, onError = () => {}) {
      const channel = `order:${uuid}`
      const offState = $sockets.on('order:state', (m) => m.channel === channel && fn(m.payload))
      const offError = $sockets.on('error', (m) => m.channel === channel && onError(m.payload.message))
      const claim = () => $sockets.send('claim', channel, { token: cartToken() })
      $sockets.join(channel)
      claim()
      // A reconnect rejoins the room but the proof is per connection.
      const offHello = $sockets.on('hello', claim)
      return () => {
        offState()
        offError()
        offHello()
        $sockets.leave(channel)
      }
    },

    /**
     * Who else has a product open, and how many carts hold it:
     * `fn({ looking, carts })` whenever either changes. Returns a function
     * that leaves the room.
     */
    watch(uuid, fn) {
      const channel = `product:${uuid}`
      const counts = { looking: 0, carts: 0, stock: {} }
      const off = [
        $sockets.on('stock', (m) => {
          if (m.channel !== channel) return
          counts.stock = { ...counts.stock, ...(m.payload.levels || {}) }
          fn({ ...counts })
        }),
        $sockets.on('looking', (m) => {
          if (m.channel !== channel) return
          counts.looking = m.payload.count
          fn({ ...counts })
        }),
        $sockets.on('carts', (m) => {
          if (m.channel !== channel) return
          counts.carts = m.payload.count
          fn({ ...counts })
        }),
      ]
      $sockets.join(channel)
      return () => {
        off.forEach((f) => f())
        $sockets.leave(channel)
      }
    },
  }

  inject('live', live)

  // The session link: `?session=CODE` on any page. The badge appears once the
  // page has hydrated, so the server's markup and the browser's agree. A
  // room this tab was in is rejoined the same way, and `?join=CODE` on the
  // cart page joins someone's.
  const fromRoute = (route) => {
    const code = String((route.query || {}).session || '').toUpperCase()
    if (CODE.test(code) && code !== session) setSession(code)
    const join = String((route.query || {}).join || '').toUpperCase()
    if (CODE.test(join) && join !== room.code) live.joinRoom(join).catch((error) => (room.error = error.message))
  }
  if (app.router) app.router.afterEach(fromRoute)
  const start = () => {
    const kept = storage((s) => s.getItem(ROOM_KEY))
    if (kept) {
      try {
        const { code } = JSON.parse(kept)
        if (CODE.test(code || '')) live.joinRoom(code).catch(() => dropToken())
      } catch (e) {
        storage((s) => s.removeItem(ROOM_KEY))
      }
    }
    fromRoute(context.route)
    if (session) setSession(session)
  }
  if (window.onNuxtReady) window.onNuxtReady(start)
  else start()
}
