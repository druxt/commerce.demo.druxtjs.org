/**
 * The compact catalogue the concierge reads and the picks are checked
 * against: one line per variation, from Drupal, as anyone may read it.
 * Cached for five minutes; a failed refetch keeps serving the last answer.
 */
const JSON_API = 'application/vnd.api+json'
const PATHS = [
  '/jsonapi/products/physical?include=variations,product_collections,product_brand&page[limit]=50',
  '/jsonapi/products/media?include=variations,product_collections&page[limit]=50',
]

const attr = (r, key) => ((r || {}).attributes || {})[key]
const refs = (r, key) => {
  const data = (((r || {}).relationships || {})[key] || {}).data
  return Array.isArray(data) ? data : data ? [data] : []
}

/** Flatten one JSON:API document of products to catalogue lines. */
const linesOf = (body = {}) => {
  const included = new Map((body.included || []).map((r) => [`${r.type}:${r.id}`, r]))
  const find = (ref) => included.get(`${ref.type}:${ref.id}`)
  const lines = []
  for (const product of body.data || []) {
    const collections = refs(product, 'product_collections').map(find).filter(Boolean)
    const brand = refs(product, 'product_brand').map(find).filter(Boolean)[0]
    for (const variation of refs(product, 'variations').map(find).filter(Boolean)) {
      const sku = attr(variation, 'sku')
      if (!sku) continue
      lines.push({
        sku,
        title: attr(variation, 'title') || attr(product, 'title'),
        product: attr(product, 'title'),
        category: attr(collections[0], 'name') || '',
        price: Number((attr(variation, 'price') || {}).number || 0),
        brand: attr(brand, 'name') || '',
      })
    }
  }
  return lines
}

const compactCatalogue = async (drupalUrl, { fetch: request = globalThis.fetch, timeoutMs = 10000 } = {}) => {
  const lines = []
  for (const path of PATHS) {
    // JSON:API gives at most 50 products a page, so follow next to the last.
    for (let url = new URL(path, drupalUrl); url; ) {
      // A stalled Drupal times out, and the last catalogue answers instead.
      const res = await request(url, { headers: { Accept: JSON_API }, signal: AbortSignal.timeout(timeoutMs) })
      if (!res.ok) throw new Error(`Drupal answered ${res.status} for ${path.split('?')[0]}`)
      const body = await res.json()
      lines.push(...linesOf(body))
      const next = ((body.links || {}).next || {}).href
      url = next ? new URL(next) : null
    }
  }
  return lines
}

const cachedCatalogue = (drupalUrl, { fetch: request = globalThis.fetch, ttlMs = 300000, now = Date.now, log = () => {} } = {}) => {
  let last = { lines: [], at: 0 }
  let inflight = null
  return async () => {
    if (last.lines.length && now() - last.at < ttlMs) return last.lines
    if (!inflight) {
      inflight = compactCatalogue(drupalUrl, { fetch: request })
        .then((lines) => {
          last = { lines, at: now() }
          return lines
        })
        .catch((error) => {
          log(`catalogue: ${error.message}`)
          return last.lines
        })
        .finally(() => {
          inflight = null
        })
    }
    return inflight
  }
}

module.exports = { compactCatalogue, cachedCatalogue, linesOf }
