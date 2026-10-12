#!/usr/bin/env node
/**
 * Serve the built console. Drupal's paths are proxied on this origin, the
 * password grant is made here with the consumer's id, and everything else
 * is the Nuxt app.
 */
const http = require('http')
const https = require('https')
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

/** Pass a Drupal request through, without this origin's cookies. */
const proxy = (req, res) => {
  const target = new URL(req.url, drupalUrl)
  const headers = { ...req.headers, host: target.host }
  delete headers.cookie
  const client = target.protocol === 'https:' ? https : http
  const upstream = client.request(target, { method: req.method, headers }, (answer) => {
    res.writeHead(answer.statusCode, answer.headers)
    answer.pipe(res)
  })
  upstream.on('error', (error) => {
    log(`drupal: ${error.message}`)
    res.statusCode = 502
    res.end()
  })
  req.pipe(upstream)
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
    if (DRUPAL_PATH.test(req.url)) return proxy(req, res)
    return nuxt.render(req, res)
  })
  await new Promise((resolve) => server.listen(port, host, resolve))
  log(`console on http://${host}:${port}, Drupal at ${drupalUrl}`)
}

main().catch((error) => {
  log(error.stack || error.message)
  process.exit(1)
})
