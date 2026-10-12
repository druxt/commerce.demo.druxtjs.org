/**
 * Tests for the files the storefront's generate run writes for search
 * engines and assistants: robots.txt, sitemap.xml, llms.txt and
 * llms-full.txt, from nuxt/lib.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import site from '../nuxt/lib/site.js'
import sitemap from '../nuxt/lib/sitemap.js'
import content from '../nuxt/lib/seo-content.js'
import llms from '../nuxt/lib/llms-txt.js'
import llmsFull from '../nuxt/lib/llms-full-txt.js'

const origin = 'https://commerce.demo.druxtjs.org'

// One collection response of each kind, as Drupal's JSON:API returns them.
const products = {
  data: [
    {
      type: 'product--physical',
      id: 'p1',
      attributes: {
        title: 'Black Headphones',
        path: { alias: '/products/black-headphones' },
        body: {
          processed: '<p>Over the ear, with soft cushions.</p><p>Wired or Bluetooth.</p>',
          summary: '',
        },
      },
      relationships: {
        variations: { data: [{ type: 'product-variation--physical', id: 'v1' }] },
        product_brand: { data: { type: 'taxonomy_term--product_brands', id: 'b1' } },
      },
    },
  ],
  included: [
    {
      type: 'product-variation--physical',
      id: 'v1',
      attributes: {
        title: 'Black Headphones',
        sku: 'level-headphones',
        price: { formatted: '$49.99' },
      },
    },
    { type: 'taxonomy_term--product_brands', id: 'b1', attributes: { name: 'Level' } },
  ],
  links: { next: { href: 'next-page' } },
}

const articles = {
  data: [
    {
      type: 'node--article',
      id: 'a1',
      attributes: {
        title: 'Thoughtful Gift Ideas',
        path: { alias: '/blog/lifestyle/thoughtful-gift-ideas' },
        body: {
          processed:
            '<h2>Start small</h2><ul><li><strong>Personal touches.</strong> A note.</li></ul><p>See <a href="/catalogue">the catalogue</a>.</p>',
          summary: 'Gifts that feel personal.',
        },
        created: '2025-10-01T00:00:00+00:00',
      },
      relationships: {},
    },
  ],
  links: {},
}

const read = () => {
  const seen = []
  const get = async (url) => {
    seen.push(url)
    if (url === 'next-page') return { data: [], links: {} }
    return url.includes('/node/article')
      ? articles
      : url.includes('/products/physical')
        ? products
        : { data: [] }
  }
  return content.readContent('http://drupal', get).then((docs) => ({ docs, seen }))
}

describe('siteOrigin', () => {
  it('names production when nothing else is known', () => {
    assert.equal(site.siteOrigin({}), origin)
  })

  it("takes a preview's app route over Drupal's first route", () => {
    const env = {
      LAGOON_ROUTE: 'https://nginx.pr-1.example',
      LAGOON_ROUTES: 'https://nginx.pr-1.example,https://app.pr-1.example',
    }
    assert.equal(site.siteOrigin(env), 'https://app.pr-1.example')
  })

  it("gives Drupal's front page alias the home's URL", () => {
    assert.equal(site.canonicalUrl(origin, '/frontpage'), `${origin}/`)
    assert.equal(site.canonicalUrl(origin, '/catalogue/'), `${origin}/catalogue`)
  })
})

describe('sitemap.xml', () => {
  const routes = [
    '/',
    '/catalogue',
    '/shop',
    '/shop/women',
    '/blog',
    '/blog/lifestyle/thoughtful-gift-ideas',
    '/products',
    '/products/black-headphones',
    '/cart',
    '/checkout',
    '/order/12',
    '/druxt/node/preview',
  ]
  const xml = sitemap.buildSitemap(routes, { origin })

  it('lists the home, the listings, products and posts', () => {
    for (const path of [
      '/',
      '/catalogue',
      '/shop',
      '/blog',
      '/blog/lifestyle/thoughtful-gift-ideas',
      '/products/black-headphones',
    ]) {
      assert.ok(xml.includes(`<loc>${origin}${path}</loc>`), path)
    }
  })

  it('leaves out carts, orders, previews, filters and redirects', () => {
    for (const path of ['/cart', '/checkout', '/order/', '/druxt/', '/shop/women', '/products<']) {
      assert.ok(!xml.includes(`${origin}${path}`), path)
    }
  })

  it('ranks the home first and content above listings', () => {
    assert.equal(sitemap.priorityOf('/'), 1)
    assert.equal(sitemap.priorityOf('/products/black-headphones'), 0.8)
    assert.equal(sitemap.priorityOf('/catalogue'), 0.6)
  })
})

describe('robots.txt', () => {
  it('names the sitemap and keeps carts and orders out', () => {
    const robots = sitemap.buildRobots({ origin })
    assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`))
    for (const path of ['/cart', '/checkout', '/order/', '/_nuxt/']) {
      assert.ok(robots.includes(`Disallow: ${path}\n`), path)
    }
  })
})

describe('readContent', () => {
  it('reads every collection and follows the next link', async () => {
    const { docs, seen } = await read()
    assert.equal(seen.length, content.COLLECTIONS.length + 1)
    assert.ok(seen.includes('next-page'))
    assert.deepEqual(
      docs.map((d) => [d.kind, d.path]),
      [
        ['product', '/products/black-headphones'],
        ['article', '/blog/lifestyle/thoughtful-gift-ideas'],
      ]
    )
  })

  it("gives a product its brand and its variations' prices", async () => {
    const [product] = (await read()).docs
    assert.equal(product.brand, 'Level')
    assert.equal(product.description, 'Over the ear, with soft cushions.')
    assert.deepEqual(product.variations, [
      { title: 'Black Headphones', sku: 'level-headphones', price: '$49.99' },
    ])
  })
})

describe('llms.txt', () => {
  it('indexes the products and the blog, with the full text as optional', async () => {
    const text = llms.buildLlmsTxt((await read()).docs, { origin })
    assert.match(text, /^# Druxt Store\n\n> /)
    assert.ok(text.includes('## Products'))
    assert.ok(
      text.includes(
        `- [Black Headphones](${origin}/products/black-headphones?${llms.UTM}): $49.99. Over the ear, with soft cushions.`
      )
    )
    assert.ok(text.includes('## Blog'))
    assert.ok(text.includes('- [DruxtJS](https://druxtjs.org)'))
    assert.ok(text.includes(`## Optional\n\n- [Full text](${origin}/llms-full.txt)`))
  })
})

describe('llms-full.txt', () => {
  it('holds each document in Markdown, after a rule, with a source to cite', async () => {
    const text = llmsFull.buildLlmsFullTxt((await read()).docs, { origin })
    assert.ok(text.includes('---\n\n## Black Headphones'))
    assert.ok(text.includes(`Source: ${origin}/products/black-headphones?${llmsFull.UTM}`))
    assert.ok(text.includes('- Black Headphones: $49.99 (SKU level-headphones)'))
    assert.ok(text.includes('#### Start small'))
    assert.ok(text.includes('- **Personal touches.** A note.'))
    assert.ok(text.includes(`[the catalogue](${origin}/catalogue)`))
    assert.doesNotMatch(text, /<\/?(p|li|ul|strong|h2)\b/)
  })
})
