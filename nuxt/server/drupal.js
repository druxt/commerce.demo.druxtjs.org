/**
 * What the start script needs from Drupal: a readiness check, and a proxy
 * that hands Drupal's paths to it from the storefront's own origin, so the
 * anonymous cart's session cookie is first party.
 */
const http = require('http')
const https = require('https')
const { pipeline } = require('stream')
const { isDrupalScreen, isSafePath } = require('../lib/drupal-paths')

// Paths Drupal answers: JSON:API (carts and checkout included), the router,
// uploaded files, and the theme and core assets its markup points at.
const DRUPAL_PATH =
  /^\/(?:jsonapi|router\/translate-path|sites\/default\/files|themes|core|modules|profiles)(?:[/?]|$)/

/**
 * Whether a request path belongs to Drupal.
 *
 * @param {string} url - The request URL.
 * @returns {boolean} True for a Drupal path.
 */
const isDrupalPath = (url) => {
  const pathname = url.split('?')[0]
  return isSafePath(pathname) && (DRUPAL_PATH.test(url) || isDrupalScreen(pathname))
}

/**
 * GET a URL and parse a 200 response's JSON body.
 *
 * @param {string} url - The URL.
 * @returns {Promise<object|null>} The body, or null for any other outcome.
 */
const getJson = (url) =>
  new Promise((resolve) => {
    const target = new URL(url)
    const client = target.protocol === 'https:' ? https : http
    const req = client.get(
      target,
      { headers: { Accept: 'application/vnd.api+json' }, timeout: 10000 },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          try {
            resolve(res.statusCode === 200 ? JSON.parse(body) : null)
          } catch (e) {
            resolve(null)
          }
        })
      }
    )
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(null))
  })

/**
 * Whether Drupal is provisioned: JSON:API answers with commerce_api's
 * product resources, which provisioning enables late, and the demo content
 * has products in them.
 *
 * @param {string} baseUrl - Drupal's base URL.
 * @returns {Promise<boolean>} True once both answer.
 */
const drupalReady = async (baseUrl) => {
  const index = await getJson(new URL('/jsonapi', baseUrl).href)
  const link = ((index && index.links) || {})['product--physical']
  if (!link) return false
  const products = await getJson(
    new URL('/jsonapi/products/physical?page[limit]=1', baseUrl).href
  )
  return Boolean(products && (products.data || []).length)
}

/**
 * Wait until Drupal is ready, logging once a minute until it is.
 *
 * @param {string} baseUrl - Drupal's base URL.
 * @param {Function} log - Logs a line.
 * @returns {Promise<void>} Resolves when Drupal is ready.
 */
const waitForDrupal = async (baseUrl, log) => {
  const started = Date.now()
  let logged = 0
  while (!(await drupalReady(baseUrl))) {
    if (Date.now() - logged >= 60000) {
      const waited = Math.round((Date.now() - started) / 1000)
      log(`waiting for Drupal at ${baseUrl} (${waited}s)`)
      logged = Date.now()
    }
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
}

// Headers that describe one connection, not the message, so never forwarded.
const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]
const endToEnd = (headers) => {
  const out = { ...headers }
  // A header the Connection value names is this hop's too (RFC 9110).
  const named = String(headers.connection || '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
  for (const name of [...named, ...HOP_BY_HOP]) delete out[name]
  return out
}

/**
 * A request listener that streams a request to Drupal and the answer back.
 * The Host and forwarded headers pass through, so Drupal's links name the
 * origin the visitor asked for.
 *
 * @param {string} baseUrl - Drupal's base URL.
 * @returns {Function} The request listener.
 */
const createDrupalProxy = (baseUrl) => {
  const target = new URL(baseUrl)
  const client = target.protocol === 'https:' ? https : http
  return (req, res) => {
    const upstream = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: req.method,
        path: req.url,
        headers: endToEnd(req.headers),
        timeout: 60000,
      },
      (answer) => {
        res.writeHead(answer.statusCode, endToEnd(answer.headers))
        pipeline(answer, res, () => {})
      }
    )
    upstream.on('timeout', () => upstream.destroy())
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502)
      res.end()
    })
    // pipeline, not pipe: a visitor who leaves closes the Drupal side too.
    pipeline(req, upstream, () => {})
  }
}

module.exports = { createDrupalProxy, isDrupalPath, waitForDrupal }
