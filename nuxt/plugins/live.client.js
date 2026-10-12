// The live layer in the browser, on the socket `@druxt-contrib/sockets`
// opens. Three things, all this visitor's own:
//
// - A demo session. A link with `?session=CODE` joins it, and the code stays
//   with the tab; the demo bar shows it. An order placed in the tab is
//   reported to the session, proven by the cart token that owns it.
// - An order room. The order page follows its order, proven the same way,
//   and hears the state Drupal gives it.
// - A product room. The product page hears how many people have it open,
//   and how many carts hold it. Counts, nothing else.
import { cartToken } from '~/store/cart'

const SESSION_KEY = 'druxtDemoSession'
const CODE = /^[A-Z0-9]{6}$/

export default (context, inject) => {
  const { $sockets, $druxtDemo, app } = context
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
    session = CODE.test(code || '') ? code : ''
    storage((s) => (session ? s.setItem(SESSION_KEY, session) : s.removeItem(SESSION_KEY)))
    if ($druxtDemo && $druxtDemo.setSession) $druxtDemo.setSession(session)
    if (session) $sockets.join(`session:${session}`)
  }

  // The session's errors: it has ended, or never was.
  $sockets.on('error', (message) => {
    if (session && message.channel === `session:${session}`) {
      $sockets.leave(message.channel)
      setSession('')
    }
  })

  const live = {
    get session() {
      return session
    },

    /** The order this tab placed, for the session's console. */
    placed(uuid) {
      if (!session || !uuid) return
      $sockets.send('placed', `session:${session}`, { uuid, token: cartToken() })
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
      const counts = { looking: 0, carts: 0 }
      const off = [
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
  // page has hydrated, so the server's markup and the browser's agree.
  const fromRoute = (route) => {
    const code = String((route.query || {}).session || '').toUpperCase()
    if (CODE.test(code) && code !== session) setSession(code)
  }
  if (app.router) app.router.afterEach(fromRoute)
  const start = () => {
    fromRoute(context.route)
    if (session) setSession(session)
  }
  if (window.onNuxtReady) window.onNuxtReady(start)
  else start()
}
