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
 */
const { roomCode, isCode } = require('./code')

const STATES = ['concierge', 'waiting', 'with_operator', 'closed']
const AUTHORS = ['visitor', 'concierge', 'operator']
const BODY_MAX = 2000
const TURNS_MAX = 200

const assistHandler = ({ drupal, drupalUrl, accountOf, registry, rand = Math.random, log = () => {} } = {}) => {
  const threads = new Map()
  const codes = new Set()
  // Console client ids watching a session's threads.
  const watchers = new Map()
  let hubApi = null

  const fail = (hub, client, channel, message) => hub.send(client, 'error', channel, { message })

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
      const chats = await drupal.get(
        `/jsonapi/message/chat?filter[field_conversation.field_code]=${encodeURIComponent(code)}&sort=created&fields[message--chat]=field_author,field_body,field_picks,created`
      )
      const turns = (chats.data || []).map((c) => ({
        author: c.attributes.field_author,
        body: c.attributes.field_body || '',
        picks: picksOf(c.attributes.field_picks),
        at: Date.parse(c.attributes.created) || Date.now(),
      }))
      const t = {
        id: row.id,
        code,
        session: row.attributes.field_session || '',
        state: STATES.includes(row.attributes.field_state) && row.attributes.field_state !== 'with_operator' ? row.attributes.field_state : 'concierge',
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

  const threadOf = async (code) => (isCode(code) && (threads.get(code) || (await recover(code)))) || null

  const handler = {
    threads,

    async join(hub, channel, client) {
      hubApi = hub
      const code = channel.slice('assist:'.length)
      if (code === 'new') return
      const t = await threadOf(code)
      if (!t) return fail(hub, client, channel, 'That conversation has ended.')
      if (!t.visitor && t.state !== 'with_operator') t.visitor = client.id
      hub.send(client, 'thread', channel, { code, state: t.state, operatorName: t.operatorName, turns: t.turns, session: t.session })
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
          hub.broadcast(channel, 'handback', { code })
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
          return hub.send(client, 'conversation', channel, { code: next })
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
      const isVisitor = t.visitor === client.id
      const isOperator = t.operator === client.id

      if (type === 'claim') {
        const account = await accountOf(drupalUrl, payload.token)
        if (!account || !account.roles.includes('operator')) return fail(hub, client, channel, 'Only an operator can claim a thread.')
        if (!hub.members(channel).some((m) => m.id === client.id)) return fail(hub, client, channel, 'Join the thread first.')
        t.operator = client.id
        t.operatorName = account.name
        t.state = 'with_operator'
        t.waitingSince = 0
        await persistState(t)
        log(`conversation ${code}: claimed by ${account.name}`)
        hub.broadcast(channel, 'operator', { code, name: account.name })
        tellWatchers(hub, t.session, 'assist:thread', summary(t))
        return hub.send(client, 'thread', channel, { code, state: t.state, operatorName: t.operatorName, turns: t.turns, session: t.session })
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
        hub.broadcast(channel, 'turn', { code, ...turn })
        tellWatchers(hub, t.session, 'assist:thread', summary(t))
        return
      }

      if (type === 'wait' && isVisitor) {
        if (!t.session) return fail(hub, client, channel, 'No operator session is open for this visit.')
        t.state = 'waiting'
        t.waitingSince = Date.now()
        await persistState(t)
        hub.broadcast(channel, 'state', { code, state: t.state })
        tellWatchers(hub, t.session, 'assist:waiting', summary(t))
        return
      }

      if (type === 'cancel' && isVisitor && t.state === 'waiting') {
        t.state = 'concierge'
        t.waitingSince = 0
        await persistState(t)
        hub.broadcast(channel, 'state', { code, state: t.state })
        tellWatchers(hub, t.session, 'assist:thread', summary(t))
        return
      }

      if (type === 'handback' && isOperator) {
        t.operator = null
        t.operatorName = ''
        t.state = 'concierge'
        await persistState(t)
        hub.broadcast(channel, 'handback', { code })
        tellWatchers(hub, t.session, 'assist:thread', summary(t))
        return
      }
    },
  }

  Object.defineProperty(handler, 'watchersOf', { value: (session) => watchers.get(session) || new Set(), enumerable: false })
  return handler
}

module.exports = { assistHandler, STATES, AUTHORS }
