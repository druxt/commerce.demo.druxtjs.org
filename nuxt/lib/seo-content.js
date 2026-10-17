/**
 * The store's content as documents, read from Drupal's JSON:API at build time
 * for llms.txt and llms-full.txt.
 *
 * Pure over the fetched data, so the shaping can be tested without Drupal.
 */

/** The collections with a page each, newest post first and products by name. */
const COLLECTIONS = [
  { kind: 'product', path: '/jsonapi/products/physical', query: 'include=variations,product_brand&sort=title' },
  { kind: 'product', path: '/jsonapi/products/media', query: 'include=variations,product_brand&sort=title' },
  { kind: 'article', path: '/jsonapi/node/article', query: 'filter[status]=1&sort=-created' },
]

/** Text without its markup, one line per block, whitespace collapsed. */
const plainText = (html) =>
  String(html || '')
    .replace(/<\/(p|li|h[1-6]|div)>|<br\s*\/?>/gi, '$&\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')

const related = (resource, name, included) => {
  const data = ((resource.relationships || {})[name] || {}).data
  return [].concat(data || []).map((ref) => included.find((r) => r.id === ref.id && r.type === ref.type)).filter(Boolean)
}

/**
 * One JSON:API resource as a document.
 *
 * @param {object} resource - A product or an article from a collection.
 * @param {string} kind - `product` or `article`.
 * @param {object[]} included - The response's included resources.
 * @returns {object} { path, kind, title, description, bodyHtml, brand, variations, created }
 */
const documentOf = (resource, kind, included = []) => {
  const a = resource.attributes || {}
  const body = a.body || {}
  const alias = (a.path || {}).alias
  // Commerce API leaves out a product's serial id, so a product with no alias
  // falls back to its UUID, as the catalogue's links do.
  const fallback = kind === 'product' ? `/product/${resource.id}` : `/node/${a.drupal_internal__nid}`
  const brand = related(resource, 'product_brand', included)[0]
  return {
    path: alias || fallback,
    kind,
    title: a.title,
    description: plainText(body.summary || body.processed).split('\n')[0],
    bodyHtml: body.processed || '',
    brand: ((brand || {}).attributes || {}).name || '',
    variations: related(resource, 'variations', included).map((v) => ({
      title: v.attributes.title,
      sku: v.attributes.sku,
      price: (v.attributes.price || {}).formatted || '',
    })),
    created: a.created,
  }
}

/**
 * Every published product and blog post, in the order of COLLECTIONS.
 *
 * @param {string} baseUrl - Drupal's origin.
 * @param {function} get - `async (url) => data`: a JSON:API GET.
 * @returns {Promise<object[]>} Documents from documentOf().
 */
async function readContent(baseUrl, get) {
  const docs = []
  for (const { kind, path, query } of COLLECTIONS) {
    let url = `${baseUrl}${path}?${query}&page[limit]=50`
    while (url) {
      const data = await get(url)
      for (const resource of data.data || []) docs.push(documentOf(resource, kind, data.included))
      url = ((data.links || {}).next || {}).href || null
    }
  }
  return docs
}

module.exports = { COLLECTIONS, plainText, documentOf, readContent }
