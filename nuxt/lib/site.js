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

module.exports = { previewRoute, liveOrigin }
