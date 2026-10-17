/**
 * Builder for `/llms-full.txt`: the content itself, so an assistant can take
 * the store in one request instead of following the links in `/llms.txt`.
 * Each document comes after a rule, its title an H2, a `Source:` line to
 * cite, and its text as Markdown. A product lists its variations' prices.
 *
 * Pure and side-effect free, so it can be tested without a build.
 */

const { SITE_NAME, SITE_DESCRIPTION } = require('./site')
const { htmlToMarkdown } = require('./html-to-markdown')

/**
 * UTM params on each `Source:` URL, apart from llms.txt's so the two files
 * can be told apart in analytics. The page's canonical keeps them out of
 * search.
 */
const UTM = 'utm_source=llms-full-txt&utm_medium=ai&utm_campaign=syndication'

/** A document's title is an H2, so a heading in a body drops two levels. */
const HEADING_OFFSET = 2

/** A variation as a list item, with its price and SKU. */
const variationLine = (v) => `- ${v.title}: ${v.price}` + (v.sku ? ` (SKU ${v.sku})` : '')

/** One document, from its rule to its last block. */
const section = (doc, origin) => {
  const blocks = ['---', '## ' + doc.title, `Source: ${origin}${doc.path}?${UTM}`]
  if (doc.brand) blocks.push('Brand: ' + doc.brand)
  if (doc.variations.length) blocks.push(doc.variations.map(variationLine).join('\n'))
  const body = htmlToMarkdown(doc.bodyHtml, { origin, headingOffset: HEADING_OFFSET })
  if (body) blocks.push(body)
  return blocks
}

/**
 * Render `/llms-full.txt`, products before blog posts, in the order of
 * `/llms.txt`.
 *
 * @param {object[]} docs - Documents from readContent().
 * @param {object} options - { origin }.
 * @returns {string} The complete file, ending in a newline.
 */
function buildLlmsFullTxt(docs, { origin }) {
  const blocks = [
    `# ${SITE_NAME}: full text`,
    '> ' + SITE_DESCRIPTION,
    `Every product and blog post on ${SITE_NAME} in full. Each document starts after a horizontal rule, with its title as an H2 and a \`Source:\` line giving its URL: cite that, not this file. The index of the site is at ${origin}/llms.txt.`,
  ]
  for (const kind of ['product', 'article']) {
    for (const doc of docs.filter((d) => d.kind === kind)) blocks.push(...section(doc, origin))
  }
  return blocks.join('\n\n').trimEnd() + '\n'
}

module.exports = { buildLlmsFullTxt, UTM }
