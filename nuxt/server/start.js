#!/usr/bin/env node
/**
 * Start the storefront: hold the port while Drupal comes up, generate the
 * site against it, then serve the generated files with Drupal's paths
 * proxied on the same origin.
 *
 * The build reads Drupal (the catalogue, the front page's layout, the display
 * schemas), so it runs here rather than in the image, where the
 * environment's own Drupal does not exist yet. Each deploy reinstalls Drupal,
 * so the post-rollout task asks for a fresh build with `POST /_regenerate`;
 * the old build serves until the new one is complete.
 */
const fs = require('fs')
const http = require('http')
const path = require('path')
const zlib = require('zlib')
const { pipeline } = require('stream')
const { spawn } = require('child_process')
const { attachSockets, purgeHandler } = require('@druxt-contrib/sockets/server')
const { previewRoute } = require('../lib/site')
const liveHandlers = require('./live/handlers')
const { nameFor } = require('./live/names')
const { createDrupalProxy, isDrupalPath, waitForDrupal } = require('./drupal')
const { createStartingHandler } = require('./starting')

const rootDir = path.join(__dirname, '..')
const env = process.env
const port = Number(env.PORT) || 3000
const host = env.HOST || '0.0.0.0'
const drupalUrl = env.DRUPAL_URL || 'http://nginx:8080'
// The origin visitors reach the site on: on Lagoon, production's first route,
// which .lagoon.yml gives to this service, or a preview's `app.` route.
const siteOrigin = (
  env.SITE_ORIGIN ||
  previewRoute(env) ||
  env.LAGOON_ROUTE ||
  `http://127.0.0.1:${port}`
).replace(/\/+$/, '')
const loopback = path.join(__dirname, 'loopback.js')
// Hosts a regenerate request may name: only the internal network reaches
// the container under these, never a public route.
const internalHosts = (env.REGENERATE_HOSTS || 'app,localhost,127.0.0.1')
  .split(',')
  .map((name) => name.trim())
const log = (message) => process.stdout.write(`start: ${message}\n`)

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
}

// What the starting page reports until the first build serves.
const state = { phase: 'waiting', since: new Date().toISOString() }
const setPhase = (phase) => {
  state.phase = phase
  state.since = new Date().toISOString()
}
const starting = createStartingHandler(state)

// The generated build being served.
let distDir = null

/**
 * The generated file for a request path: the file itself, else the route's
 * index.html, else the client-side fallback.
 *
 * @param {string} pathname - The decoded request path.
 * @returns {string} An absolute path inside the dist directory.
 */
const resolveFile = (pathname) => {
  const file = path.join(distDir, pathname)
  if (!file.startsWith(distDir + path.sep))
    return path.join(distDir, '200.html')
  for (const candidate of [file, path.join(file, 'index.html')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate
    }
  }
  return path.join(distDir, '200.html')
}

/** The types worth compressing: text, scripts, data and SVG. */
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml)|image\/svg)/

/** The encoding a browser takes for a text response, or nothing. */
const compressionFor = (req, type) => {
  if (!COMPRESSIBLE.test(type)) return ''
  const accept = String(req.headers['accept-encoding'] || '')
  if (/\bbr\b/.test(accept)) return 'br'
  if (/\bgzip\b/.test(accept)) return 'gzip'
  return ''
}

const serveStatic = (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost')
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch (e) {
    res.writeHead(400)
    return res.end()
  }
  const file = resolveFile(decoded)
  // A build asset that is not there is a 404, never the page: a page in its
  // place would be cached as the asset for a year.
  if (decoded.startsWith('/_nuxt/') && file.endsWith('200.html')) {
    res.writeHead(404)
    return res.end()
  }
  const headers = {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
  }
  // Hashed assets never change; a page must be checked on every visit, or a
  // phone keeps one whose chunks a later build removed.
  headers['Cache-Control'] = decoded.startsWith('/_nuxt/')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache'
  // Every compressible response varies by encoding, compressed or not, so a
  // cache never hands brotli to a client that asked for none.
  if (COMPRESSIBLE.test(headers['Content-Type'])) {
    headers.Vary = 'Accept-Encoding'
  }
  const encoding = compressionFor(req, headers['Content-Type'])
  if (encoding) headers['Content-Encoding'] = encoding
  const steps = [fs.createReadStream(file)]
  if (encoding === 'br') {
    steps.push(
      zlib.createBrotliCompress({
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 },
      })
    )
  } else if (encoding === 'gzip') {
    steps.push(zlib.createGzip({ level: 6 }))
  }
  // A path with no generated page still gets the app, which renders what it
  // can, but as a 404: a dead link must not read as a page.
  res.writeHead(file.endsWith('200.html') ? 404 : 200, headers)
  // A build swapped out mid-request loses its files: pipeline ends the
  // response, and a compressor's error with it, rather than crash.
  pipeline(...steps, res, () => {})
}

// The running `nuxt generate`, stopped with the server.
let building = null

const generate = (dir) =>
  new Promise((resolve, reject) => {
    const bin = path.join(rootDir, 'node_modules', 'nuxt', 'bin', 'nuxt.js')
    const child = spawn(process.execPath, [bin, 'generate'], {
      cwd: rootDir,
      // The build names the public origin, and reads it through this
      // server's own proxy: see loopback.js.
      env: {
        ...env,
        BASE_URL: siteOrigin,
        GENERATE_DIR: dir,
        LOOPBACK_ORIGIN: siteOrigin,
        LOOPBACK_PORT: String(port),
        NODE_OPTIONS: `${env.NODE_OPTIONS || ''} --require ${loopback}`.trim(),
      },
      stdio: 'inherit',
    })
    building = child
    child.on('error', reject)
    child.on('exit', (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`nuxt generate exited with ${signal || code}`))
    )
  })

let pending = true
let running = false

/** Every file under a directory, as paths relative to it. */
const listFiles = (dir, base = dir) => {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    return entry.isDirectory()
      ? listFiles(file, base)
      : [path.relative(base, file)]
  })
}

// The files the current build made itself, so a swap carries one build back
// and never a growing pile.
let ownAssets = []

/**
 * A page opened before a swap still asks for the chunks and payloads of the
 * build it loaded with, so the previous build's own assets come along until
 * the next swap.
 */
const carryAssets = (from, to) => {
  for (const rel of ownAssets) {
    const src = path.join(from, '_nuxt', rel)
    const dest = path.join(to, '_nuxt', rel)
    if (fs.existsSync(dest) || !fs.existsSync(src)) continue
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
}

/**
 * Generate until no request is pending, swapping each build in once it is
 * complete. A failed build keeps the previous one and tries again.
 */
const cycle = async () => {
  if (running) return
  running = true
  while (pending) {
    pending = false
    setPhase('waiting')
    await waitForDrupal(drupalUrl, log)
    setPhase('building')
    // Always the same directory while it builds: GENERATE_DIR is read in
    // nuxt.config.js, and Nuxt rebuilds webpack whenever such a value
    // changes. A content change then only renders the pages again.
    const next = path.join(rootDir, 'dist-next')
    const dir = path.join(rootDir, `dist-${Date.now()}`)
    const started = Date.now()
    try {
      fs.rmSync(next, { recursive: true, force: true })
      await generate(next)
      fs.renameSync(next, dir)
    } catch (error) {
      setPhase('failed')
      log(`${error.message}; trying again in 30s`)
      fs.rmSync(next, { recursive: true, force: true })
      pending = true
      await new Promise((resolve) => setTimeout(resolve, 30000))
      continue
    }
    setPhase('starting')
    const previous = distDir
    const own = listFiles(path.join(dir, '_nuxt'))
    if (previous) carryAssets(previous, dir)
    ownAssets = own
    distDir = dir
    if (previous) fs.rmSync(previous, { recursive: true, force: true })
    log(`generated in ${Math.round((Date.now() - started) / 1000)}s`)
  }
  running = false
}

const regenerate = (req, res) => {
  const hostname = String(req.headers.host || '').replace(/:\d+$/, '')
  if (req.method !== 'POST' || !internalHosts.includes(hostname)) {
    return (distDir ? serveStatic : starting)(req, res)
  }
  log('regenerate requested')
  pending = true
  cycle()
  res.writeHead(202)
  res.end()
}

const LLMS_LINK = [
  '</llms.txt>; rel="describedby"; type="text/markdown"',
  '</llms-full.txt>; rel="describedby"; type="text/markdown"',
].join(', ')

const drupal = createDrupalProxy(drupalUrl)

// The live socket on /_live, with the storefront's own channels, and the
// endpoint Drupal's purger posts invalidated tags to. No secret, no endpoint.
const live = liveHandlers({ drupalUrl, log })
const liveSecret = env.DRUXT_SOCKETS_SECRET || ''
let sockets = null
let purge = null

const server = http.createServer((req, res) => {
  if (purge && req.url.split('?')[0] === '/_live/purge') return purge(req, res)
  if (isDrupalPath(req.url)) return drupal(req, res)
  if (req.url === '/_regenerate') return regenerate(req, res)
  // Once a build serves, the starting page's status poll must fail, so the
  // page reloads into the site instead of reading the fallback page as JSON.
  if (distDir && req.url.split('?')[0] === '/__status') {
    res.writeHead(404)
    return res.end()
  }
  // llms.txt discovery (https://llmstxt.org): every response the storefront
  // serves points at the index and the full text, for a client that never
  // reads the page's own <link>.
  res.setHeader('Link', LLMS_LINK)
  return (distDir ? serveStatic : starting)(req, res)
})

const main = async () => {
  // Builds left by an earlier run are never served again.
  for (const name of fs.readdirSync(rootDir)) {
    if (name.startsWith('dist-')) {
      fs.rmSync(path.join(rootDir, name), { recursive: true, force: true })
    }
  }
  sockets = attachSockets(server, { path: '/_live', drupalUrl, handlers: live, log, name: nameFor })
  live.watch(sockets)
  if (liveSecret) purge = purgeHandler(sockets, { secret: liveSecret })
  else log('live: DRUXT_SOCKETS_SECRET is not set, so Drupal cannot tell the hub what changed')
  await new Promise((resolve) => server.listen(port, host, resolve))
  log(`starting page on http://${host}:${port}`)
  await cycle()
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (building) building.kill(signal)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 10000).unref()
  })
}

main().catch((error) => {
  process.stderr.write(`start: ${error.stack || error}\n`)
  // Exit so the platform restarts the container and tries again.
  process.exit(1)
})
