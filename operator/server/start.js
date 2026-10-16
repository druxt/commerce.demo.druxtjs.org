#!/usr/bin/env node
/**
 * Serve the built console. Drupal's paths are proxied on this origin, the
 * password grant is made here with the consumer's id, and everything else
 * is the Nuxt app.
 */
const http = require('http')
const https = require('https')
const { pipeline } = require('stream')
const httpProxy = require('http-proxy')
const { loadNuxt } = require('nuxt')
const { createTokenRoute } = require('./auth')

const env = process.env
const port = Number(env.PORT) || 3000
const host = env.HOST || '0.0.0.0'
const drupalUrl = (env.DRUPAL_URL || 'http://nginx:8080').replace(/\/+$/, '')
const log = (message) => process.stdout.write(`operator: ${message}\n`)

// The storefront on a preview is its `app.` route; in production .lagoon.yml
// gives it the first route, which STOREFRONT_ORIGIN names.
const previewRoute = () =>
  env.LAGOON_ENVIRONMENT_TYPE === 'production'
    ? ''
    : String(env.LAGOON_ROUTES || '')
        .split(',')
        .map((r) => r.trim())
        .find((r) => /^https?:\/\/app\./.test(r)) || ''
if (!env.STOREFRONT_ORIGIN && previewRoute()) env.STOREFRONT_ORIGIN = previewRoute()

const DRUPAL_PATH = /^\/(?:jsonapi|oauth|router\/translate-path)(?:[/?]|$)/
const TOKEN_PATH = '/_auth/drupal-password/token'
// The concierge route and the live socket live on the storefront's server,
// the `app` service. The socket client opens on the page's own host, so the
// console carries the WebSocket through.
const ASSIST_PATH = '/_assist'
const LIVE_PATH = '/_live'
const hubUrl = (env.HUB_URL || 'http://app:3000').replace(/\/+$/, '')
const live = httpProxy.createProxyServer({ target: hubUrl, ws: true, changeOrigin: true })
live.on('error', (error) => log(`live: ${error.message}`))
// No compression through the console: on Lagoon the hub's deflated frames
// reached the browser without the agreement that allows them, and it closed
// the socket on the first one.
live.on('proxyReqWs', (proxyReq) => proxyReq.removeHeader('sec-websocket-extensions'))

/** Pass a request through to another origin, without this origin's cookies. */
const proxy = (req, res, origin = drupalUrl) => {
  const target = new URL(req.url, origin)
  const headers = { ...req.headers, host: target.host }
  delete headers.cookie
  const client = target.protocol === 'https:' ? https : http
  const upstream = client.request(target, { method: req.method, headers }, (answer) => {
    // No Drupal cookie reaches the browser: the console speaks with a token.
    const headers = { ...answer.headers }
    delete headers['set-cookie']
    res.writeHead(answer.statusCode, headers)
    // pipeline, not pipe: a Drupal body that breaks off ends the browser's
    // response too, rather than leaving it open.
    pipeline(answer, res, () => {})
  })
  upstream.on('error', (error) => {
    log(`drupal: ${error.message}`)
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
  // And a browser that leaves closes the Drupal side.
  pipeline(req, upstream, () => {})
}

async function main() {
  const token = createTokenRoute({
    drupalUrl,
    clientId: env.OAUTH_CLIENT_ID || 'commerce_operator',
  })
  const nuxt = await loadNuxt('start')
  const server = http.createServer((req, res) => {
    const path = req.url.split('?')[0]
    if (path === TOKEN_PATH) return token(req, res)
    if (path === ASSIST_PATH) return proxy(req, res, hubUrl)
    if (path === LIVE_PATH || path.startsWith(`${LIVE_PATH}/`)) return live.web(req, res)
    if (DRUPAL_PATH.test(req.url)) return proxy(req, res)
    return nuxt.render(req, res)
  })
  server.on('upgrade', (req, socket, head) => {
    if (req.url.split('?')[0] === LIVE_PATH) live.ws(req, socket, head)
    else socket.destroy()
  })
  await new Promise((resolve) => server.listen(port, host, resolve))
  log(`console on http://${host}:${port}, Drupal at ${drupalUrl}`)
}

main().catch((error) => {
  log(error.stack || error.message)
  process.exit(1)
})
