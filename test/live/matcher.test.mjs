import test from 'node:test'
import assert from 'node:assert/strict'
import { match, BUCKETS, CHIPS } from '../../nuxt/server/assist/matcher.js'
import { CATALOGUE } from './catalogue.fixture.mjs'

const skus = new Set(CATALOGUE.map((c) => c.sku))

test('every bucket names only catalogue SKUs, two to four of them, with a short note', () => {
  for (const bucket of BUCKETS) {
    assert.ok(bucket.picks.length >= 2 && bucket.picks.length <= 4, bucket.note)
    for (const p of bucket.picks) assert.ok(skus.has(p.sku), `${p.sku} is not in the catalogue`)
    assert.ok(bucket.note.split(' ').length < 18)
    for (const p of bucket.picks) assert.ok(p.why.split(' ').length <= 10, p.why)
  }
})

test('messages land in the right bucket and the default catches the rest', () => {
  assert.equal(match('a gift under $40', CATALOGUE).bucket, 'gift')
  assert.equal(match('Something to read on a flight', CATALOGUE).bucket, 'read')
  assert.equal(match('a chair for a small kitchen', CATALOGUE).bucket, 'seating')
  assert.equal(match('for a kid, outdoors', CATALOGUE).bucket, 'outdoors')
  assert.equal(match('what pairs with the Cocoa Fedora?', CATALOGUE).bucket, 'pair')
  assert.equal(match('Furnishing a dining room', CATALOGUE).bucket, 'seating')
  assert.equal(match('zxqv', CATALOGUE).bucket, 'default')
  assert.equal(match('', CATALOGUE).picks.length, 3)
  // "her" in "other" is not the scent bucket.
  assert.notEqual(match('another thing', CATALOGUE).bucket, 'scent')
})

test('a pick the catalogue lacks is dropped, and an empty bucket falls to the default', () => {
  const thin = CATALOGUE.filter((c) => c.sku !== 'UT-KnitHat-Green')
  const warm = match('something warm', thin)
  assert.equal(warm.bucket, 'warm')
  assert.ok(warm.picks.every((p) => p.sku !== 'UT-KnitHat-Green'))
  assert.equal(warm.picks.length, 2)
  const books = match(
    'something to read',
    CATALOGUE.filter((c) => !c.sku.startsWith('book-'))
  )
  assert.equal(books.bucket, 'default')
  // With no catalogue at all the default still answers.
  assert.equal(match('anything', []).picks.length, 3)
})

test('the chips are five and the last asks for a person', () => {
  assert.equal(CHIPS.length, 5)
  assert.equal(CHIPS[4], 'Talk to a person')
})
