/**
 * Proxy mode: Drupal's administration served from this site's own origin.
 *
 * The link mode in `admin.js` sends a reader to the backend. That works
 * everywhere and costs nothing, but it is two sites: two origins, two session
 * cookies, and a reader who has to log in again on arrival. The proxy erases
 * that at the cost of a server. Drupal answers on this origin, its session
 * cookie is first party, and a form posts back to the address it came from.
 *
 * Node's own `http` and `https` only. A proxy is a stream from one socket to
 * another, and the dependency this would otherwise carry would be in the
 * dependency tree of every site that installs the module, including the ones
 * that never turn the proxy on.
 */
import http from 'http'
import https from 'https'
import { URL } from 'url'

import { ADMIN_PATHS, isAdminPath } from './lib/admin.js'

/**
 * Drupal's own paths, beyond the administration screens themselves.
 *
 * An admin screen is not one request. It is the screen, the CSS and JavaScript
 * behind it, the AJAX endpoints its forms call, and the files it shows. Miss
 * one of those and the page arrives unstyled, or a form silently stops
 * submitting, which is worse than not proxying at all.
 *
 * The list stops short of `/node` and `/media`, which a decoupled site renders
 * itself. Their editing paths come back in through `EDIT_PATH`.
 */
export const BACKEND_PATHS = [
  // The endpoints an administration screen talks to while it is open.
  '/batch',
  '/system',
  '/session',
  '/file',
  '/views/ajax',
  '/contextual',
  '/editor',
  '/toolbar',
  '/entity_reference_autocomplete',
  '/update.php',
  // The requests an edit form makes while it is open: a Layout Paragraphs
  // block's dialog, CKEditor's uploads and previews, the media library, link
  // suggestions, the text format tips and the token browser. Missing, each
  // answers 404 from this site and the control quietly does nothing.
  '/layout-paragraphs-builder',
  '/ckeditor5',
  '/media-library',
  '/linkit',
  '/filter',
  '/token',
  // The whole of /user, because a login form that posts to the backend on
  // another origin sets its cookie there, which is the problem the proxy
  // exists to solve.
  '/user',
]

/**
 * The public files directory.
 *
 * `/sites` as a whole is deliberately not in `BACKEND_PATHS`. A proxy makes
 * everything it covers reachable from this origin, and a backend that was only
 * reachable from the Node process is the case where that matters: `/sites`
 * carries each site's settings alongside its files, and only the files are
 * anybody's business here.
 */
export const FILES_PATH = /^\/sites\/[^/]+\/files(\/|$)/

/**
 * The editing paths that hang off a canonical entity route.
 *
 * `/node/12` belongs to the decoupled site. `/node/12/edit` belongs to Drupal,
 * and so does every other operation on it.
 */
export const EDIT_PATH =
  /^\/(node|media|taxonomy\/term|comment|user)\/[^/]+\/(edit|delete|revisions|translations|devel|layout)(\/|$)/

/**
 * Headers that describe one hop and must not be copied to the next.
 *
 * Passing `connection` or `transfer-encoding` through re-frames a response
 * that the receiving end has already framed, and the reader gets a truncated
 * page or a hung request.
 */
const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]

/**
 * Drupal's asset directories. Only a file under one is Drupal's: the bare
 * directory and the paths beside its files are the site's own pages, and
 * `/modules/<name>` is one of them.
 */
export const ASSET_PATHS = ['/core', '/libraries', '/modules', '/profiles', '/themes']
const ASSET_FILE = /\.(css|js|mjs|map|json|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|otf)$/i

/**
 * A dot segment, an encoded separator or a backslash: Drupal's server would
 * normalise it, this proxy sends the path as it came, so a path the allowlist
 * excludes could reach Drupal under an allowed prefix.
 */
const UNSAFE_PATH = /(^|\/)\.\.?(\/|$)|%2e|%2f|%5c|\\/i

/**
 * Whether a request is Drupal's to answer.
 *
 * `options.except` is the way back out: a site that renders one of these
 * paths itself passes a pattern for it, and the proxy leaves it alone. A
 * decoupled site that renders profiles is the case this exists for, because
 * `/user` has to be proxied whole for the login form's cookie and `/user/2`
 * sits inside it.
 */
export function shouldProxy(path, options = {}) {
  const subject = String(path || '').split('?')[0]
  if (!subject) return false
  if (UNSAFE_PATH.test(subject)) return false
  if ((options.except || []).some((pattern) => pattern.test(subject))) return false
  if (isAdminPath(subject, options.paths || ADMIN_PATHS)) return true
  if (EDIT_PATH.test(subject)) return true
  if (FILES_PATH.test(subject)) return true
  if (ASSET_FILE.test(subject) && ASSET_PATHS.some((prefix) => subject.startsWith(`${prefix}/`))) return true
  const prefixes = options.backendPaths || BACKEND_PATHS
  return prefixes.some(
    (prefix) => subject === prefix || subject.startsWith(`${prefix}/`)
  )
}

/**
 * The headers to send upstream.
 *
 * The host is kept as the reader sent it, so Drupal builds its links for this
 * origin and the pages need no rewriting on the way back. That is the whole
 * trick: a proxy that rewrites HTML is a proxy that breaks on the first page
 * whose markup it did not anticipate.
 */
export function upstreamHeaders(
  headers = {},
  { protocol = 'http', remoteAddress = '' } = {}
) {
  const out = {}
  for (const [name, value] of Object.entries(headers)) {
    if (HOP_BY_HOP.includes(name.toLowerCase())) continue
    out[name] = value
  }
  // Drupal reads these to know it is behind something, and to build absolute
  // URLs with the scheme and host the reader actually used. The scheme is the
  // reader's, never the backend's: behind an HTTPS tunnel the backend is still
  // plain HTTP, and a redirect built from its scheme sends the reader off the
  // secure origin.
  out['x-forwarded-host'] = headers['x-forwarded-host'] || headers.host || ''
  out['x-forwarded-proto'] = protocol
  // Appended rather than replaced, so a chain of proxies stays readable.
  const chain = [headers['x-forwarded-for'], remoteAddress].filter(Boolean)
  if (chain.length) out['x-forwarded-for'] = chain.join(', ')
  return out
}

/**
 * The scheme the reader used to reach this site.
 *
 * Something in front of Node, a tunnel or a load balancer, says so in
 * `X-Forwarded-Proto`. Otherwise the socket knows.
 */
export function readerProtocol(req = {}) {
  const forwarded = String((req.headers || {})['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
  if (forwarded === 'https' || forwarded === 'http') return forwarded
  return (req.socket || {}).encrypted ? 'https' : 'http'
}

/**
 * A `Set-Cookie` value, made to belong to this origin.
 *
 * `Domain` is dropped because the backend names itself in it, and a cookie
 * scoped to a host the reader is not on is a cookie the browser throws away.
 * `Secure` is dropped on a plain-HTTP site for the same reason: kept, it makes
 * the session cookie unstorable, and the reader logs in to a login form that
 * loops back to itself.
 */
export function rewriteCookie(value, { secure = false } = {}) {
  return String(value)
    .split(';')
    .map((part) => part.trim())
    .filter((part) => {
      const name = part.split('=')[0].toLowerCase()
      if (name === 'domain') return false
      if (name === 'secure' && !secure) return false
      return true
    })
    .join('; ')
}

/**
 * A `Location` header, made relative to this origin.
 *
 * Drupal redirects with an absolute URL it built from the host it was given.
 * Two absolute forms point back here: the backend's own address, when
 * something upstream answered with it anyway, and this origin's under either
 * scheme. Made relative, the browser keeps whichever scheme it is on, so a
 * backend that thinks it is plain HTTP cannot move an HTTPS reader off it.
 */
export function rewriteLocation(value, baseUrl, host) {
  const location = String(value || '')
  const bases = [String(baseUrl || '').replace(/\/+$/, '')]
  if (host) bases.push(`http://${host}`, `https://${host}`)
  for (const base of bases) {
    if (!base) continue
    if (location === base) return '/'
    if (location.startsWith(`${base}/`) || location.startsWith(`${base}?`)) {
      return location.slice(base.length)
    }
  }
  return location
}

/** The response headers to send back, with the two rewrites applied. */
export function downstreamHeaders(
  headers = {},
  { baseUrl, secure, host } = {}
) {
  const out = {}
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase()
    if (HOP_BY_HOP.includes(key)) continue
    if (key === 'set-cookie') {
      const cookies = Array.isArray(value) ? value : [value]
      out[name] = cookies.map((cookie) => rewriteCookie(cookie, { secure }))
      continue
    }
    if (key === 'location') {
      out[name] = rewriteLocation(value, baseUrl, host)
      continue
    }
    out[name] = value
  }
  return out
}

/**
 * The connect-style middleware Nuxt registers.
 *
 * Nothing is buffered. The request streams upstream and the response streams
 * back, so a file upload or a long report does not sit in the Node process's
 * memory on its way through.
 */
export function createProxy(options = {}) {
  const baseUrl = String(options.baseUrl || '').replace(/\/+$/, '')
  const target = baseUrl ? new URL(baseUrl) : null
  const transport = target && target.protocol === 'https:' ? https : http
  const onError =
    options.onError ||
    ((error, req, res) => {
      // Once the status and headers are on the wire there is no 502 to send;
      // the client gets a cut-off body, which is the truth of what happened.
      if (res.headersSent) return res.destroy()
      res.statusCode = 502
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end(`The backend could not be reached: ${error.message}\n`)
    })
  const timeout = Number(options.timeout) > 0 ? Number(options.timeout) : 30000

  return function druxtAdminProxy(req, res, next) {
    // A site with no backend configured has nothing to proxy to. Falling
    // through lets Nuxt render whatever it would have rendered, which is the
    // same thing link mode does when it has no address.
    if (!target || !shouldProxy(req.url, options)) return next()

    // Per request, not per build: the same server can be reached over plain
    // HTTP on a laptop and over HTTPS through a tunnel at the same moment.
    const protocol = readerProtocol(req)
    const secure =
      typeof options.secure === 'boolean'
        ? options.secure
        : protocol === 'https'

    const upstream = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        method: req.method,
        path: `${target.pathname.replace(/\/$/, '')}${req.url}`,
        headers: upstreamHeaders(req.headers, {
          protocol,
          remoteAddress: req.socket.remoteAddress,
        }),
      },
      (response) => {
        res.writeHead(
          response.statusCode,
          downstreamHeaders(response.headers, {
            baseUrl,
            secure,
            host: req.headers.host,
          })
        )
        response.pipe(res)
      }
    )

    upstream.on('error', (error) => onError(error, req, res))
    // A backend that answers nothing holds the socket and the reader with it.
    upstream.setTimeout(timeout, () => upstream.destroy(new Error(`no answer within ${timeout} ms`)))
    // A reader who leaves takes the upstream request with them.
    res.on('close', () => {
      if (!res.writableEnded) upstream.destroy()
    })
    req.pipe(upstream)
  }
}
