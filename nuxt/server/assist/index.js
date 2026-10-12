/**
 * `POST /_assist`: the concierge. The route holds the model key, builds the
 * catalogue the picks are checked against, asks the model within its caps,
 * and otherwise answers from the scripted matcher. The browser never sees
 * which, beyond `source`.
 */
const { cachedCatalogue } = require('./catalogue')
const { askModel } = require('./model')
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
        resolve(JSON.parse(body || '{}'))
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
    const address = String((req.headers || {})['x-forwarded-for'] || req.socket?.remoteAddress || '')
      .split(',')[0]
      .trim()
    const lines = await catalogue()

    let answer = null
    if (apiKey && message && caps.allow(address, conversation)) {
      answer = await askModel({ message, catalogue: lines, apiKey, model, fetch: request, log })
    }
    if (answer) return reply(200, { ...answer, source: 'model', chips: CHIPS })
    const scripted = match(message, lines)
    return reply(200, { note: scripted.note, picks: scripted.picks, source: 'scripted', bucket: scripted.bucket, chips: CHIPS })
  }
}

module.exports = { createAssistRoute, createCaps, MESSAGE_MAX }
