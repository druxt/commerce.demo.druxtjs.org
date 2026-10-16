import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { htmlToMarkdown } = require('../nuxt/lib/html-to-markdown.js')

test('a numeric reference outside Unicode text is left as written', () => {
  const md = htmlToMarkdown('<p>a &#xD800; b &#0; c &#x110000; d &#x1F600;</p>')
  assert.ok(md.includes('&#xD800;'), md)
  assert.ok(md.includes('&#0;'), md)
  assert.ok(md.includes('&#x110000;'), md)
  assert.ok(md.includes('\u{1F600}'), md)
  assert.ok(md.isWellFormed(), 'no unpaired surrogate in the output')
})
