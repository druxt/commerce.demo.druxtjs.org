/**
 * `POST /_assist`: the concierge. The route holds the model key, builds the
 * catalogue the picks are checked against, asks the model within its caps,
 * then the intent model for a bucket, and otherwise answers from the
 * scripted matcher's keywords. The browser never sees which, beyond `source`.
 */
const { cachedCatalogue } = require('./catalogue')
const { askModel } = require('./model')
const { askIntent, intentConfigured, PERSON, PERSON_NOTE } = require('./intent')
const { match, CHIPS } = require('./matcher')

const MESSAGE_MAX = 500

const readJson = (req, limit = 64 * 1024) =>
  new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > limit) req.destroy()
    })
    req.on('end', () => {
      try {
        // JSON that is not an object (`null`, a number) asks nothing, as bad JSON does.
        const data = JSON.parse(body || '{}')
        resolve(data && typeof data === 'object' ? data : {})
      } catch {
        resolve({})
      }
    })
  })

/** Who may ask the model: by address a minute, by conversation, by day. */
const createCaps = ({ perMinute, perConversation, perDay, now }) => {
  const byAddress = new Map()
  const byConversation = new Map()
  let day = { key: '', count: 0 }
  return {
    allow(address, conversation) {
      const t = now()
      const recent = (byAddress.get(address) || []).filter((at) => t - at < 60000)
      if (recent.length >= perMinute) return false
      recent.push(t)
      byAddress.set(address, recent)
      if (byAddress.size > 5000) byAddress.delete(byAddress.keys().next().value)
      const key = new Date(t).toISOString().slice(0, 10)
      if (day.key !== key) day = { key, count: 0 }
      if (day.count >= perDay) return false
      if (conversation) {
        const used = byConversation.get(conversation) || 0
        if (used >= perConversation) return false
        byConversation.set(conversation, used + 1)
        if (byConversation.size > 5000) byConversation.delete(byConversation.keys().next().value)
      }
      day.count += 1
      return true
    },
  }
}

const createAssistRoute = ({
  drupalUrl,
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.ASSIST_MODEL,
  // The intent model's options, `{baseUrl, apiKey, model}` over the
  // environment's; null leaves it out.
  intent = intentConfigured() ? {} : null,
  fetch: request = globalThis.fetch,
  now = Date.now,
  limits = {},
  log = (m) => process.stdout.write(`assist: ${m}\n`),
} = {}) => {
  const catalogue = cachedCatalogue(drupalUrl, { fetch: request, now, log })
  const caps = createCaps({
    perMinute: limits.perMinute || 10,
    perConversation: limits.perConversation || 12,
    perDay: limits.perDay || Number(process.env.ASSIST_DAILY_CAP) || 300,
    now,
  })

  return async (req, res) => {
    const reply = (status, body) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(body))
    }
    if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
    const data = await readJson(req)
    const message = String(data.message || '').slice(0, MESSAGE_MAX)
    const conversation = String(data.conversation || '').slice(0, 64)
    // Lagoon's router adds the address it saw at the end of X-Forwarded-For,
    // and anything before that is the client's to write. The console passes
    // the header on as it came. With no proxy in front, the socket's address.
    const forwarded = String((req.headers || {})['x-forwarded-for'] || '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
    const address = forwarded.length ? forwarded[forwarded.length - 1] : String(req.socket?.remoteAddress || '')
    const lines = await catalogue()

    // One allowance a turn, whichever of the two models it reaches.
    const allowed = Boolean(message && (apiKey || intent) && caps.allow(address, conversation))
    const answer = allowed && apiKey ? await askModel({ message, catalogue: lines, apiKey, model, fetch: request, log }) : null
    if (answer) return reply(200, { ...answer, source: 'model', chips: CHIPS })
    const chosen = allowed && intent ? await askIntent({ ...intent, message, fetch: request, log }) : null
    if (chosen && chosen.bucket === PERSON) {
      return reply(200, { note: PERSON_NOTE, picks: [], source: 'intent', bucket: PERSON, chips: CHIPS })
    }
    if (chosen) {
      const picked = match(message, lines, chosen.bucket)
      return reply(200, { note: picked.note, picks: picked.picks, source: 'intent', bucket: picked.bucket, chips: CHIPS })
    }
    const scripted = match(message, lines)
    return reply(200, { note: scripted.note, picks: scripted.picks, source: 'scripted', bucket: scripted.bucket, chips: CHIPS })
  }
}

module.exports = { createAssistRoute, createCaps, MESSAGE_MAX }
