/**
 * Builder for `/llms.txt`, the plain-text site index described at
 * https://llmstxt.org. A heading and a blockquote summary open it, and H2
 * sections of `- [name](url): notes` links follow a short preamble.
 *
 * Pure and side-effect free, so it can be tested without a build.
 */

const { SITE_NAME, SITE_DESCRIPTION } = require('./site')

/** UTM params that mark a click from an assistant. The canonical keeps them out of search. */
const UTM = 'utm_source=llms-txt&utm_medium=ai&utm_campaign=syndication'

const PREAMBLE = [
  'Druxt Store is decoupled Drupal with Nuxt. Drupal Commerce holds the products, carts and orders. A Nuxt frontend built with Druxt reads them over JSON:API and renders them in Vue.',
  '',
  "The products and blog posts are Commerce Kickstart's demo content, by Centarro. Orders are real in Drupal, no money moves, and the store resets daily.",
]

const SECTIONS = [
  { kind: 'product', label: 'Products' },
  { kind: 'article', label: 'Blog' },
]

const withUtm = (url) => url + '?' + UTM

const listItem = (title, url, notes) => '- [' + title + '](' + url + ')' + (notes ? ': ' + notes : '')

/** The note after a product's link names its price before the first line of its description. */
const notesOf = (doc) => {
  const price = (doc.variations[0] || {}).price
  return [price, doc.description].filter(Boolean).join('. ')
}

/**
 * Render `/llms.txt`. The full-text companion goes under `## Optional`, the
 * heading the format reserves for what a reader can skip.
 *
 * @param {object[]} docs - Documents from readContent().
 * @param {object} options - { origin }.
 * @returns {string} The complete file, ending in a newline.
 */
function buildLlmsTxt(docs, { origin }) {
  const lines = ['# ' + SITE_NAME, '', '> ' + SITE_DESCRIPTION, '', ...PREAMBLE]

  for (const { kind, label } of SECTIONS) {
    const list = docs.filter((d) => d.kind === kind).map((d) => listItem(d.title, withUtm(origin + d.path), notesOf(d)))
    if (list.length) lines.push('', '## ' + label, '', ...list)
  }

  lines.push(
    '',
    '## Druxt',
    '',
    listItem('DruxtJS', 'https://druxtjs.org', 'The framework the storefront is built with, for Drupal and Vue fully decoupled.'),
    listItem(
      'Source code',
      'https://github.com/druxt/commerce.demo.druxtjs.org',
      'This demo, Drupal and Nuxt, in one repository.'
    ),
    listItem(
      'Commerce Kickstart',
      'https://www.drupal.org/project/commerce_kickstart',
      "Centarro's Drupal Commerce distribution, and the store's catalogue."
    ),
    listItem('Catalogue', withUtm(origin + '/catalogue'), 'Every product, filtered in the browser from one JSON:API request.')
  )

  // No UTM params on the full text: assistants read it and visitors do not
  // open it, and each Source: link inside has its own.
  lines.push(
    '',
    '## Optional',
    '',
    listItem('Full text', origin + '/llms-full.txt', 'Every product and blog post in full, as one Markdown file.')
  )

  return lines.join('\n') + '\n'
}

module.exports = { buildLlmsTxt, withUtm, UTM }
