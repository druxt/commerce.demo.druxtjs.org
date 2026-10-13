// The whole catalogue, fetched once and filtered in the browser.
//
// This is the demo's central claim: facets, search suggestions and related
// products all read this one hydrated collection, so none of them makes a
// request of its own. Kickstart has a few dozen products, which is what makes
// one fetch the right call; a catalogue of thousands would page instead.

import { DrupalJsonApiParams } from 'drupal-jsonapi-params'

// Kickstart splits its products across two types, each its own resource.
const BUNDLES = ['product--physical', 'product--media']

// Bands chosen so the furniture is not all in one bucket.
export const PRICE_BANDS = [
  { key: 'under-50', label: 'Under $50', test: (n) => n < 50 },
  { key: '50-150', label: '$50 – $150', test: (n) => n >= 50 && n <= 150 },
  { key: 'over-150', label: 'Over $150', test: (n) => n > 150 },
]

const attr = (r, key) => ((r || {}).attributes || {})[key]
const refs = (r, key) => ((((r || {}).relationships || {})[key] || {}).data) || []
const asList = (data) => (Array.isArray(data) ? data : data ? [data] : [])

// A product as every listing reads it: flat, with references resolved.
export const toItem = (product, find, rootOf) => {
  const variations = refs(product, 'variations').map(find).filter(Boolean).map((v) => ({
    id: v.id,
    type: v.type,
    title: attr(v, 'title'),
    sku: attr(v, 'sku'),
    price: (attr(v, 'price') || {}).formatted || '',
    amount: Number((attr(v, 'price') || {}).number || 0),
  }))
  const images = refs(product, 'images').map(find).filter(Boolean)
    .map((f) => (attr(f, 'uri') || {}).url).filter(Boolean)
  const terms = refs(product, 'product_collections').map(find).filter(Boolean)
  const brand = asList((product.relationships || {}).product_brand && product.relationships.product_brand.data)
    .map(find).filter(Boolean)[0]
  const first = variations[0] || {}
  const body = (attr(product, 'body') || {}).processed || ''

  return {
    id: product.id,
    type: product.type,
    title: attr(product, 'title'),
    path: (attr(product, 'path') || {}).alias || `/product/${product.id}`,
    summary: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    image: images[0] || '',
    images,
    variations,
    sku: first.sku || '',
    price: first.price || '',
    amount: first.amount || 0,
    // The top of the collection tree is the category: "Women", not "Beauty".
    category: (terms[0] && rootOf(terms[0].id)) || '',
    collections: terms.map((t) => attr(t, 'name')),
    brand: attr(brand, 'name') || '',
  }
}

export const state = () => ({
  items: [],
  loaded: false,
})

export const getters = {
  byPath: (state) => (path) => state.items.find((i) => i.path === path),
  categories: (state) => [...new Set(state.items.map((i) => i.category).filter(Boolean))].sort(),
  brands: (state) => [...new Set(state.items.map((i) => i.brand).filter(Boolean))].sort(),
}

export const mutations = {
  setItems(state, items) {
    state.items = items
    state.loaded = true
  },
}

// One request in flight per tab, however many components ask for it. Only in
// the browser: on the server this module is shared by every request.
let pending

// Every page of a collection, each with its own `included`. JSON:API gives
// at most 50 resources a page.
const allPages = async (dispatch, type, params) => {
  const pages = []
  for (let offset = 0; ; offset += 50) {
    const query = params().addPageLimit(50).addPageOffset(offset)
    const page = await dispatch('druxt/getCollection', { type, query }, { root: true })
    pages.push(page)
    if (!(page.links || {}).next) return pages
  }
}

const fetchAll = async (dispatch) => {
  const results = await Promise.all([
    ...BUNDLES.map((type) =>
      allPages(dispatch, type, () =>
        new DrupalJsonApiParams().addInclude(['variations', 'images', 'product_collections', 'product_brand'])
      )
    ),
    // Collections are a tree; the parents name the top-level categories.
    allPages(dispatch, 'taxonomy_term--product_collections', () =>
      new DrupalJsonApiParams().addFields('taxonomy_term--product_collections', ['name', 'parent'])
    ),
  ])

  const terms = results.pop().flatMap((page) => page.data || [])
  const term = (id) => terms.find((t) => t.id === id)
  const rootOf = (id) => {
    let t = term(id)
    for (let up = refs(t, 'parent')[0]; up && term(up.id); up = refs(t, 'parent')[0]) t = term(up.id)
    return attr(t, 'name')
  }

  return results.flat().flatMap((collection) => {
    const included = collection.included || []
    const find = (ref) => ref && included.find((r) => r.id === ref.id && r.type === ref.type)
    return (collection.data || []).map((p) => toItem(p, find, rootOf))
  })
}

export const actions = {
  async load({ state, commit, dispatch }) {
    if (state.loaded) return state.items
    const request = process.server ? fetchAll(dispatch) : (pending = pending || fetchAll(dispatch))
    try {
      const items = await request
      commit('setItems', items)
      return items
    } finally {
      pending = undefined
    }
  },
}
