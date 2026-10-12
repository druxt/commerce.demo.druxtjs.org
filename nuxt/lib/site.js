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

module.exports = { previewRoute }
