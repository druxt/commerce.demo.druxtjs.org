// Which paths are Drupal's screens: the druxt-admin test, Commerce's own add
// and edit screens, which it does not know, and Drupal's node preview, whose
// page frames the storefront's preview. One test for `nuxt dev`'s proxy and
// the production server's, so the admin works the same in both.
//
// The druxt-admin module is an ES module; jiti, which Nuxt already uses for
// its own config, loads it into this CommonJS file.
const jiti = require('jiti')(__filename)
const { shouldProxy } = jiti('../modules/druxt-admin/proxy.js')

// The druxt-admin test's refusal, for the paths it does not see. Drupal's
// server normalises a dot segment or an encoded separator away, so a path
// under an allowed prefix could reach another.
const UNSAFE_PATH = /(^|\/)\.\.?(\/|$)|%2e|%2f|%5c|\\/i

/**
 * Whether a path is free of anything Drupal's server would normalise.
 *
 * @param {string} pathname - The request path, without its query.
 * @returns {boolean} True for a path that reaches Drupal as it reads.
 */
const isSafePath = (pathname) => !UNSAFE_PATH.test(pathname)

const DRUPAL_EXTRA_PATH = /^\/((product|store|promotion|order)\/(add(\/|$)|[^/]+\/(edit|delete|variations|layout|translations)(\/|$))|node\/preview\/)/

/**
 * Whether a path is one of Drupal's screens, to be proxied to it.
 *
 * @param {string} pathname - The request path, without its query.
 * @returns {boolean} True for a Drupal screen.
 */
const isDrupalScreen = (pathname) =>
  isSafePath(pathname) && (shouldProxy(pathname) || DRUPAL_EXTRA_PATH.test(pathname))

module.exports = { isDrupalScreen, isSafePath }
