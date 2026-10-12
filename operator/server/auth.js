/**
 * The password grant, made by the server. The browser posts username and
 * password here, this posts them to Drupal with the consumer's id and the
 * console's scope, and the token comes back as Drupal gave it. Only the two
 * grants druxt-auth makes are forwarded, so nothing else is minted in the
 * console's name.
 */
const GRANTS = new Map([
  ['password', ['username', 'password']],
  ['refresh_token', ['refresh_token']],
])

// A body over the limit resolves to null and gets a 413. The rest of it is
// read and dropped, so the answer still reaches the browser.
const readJson = (req) =>
  new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      if (body === null) return
      body += chunk
      if (body.length > 64 * 1024) {
        body = null
        resolve(null)
      }
    })
    req.on('end', () => {
      if (body === null) return
      try {
        resolve(JSON.parse(body || '{}'))
      } catch {
        resolve({})
      }
    })
  })

const createTokenRoute =
  ({ drupalUrl, clientId, scope = 'operator', fetch: request = globalThis.fetch }) =>
  async (req, res) => {
    const reply = (status, body = '') => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(body)
    }
    if (req.method !== 'POST') return reply(405, '{"error":"method_not_allowed"}')
    const data = await readJson(req)
    if (data === null) return reply(413, '{"error":"request_too_large"}')
    const fields = GRANTS.get(data.grant_type)
    if (!fields) return reply(400, '{"error":"unsupported_grant_type"}')
    const form = new URLSearchParams({ grant_type: data.grant_type, client_id: clientId, scope })
    for (const field of fields) if (data[field] !== undefined) form.set(field, String(data[field]))
    const upstream = await request(new URL('/oauth/token', drupalUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form.toString(),
    }).catch(() => null)
    if (!upstream) return reply(502, '{"error":"drupal_unreachable"}')
    reply(upstream.status, await upstream.text())
  }

module.exports = { createTokenRoute, GRANTS }
