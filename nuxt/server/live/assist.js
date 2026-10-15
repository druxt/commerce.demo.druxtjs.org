/**
 * Assist conversations on the hub.
 *
 * A visitor opens a conversation on `assist:new` and gets a code; the thread
 * lives on `assist:<code>`. Every turn the visitor's panel makes, its own and
 * the concierge's, comes here as `turn` and is written to Drupal as a `chat`
 * message, so the thread survives a reload: a join replays it. `wait` asks
 * for a person; the consoles on the visitor's session hear it with the
 * transcript. A console `claim`s with an operator token, joins the room, and
 * from then the visitor's panel stops asking the concierge and the two talk
 * through `turn`. `handback` returns the thread to the concierge.
 *
 * Consoles follow a session's threads by joining `assist:new` and sending
 * `list` with their token and session code.
 *
 * The code names a thread; it does not open one. `open` answers with a key
 * as well, and the visitor's tab sends it in `resume` after joining. Only
 * the key's holder is the visitor, and only the visitor and the operator
 * who claimed the thread hear its turns, so a code read off a screen or a
 * shared link shows nothing. The key is an HMAC of the code, so a hub that
 * restarts still knows it.
 */
const { createHmac, timingSafeEqual } = require('crypto')
const { roomCode, isCode } = require('./code')

const STATES = ['concierge', 'waiting', 'with_operator', 'closed']
const AUTHORS = ['visitor', 'concierge', 'operator']
const BODY_MAX = 2000
const TURNS_MAX = 200

const assistHandler = ({ drupal, drupalUrl, accountOf, registry, rand, secret, log = () => {} } = {}) => {
  if (!secret) throw new Error('assist: a secret signs the visitor keys')
  const threads = new Map()
  const recovering = new Map()
  const codes = new Set()
  // Console client ids watching a session's threads.
  const watchers = new Map()
  let hubApi = null

  const fail = (hub, client, channel, message) => hub.send(client, 'error', channel, { message })

  /** The visitor's key for a code. */
  const keyOf = (code) => createHmac('sha256', secret).update(`assist:${code}`).digest('base64url')
  const holdsKey = (code, key) => {
    const want = Buffer.from(keyOf(code))
    const got = Buffer.from(typeof key === 'string' ? key : '')
    return got.length === want.length && timingSafeEqual(got, want)
  }

  /** A thread's event, to its visitor and its operator: never the whole channel. */
  const tell = (hub, t, type, payload) => {
    for (const id of new Set([t.visitor, t.operator])) {
      const client = id && hub.clients.get(id)
      if (client) hub.send(client, type, `assist:${t.code}`, payload)
    }
  }
  const threadPayload = (t) => ({ code: t.code, state: t.state, operatorName: t.operatorName, turns: t.turns, session: t.session, waitingSince: t.waitingSince || 0 })

  // A turn whose picks do not parse keeps its body.
  const picksOf = (value) => {
    try {
      return value ? JSON.parse(value) : undefined
    } catch {
      return undefined
    }
  }

  const summary = (t) => ({
    code: t.code,
    session: t.session,
    state: t.state,
    operatorName: t.operatorName || '',
    question: [...t.turns].reverse().find((x) => x.author === 'visitor')?.body || '',
    turns: t.turns,
    waitingSince: t.waitingSince || 0,
    route: t.route || '',
    cartCount: t.cartCount || 0,
    visitorName: t.visitorName || '',
  })

  const tellWatchers = (hub, session, type, payload) => {
    for (const id of watchers.get(session) || []) {
      const client = hub.clients.get(id)
      if (client) hub.send(client, type, 'assist:new', payload)
    }
  }

  const persistState = async (t) => {
    if (!t.id) return
    try {
      await drupal.patch(`/jsonapi/message/conversation/${t.id}`, {
        data: { type: 'message--conversation', id: t.id, attributes: { field_state: t.state } },
      })
    } catch (error) {
      log(`conversation ${t.code}: state not written: ${error.message}`)
    }
  }

  const persistTurn = async (t, turn) => {
    if (!t.id) return
    try {
      await drupal.post('/jsonapi/message/chat', {
        data: {
          type: 'message--chat',
          attributes: { field_author: turn.author, field_body: turn.body, field_picks: turn.picks ? JSON.stringify(turn.picks) : '' },
          relationships: { field_conversation: { data: { type: 'message--conversation', id: t.id } } },
        },
      })
    } catch (error) {
      log(`conversation ${t.code}: turn not written: ${error.message}`)
    }
  }

  /** A thread the hub forgot (a restart): Drupal still has it. */
  const recover = async (code) => {
    try {
      const found = await drupal.get(
        `/jsonapi/message/conversation?filter[field_code]=${encodeURIComponent(code)}&fields[message--conversation]=field_code,field_session,field_state`
      )
      const row = (found.data || [])[0]
      if (!row) return null
      // Newest first, a page at a time, so a long thread keeps its latest
      // turns; the id orders turns written in the same second.
      const rows = []
      let next = `/jsonapi/message/chat?filter[field_conversation.field_code]=${encodeURIComponent(code)}&sort=-created,-drupal_internal__mid&fields[message--chat]=field_author,field_body,field_picks,created`
      while (next && rows.length < TURNS_MAX) {
        const page = await drupal.get(next)
        rows.push(...(page.data || []))
        next = ((page.links || {}).next || {}).href
      }
      const turns = rows.slice(0, TURNS_MAX).reverse().map((c) => ({
        author: c.attributes.field_author,
        body: c.attributes.field_body || '',
        picks: picksOf(c.attributes.field_picks),
        at: Date.parse(c.attributes.created) || Date.now(),
      }))
      const state = row.attributes.field_state
      const t = {
        id: row.id,
        code,
        session: row.attributes.field_session || '',
        state: STATES.includes(state) && state !== 'with_operator' ? state : 'concierge',
        // Drupal does not keep when the wait began, so it counts from the recovery.
        waitingSince: state === 'waiting' ? Date.now() : 0,
        turns,
        visitor: null,
        operator: null,
        operatorName: '',
      }
      threads.set(code, t)
      codes.add(code)
      return t
    } catch (error) {
      log(`conversation ${code}: not recovered: ${error.message}`)
      return null
    }
  }

  // Two calls for a forgotten code share one recovery, so neither replaces
  // the thread the other set up.
  const threadOf = async (code) => {
    if (!isCode(code)) return null
    if (threads.has(code)) return threads.get(code)
    if (!recovering.has(code)) recovering.set(code, recover(code).finally(() => recovering.delete(code)))
    return (await recovering.get(code)) || null
  }

  const handler = {
    threads,

    async join(hub, channel, client) {
      hubApi = hub
      const code = channel.slice('assist:'.length)
      if (code === 'new') return
      // Joining tells nothing: the visitor sends its key in `resume`, and an
      // operator `claim`s.
      const t = await threadOf(code)
      if (!t) return fail(hub, client, channel, 'That conversation has ended.')
    },

    leave(hub, channel, client) {
      const code = channel.slice('assist:'.length)
      if (code === 'new') {
        for (const set of watchers.values()) set.delete(client.id)
        return
      }
      const t = threads.get(code)
      if (!t) return
      if (t.visitor === client.id) t.visitor = null
      if (t.operator === client.id) {
        t.operator = null
        t.operatorName = ''
        if (t.state === 'with_operator') {
          t.state = 'concierge'
          persistState(t)
          tell(hub, t, 'handback', { code })
          tellWatchers(hub, t.session, 'assist:thread', summary(t))
        }
      }
    },

    async message(hub, channel, client, type, payload = {}) {
      hubApi = hub
      const code = channel.slice('assist:'.length)

      if (code === 'new') {
        // A visitor's panel opens a conversation.
        if (type === 'open') {
          const session = isCode(String(payload.session || '')) ? payload.session : ''
          const next = roomCode(codes, rand)
          codes.add(next)
          const t = {
            id: null,
            code: next,
            session,
            state: 'concierge',
            turns: [],
            visitor: client.id,
            operator: null,
            operatorName: '',
            route: String(payload.route || '').slice(0, 200),
            visitorName: client.name || '',
          }
          threads.set(next, t)
          try {
            const written = await drupal.post('/jsonapi/message/conversation', {
              data: { type: 'message--conversation', attributes: { field_code: next, field_session: session, field_state: 'concierge' } },
            })
            t.id = (written.data || {}).id || null
          } catch (error) {
            log(`conversation ${next}: Drupal did not record it: ${error.message}`)
          }
          return hub.send(client, 'conversation', channel, { code: next, key: keyOf(next) })
        }
        // A console follows a session's threads.
        if (type === 'list') {
          const session = String(payload.session || '')
          const account = await accountOf(drupalUrl, payload.token)
          if (!account || !account.roles.includes('operator') || !isCode(session) || !registry.get(session)) {
            return fail(hub, client, channel, 'Only an operator on the session can follow its threads.')
          }
          if (!watchers.has(session)) watchers.set(session, new Set())
          watchers.get(session).add(client.id)
          const list = [...threads.values()].filter((t) => t.session === session && t.state !== 'closed').map(summary)
          return hub.send(client, 'threads', channel, { session, threads: list })
        }
        return
      }

      const t = await threadOf(code)
      if (!t) return fail(hub, client, channel, 'That conversation has ended.')

      // The key's holder is the visitor: back after a reload, even while an
      // operator has the thread.
      if (type === 'resume') {
        if (!holdsKey(code, payload.key)) return fail(hub, client, channel, 'That conversation is not yours, or has ended.')
        if (t.operator !== client.id) t.visitor = client.id
        return hub.send(client, 'thread', channel, threadPayload(t))
      }

      const isOperator = t.operator === client.id
      const isVisitor = !isOperator && t.visitor === client.id

      if (type === 'claim') {
        const account = await accountOf(drupalUrl, payload.token)
        if (!account || !account.roles.includes('operator')) return fail(hub, client, channel, 'Only an operator can claim a thread.')
        if (!t.session || !registry.get(t.session)) return fail(hub, client, channel, 'Only an operator on the session can claim its threads.')
        if (!hub.members(channel).some((m) => m.id === client.id)) return fail(hub, client, channel, 'Join the thread first.')
        t.operator = client.id
        t.operatorName = account.name
        t.state = 'with_operator'
        t.waitingSince = 0
        await persistState(t)
        log(`conversation ${code}: claimed by ${account.name}`)
        tell(hub, t, 'operator', { code, name: account.name })
        tellWatchers(hub, t.session, 'assist:thread', summary(t))
        return hub.send(client, 'thread', channel, threadPayload(t))
      }

      if (!isVisitor && !isOperator) return fail(hub, client, channel, 'This is not your conversation.')

      if (type === 'turn') {
        const author = AUTHORS.includes(payload.author) ? payload.author : isOperator ? 'operator' : 'visitor'
        if (isOperator && author !== 'operator') return fail(hub, client, channel, 'An operator speaks as one.')
        if (isVisitor && author === 'operator') return fail(hub, client, channel, 'A visitor is not the operator.')
        if (isVisitor && author === 'concierge' && t.state === 'with_operator') return
        const body = String(payload.text || '').slice(0, BODY_MAX)
        const picks = Array.isArray(payload.picks)
          ? payload.picks.slice(0, 4).map((p) => ({ sku: String(p.sku || '').slice(0, 80), why: String(p.why || '').slice(0, 120) }))
          : undefined
        if (!body && !(picks && picks.length)) return
        const turn = { author, body, picks, at: Date.now(), by: author === 'operator' ? t.operatorName : '' }
        t.turns.push(turn)
        if (t.turns.length > TURNS_MAX) t.turns.shift()
        if (payload.route) t.route = String(payload.route).slice(0, 200)
        if (payload.cartCount !== undefined) t.cartCount = Number(payload.cartCount) || 0
        persistTurn(t, turn)
        tell(hub, t, 'turn', { code, ...turn })
        tellWatchers(hub, t.session, 'assist:thread', summary(t))
        return
      }

      if (type === 'wait' && isVisitor) {
        if (!t.session) return fail(hub, client, channel, 'No operator session is open for this visit.')
        t.state = 'waiting'
        t.waitingSince = Date.now()
        await persistState(t)
        tell(hub, t, 'state', { code, state: t.state })
        tellWatchers(hub, t.session, 'assist:waiting', summary(t))
        return
      }

      if (type === 'cancel' && isVisitor && t.state === 'waiting') {
        t.state = 'concierge'
        t.waitingSince = 0
        await persistState(t)
        tell(hub, t, 'state', { code, state: t.state })
        tellWatchers(hub, t.session, 'assist:thread', summary(t))
        return
      }

      if (type === 'handback' && isOperator) {
        t.operator = null
        t.operatorName = ''
        t.state = 'concierge'
        await persistState(t)
        tell(hub, t, 'handback', { code })
        tellWatchers(hub, t.session, 'assist:thread', summary(t))
        return
      }
    },
  }

  Object.defineProperty(handler, 'watchersOf', { value: (session) => watchers.get(session) || new Set(), enumerable: false })
  return handler
}

module.exports = { assistHandler, STATES, AUTHORS }
