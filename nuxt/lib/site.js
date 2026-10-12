/**
 * The storefront's identity and origins, shared by the page heads and the
 * files the generate run writes.
 *
 * CommonJS, so nuxt.config.js and the generate hook can require it; the
 * pages import it too.
 */

const SITE_NAME = 'Druxt Store'

/** The home page's title, ahead of the site name. */
const SITE_TITLE = 'Headless commerce with Drupal and Nuxt'

const SITE_DESCRIPTION =
  'A headless commerce demo built on Drupal Commerce Kickstart and served by Nuxt with Druxt over JSON:API.'

/** The share card for a page without a photograph of its own, 1200 by 630. */
const SITE_CARD = '/og/site.png'

const TWITTER_HANDLE = '@DruxtJS'

/**
 * A Lagoon preview's own route for the storefront. A preview has only
 * generated routes, and its first, LAGOON_ROUTE, is Drupal's `nginx.` one;
 * production's first route is the storefront's own domain.
 *
 * @param {object} [env] - The environment.
 * @returns {string} The preview's `app.` route, or an empty string.
 */
const previewRoute = (env = process.env) =>
  env.LAGOON_ENVIRONMENT_TYPE === 'production'
    ? ''
    : String(env.LAGOON_ROUTES || '')
        .split(',')
        .map((r) => r.trim())
        .find((r) => /^https?:\/\/app\./.test(r)) || ''

/**
 * Where browsers open the live socket. Production's domain sits behind a CDN
 * that does not pass WebSockets, so production uses its own generated `app.`
 * route, as the Umami demo does; anywhere else the page's own host serves it.
 * LIVE_ORIGIN names one outright.
 *
 * @param {object} [env] - The environment.
 * @returns {string} The origin, or an empty string for the page's own.
 */
const liveOrigin = (env = process.env) =>
  String(
    env.LIVE_ORIGIN ||
      (env.LAGOON_ENVIRONMENT_TYPE === 'production'
        ? String(env.LAGOON_ROUTES || '')
            .split(',')
            .map((r) => r.trim())
            .find((r) => /^https?:\/\/app\./.test(r))
        : '') ||
      ''
  ).replace(/\/+$/, '')


/**
 * The origin visitors reach the storefront on. The start script hands the
 * build its own origin as LOOPBACK_ORIGIN; on Lagoon that is production's
 * first route or a preview's `app.` one. Production is the fallback.
 *
 * @param {object} [env] - The environment.
 * @returns {string} The origin, without a trailing slash.
 */
const siteOrigin = (env = process.env) =>
  String(
    env.SITE_ORIGIN ||
      env.LOOPBACK_ORIGIN ||
      previewRoute(env) ||
      env.LAGOON_ROUTE ||
      'https://commerce.demo.druxtjs.org'
  ).replace(/\/+$/, '')

/**
 * One URL per page, without a trailing slash. Drupal's alias for the front
 * page is not where visitors find it.
 */
const canonicalPath = (path) => {
  const trimmed = String(path || '/').replace(/\/+$/, '') || '/'
  return trimmed === '/frontpage' ? '/' : trimmed
}

const canonicalUrl = (origin, path) => origin + canonicalPath(path)

/** An absolute URL for a path the storefront serves, such as a Drupal file. */
const absolute = (origin, url) => (/^https?:\/\//.test(url) ? url : origin + url)

module.exports = {
  SITE_NAME,
  SITE_TITLE,
  SITE_DESCRIPTION,
  SITE_CARD,
  TWITTER_HANDLE,
  previewRoute,
  liveOrigin,
  siteOrigin,
  canonicalPath,
  canonicalUrl,
  absolute,
}
