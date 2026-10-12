/**
 * The concierge's model call: the shopper's message and the compact
 * catalogue in, strict JSON out, every SKU checked against the catalogue.
 * Anything the model gets wrong gives null, and the matcher answers.
 */
const DEFAULT_MODEL = 'claude-haiku-5-5'
const API = 'https://api.anthropic.com/v1/messages'
const NOTE_WORDS = 18
const WHY_WORDS = 10
const MAX_PICKS = 4

const words = (text, limit) => String(text || '').trim().split(/\s+/).filter(Boolean).slice(0, limit).join(' ')

/** The handover's prompt, kept short: the catalogue is a few dozen lines. */
const prompt = (message, catalogue) =>
  [
    'You are a shop concierge for a small store.',
    'Catalogue, one JSON object per line:',
    ...catalogue.map((c) =>
      JSON.stringify({ sku: c.sku, title: c.title, category: c.category, price: c.price, brand: c.brand || undefined })
    ),
    '',
    `Shopper says: ${JSON.stringify(message)}`,
    '',
    'Pick 2-4 SKUs that genuinely fit. Reply with JSON only, no prose, in this exact shape:',
    '{"note":"one short sentence, under 18 words","picks":[{"sku":"SKU","why":"under 10 words"}]}',
  ].join('\n')

/** JSON from the model's text, plain or fenced; null for prose. */
const parseAnswer = (text) => {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [fenced ? fenced[1] : null, raw, raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)].filter(Boolean)
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object') return parsed
    } catch {
      // The next candidate.
    }
  }
  return null
}

/** The answer bounded to the contract and the catalogue; null when nothing survives. */
const validate = (answer, catalogue = []) => {
  if (!answer || typeof answer !== 'object') return null
  const known = new Set(catalogue.map((c) => c.sku))
  const seen = new Set()
  const picks = (Array.isArray(answer.picks) ? answer.picks : [])
    .filter((p) => p && typeof p.sku === 'string' && known.has(p.sku) && !seen.has(p.sku) && seen.add(p.sku))
    .slice(0, MAX_PICKS)
    .map((p) => ({ sku: p.sku, why: words(p.why, WHY_WORDS) }))
  if (!picks.length) return null
  return { note: words(answer.note, NOTE_WORDS), picks }
}

/**
 * Ask the model. Resolves the validated answer, or null when there is no
 * key, the call fails or times out, or nothing validates.
 */
const askModel = async ({
  message,
  catalogue,
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.ASSIST_MODEL || DEFAULT_MODEL,
  fetch: request = globalThis.fetch,
  timeoutMs = 6000,
  log = () => {},
}) => {
  if (!apiKey) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await request(API, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt(message, catalogue) }],
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      log(`model answered ${res.status}`)
      return null
    }
    const body = await res.json()
    const text = ((body.content || []).find((c) => c.type === 'text') || {}).text
    return validate(parseAnswer(text), catalogue)
  } catch (error) {
    log(`model: ${error.name === 'AbortError' ? 'timed out' : error.message}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { askModel, parseAnswer, validate, prompt, DEFAULT_MODEL }
