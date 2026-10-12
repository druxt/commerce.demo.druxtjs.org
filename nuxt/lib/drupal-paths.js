// Which paths are Drupal's screens: the druxt-admin test, Commerce's own add
// and edit screens, which it does not know, and Drupal's node preview, whose
// page frames the storefront's preview. One test for `nuxt dev`'s proxy and
// the production server's, so the admin works the same in both.
//
// The druxt-admin module is an ES module; jiti, which Nuxt already uses for
// its own config, loads it into this CommonJS file.
const jiti = require('jiti')(__filename)
const { shouldProxy } = jiti('../modules/druxt-admin/proxy.js')

const DRUPAL_EXTRA_PATH = /^\/((product|store|promotion|order)\/(add(\/|$)|[^/]+\/(edit|delete|variations|layout|translations)(\/|$))|node\/preview\/)/

/**
 * Whether a path is one of Drupal's screens, to be proxied to it.
 *
 * @param {string} pathname - The request path, without its query.
 * @returns {boolean} True for a Drupal screen.
 */
const isDrupalScreen = (pathname) => shouldProxy(pathname) || DRUPAL_EXTRA_PATH.test(pathname)

module.exports = { isDrupalScreen }
