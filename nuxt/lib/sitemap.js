/**
 * Builders for `/sitemap.xml`, from the routes a generate run wrote, and
 * `/robots.txt`.
 *
 * Pure and side-effect free, so they can be tested without a build.
 */

/**
 * The pages worth listing, with the home ranked first and products and posts
 * above the listings. Anything else the run wrote is one visitor's cart,
 * checkout or order, a preview or a redirect, and stays out.
 */
const CONTENT = [
  { test: /^\/$/, priority: 1.0 },
  { test: /^\/products\/[^/]+$/, priority: 0.8 },
  { test: /^\/blog\/.+$/, priority: 0.8 },
  { test: /^\/(catalogue|blog)$/, priority: 0.6 },
]

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const priorityOf = (path) => (CONTENT.find(({ test }) => test.test(path)) || {}).priority

/** Each content page's path once, without a trailing slash. */
const publicPaths = (routes) => {
  const seen = new Set()
  for (const route of routes) {
    const path = String(route).replace(/\/+$/, '') || '/'
    if (priorityOf(path)) seen.add(path)
  }
  return [...seen].sort()
}

// No <lastmod>: a generate run rewrites every page, so the file time is the build time.
const urlEntry = (origin, path) =>
  [
    '  <url>',
    '    <loc>' + escapeXml(origin + path) + '</loc>',
    '    <changefreq>weekly</changefreq>',
    '    <priority>' + priorityOf(path).toFixed(1) + '</priority>',
    '  </url>',
  ].join('\n')

/**
 * Render `/sitemap.xml`.
 *
 * @param {Iterable<string>} routes - The generated route paths.
 * @param {object} options - { origin }.
 * @returns {string} The complete file, ending in a newline.
 */
function buildSitemap(routes, { origin }) {
  return (
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...publicPaths(routes).map((path) => urlEntry(origin, path)),
      '</urlset>',
    ].join('\n') + '\n'
  )
}

/**
 * Render `/robots.txt`: the store is demonstration content and meant to be
 * indexed. Build assets, one visitor's cart and order, and Drupal's own
 * paths on this origin are the exceptions.
 */
function buildRobots({ origin }) {
  return (
    [
      'User-agent: *',
      'Allow: /',
      '',
      'Disallow: /_nuxt/',
      'Disallow: /cart',
      'Disallow: /checkout',
      'Disallow: /order/',
      'Disallow: /druxt/',
      'Disallow: /jsonapi/',
      'Disallow: /router/',
      '',
      'Sitemap: ' + origin + '/sitemap.xml',
    ].join('\n') + '\n'
  )
}

module.exports = { buildSitemap, buildRobots, publicPaths, priorityOf }
