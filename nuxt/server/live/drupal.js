/**
 * The hub's side of Drupal: its own token, JSON:API reads and writes as the
 * hub account, who a bearer token belongs to, and whether a cart token owns
 * an order. Everything takes a `fetch` so tests need no server.
 */
const JSON_API = 'application/vnd.api+json'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The first error Drupal gives, as an Error. */
const failure = async (res) => {
  const body = await res.json().catch(() => ({}))
  const first = (body.errors || [])[0] || {}
  return new Error(first.detail || first.title || `Drupal answered ${res.status}`)
}

/**
 * A client that speaks to Drupal as the hub's own account, through the
 * `client_credentials` grant. The token is kept until shortly before it
 * expires.
 *
 * @param {object} options - `drupalUrl`, `clientId`, `clientSecret`, `scope`, `fetch`.
 * @returns {{token: Function, get: Function, post: Function, patch: Function}}
 */
const createHubClient = ({
  drupalUrl,
  clientId,
  clientSecret,
  scope = 'hub',
  fetch: request = globalThis.fetch,
}) => {
  let cached = { token: '', until: 0 }

  const token = async () => {
    if (cached.token && Date.now() < cached.until - 30000) return cached.token
    const res = await request(new URL('/oauth/token', drupalUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope,
      }).toString(),
    })
    if (!res.ok) throw await failure(res)
    const body = await res.json()
    cached = {
      token: body.access_token,
      until: Date.now() + (body.expires_in || 300) * 1000,
    }
    return cached.token
  }

  const send = async (method, path, document) =>
    request(new URL(path, drupalUrl), {
      method,
      headers: {
        Authorization: `Bearer ${await token()}`,
        Accept: JSON_API,
        ...(document ? { 'Content-Type': JSON_API } : {}),
      },
      body: document ? JSON.stringify(document) : undefined,
    })

  const call = async (method, path, document) => {
    let res = await send(method, path, document)
    // A reset puts back a database without this token: get a new one, once.
    if (res.status === 401) {
      cached = { token: '', until: 0 }
      res = await send(method, path, document)
    }
    if (!res.ok) throw await failure(res)
    return res.status === 204 ? {} : res.json()
  }

  return {
    token,
    get: (path) => call('GET', path),
    post: (path, document) => call('POST', path, document),
    patch: (path, document) => call('PATCH', path, document),
  }
}

/**
 * The account a bearer token belongs to, with the roles it acts with.
 * Simple OAuth's userinfo proves the token is live and names the account.
 * The roles come from its token debug route, which answers only to a token
 * whose permissions include `debug simple_oauth tokens`: the operator and
 * hub roles hold it and nothing else does, so a 403 there is "no role".
 *
 * @param {string} drupalUrl - Drupal's origin.
 * @param {string} bearer - The token.
 * @param {object} [options] - `fetch`.
 * @returns {Promise<{sub: string, name: string, roles: string[]}|null>}
 */
const accountOf = async (drupalUrl, bearer, { fetch: request = globalThis.fetch } = {}) => {
  if (!bearer || typeof bearer !== 'string' || !/^[\w.-]{20,4096}$/.test(bearer)) return null
  const headers = { Authorization: `Bearer ${bearer}`, Accept: 'application/json' }
  const info = await request(new URL('/oauth/userinfo', drupalUrl), { headers }).catch(() => null)
  if (!info || !info.ok) return null
  const account = await info.json().catch(() => null)
  if (!account || !account.sub) return null
  const debug = await request(new URL('/oauth/debug', drupalUrl), { headers }).catch(() => null)
  const body = debug && debug.ok ? await debug.json().catch(() => ({})) : {}
  const roles = Array.isArray(body.roles) ? body.roles.filter((r) => typeof r === 'string') : []
  return {
    sub: String(account.sub),
    name: account.preferred_username || account.name || 'operator',
    roles,
  }
}

/**
 * The order a cart token owns, through commerce_api's checkout resource,
 * which keeps a placed order readable by its token and answers 403 to
 * anyone else.
 *
 * @param {string} drupalUrl - Drupal's origin.
 * @param {string} uuid - The order's uuid.
 * @param {string} cartToken - The browser's cart token.
 * @param {object} [options] - `fetch`.
 * @returns {Promise<{id: string, number: string, state: string}|null>}
 */
const orderForToken = async (drupalUrl, uuid, cartToken, { fetch: request = globalThis.fetch } = {}) => {
  if (!UUID.test(uuid || '') || !cartToken) return null
  const res = await request(new URL(`/jsonapi/checkout/${uuid}`, drupalUrl), {
    headers: { Accept: JSON_API, 'Commerce-Cart-Token': cartToken },
  }).catch(() => null)
  if (!res || !res.ok) return null
  const body = await res.json().catch(() => ({}))
  if (!body.data) return null
  const attributes = body.data.attributes || {}
  return {
    id: body.data.id,
    number: attributes.order_number,
    state: attributes.state,
    total: (attributes.total_price || {}).formatted || '',
    email: attributes.email || '',
  }
}

module.exports = { createHubClient, accountOf, orderForToken, UUID }
