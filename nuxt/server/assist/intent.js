/**
 * The concierge's intent: which of the matcher's buckets a shopper is after,
 * asked of a decision model that speaks TypeSafe's Jev protocol. That is Jev
 * itself, or Laya, its open-weights clone, on our own hardware. It writes
 * nothing; it answers one typed question in a single pass, so the picks and
 * the note stay the matcher's, chosen by meaning instead of by keyword.
 */
const { BUCKETS } = require('./matcher')

const DEFAULT_BASE_URL = 'https://api.typesafe.ai'
const DEFAULT_MODEL = 'jev-latest'

/** Not a bucket: the shopper wants a person, and the panel's chip is the way. */
const PERSON = 'person'
const PERSON_MEANS = 'Wants to talk to a human or needs help with an order'
const PERSON_NOTE = 'A person can help with that: tap "Talk to a person" below.'
// Sending a shopper away from picks costs more than a wrong bucket, so a
// person needs a surer answer than a bucket does.
const PERSON_FLOOR = 0.5

/** The question: every bucket by its meaning, and the person. */
const questions = () => ({
  want: {
    type: 'choice',
    instructions: 'What is this shop visitor looking for?',
    // The catch-all last: Laya reads the options in order, and a person
    // before it scored better on our test messages.
    criteria: Object.fromEntries([
      ...BUCKETS.filter((b) => b.key !== 'default').map((b) => [b.key, b.means]),
      [PERSON, PERSON_MEANS],
      ...BUCKETS.filter((b) => b.key === 'default').map((b) => [b.key, b.means]),
    ]),
  },
})

/**
 * Ask the model. Resolves `{bucket, confidence}`, or null when the call
 * fails or times out, the answer names no bucket we have, or it is a
 * person below the floor.
 */
const askIntent = async ({
  message,
  baseUrl = process.env.TYPESAFE_BASE_URL || DEFAULT_BASE_URL,
  apiKey = process.env.TYPESAFE_API_KEY,
  model = process.env.ASSIST_INTENT_MODEL || DEFAULT_MODEL,
  fetch: request = globalThis.fetch,
  timeoutMs = 3000,
  log = () => {},
}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = { 'content-type': 'application/json' }
    // Laya on a private network may run without a key; Jev never does.
    if (apiKey) headers.authorization = `Bearer ${apiKey}`
    const res = await request(`${String(baseUrl).replace(/\/+$/, '')}/v1/systemone`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, state: message, questions: questions() }),
      signal: controller.signal,
    })
    if (!res.ok) {
      log(`intent answered ${res.status}`)
      return null
    }
    const answer = ((await res.json()).answers || {}).want || {}
    const known = answer.choice === PERSON || BUCKETS.some((b) => b.key === answer.choice)
    const confidence = Number(answer.confidence) || 0
    if (!known || (answer.choice === PERSON && confidence < PERSON_FLOOR)) return null
    return { bucket: answer.choice, confidence }
  } catch (error) {
    log(`intent: ${error.name === 'AbortError' ? 'timed out' : error.message}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Whether the environment names an intent model: a key for Jev, or a base URL for Laya. */
const intentConfigured = (env = process.env) => Boolean(env.TYPESAFE_API_KEY || env.TYPESAFE_BASE_URL)

module.exports = { askIntent, intentConfigured, questions, PERSON, PERSON_NOTE, PERSON_FLOOR, DEFAULT_BASE_URL, DEFAULT_MODEL }
