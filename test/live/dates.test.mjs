import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { postDate } = require('../../nuxt/lib/dates.js')

// Drupal wrote this post late on 20 August, in its own timezone, UTC: already
// 21 August in Sydney, still 20 August in Los Angeles.
const CREATED = '2025-08-20T15:32:10+00:00'

test("a post's date is Drupal's, whatever the reader's timezone", () => {
  const zone = process.env.TZ
  try {
    for (const tz of ['UTC', 'Australia/Sydney', 'America/Los_Angeles']) {
      process.env.TZ = tz
      assert.equal(postDate(CREATED), '20 Aug 2025', tz)
      assert.equal(postDate(CREATED, 'long'), '20 August 2025', tz)
    }
  } finally {
    if (zone === undefined) delete process.env.TZ
    else process.env.TZ = zone
  }
})

test('a post with no date has none', () => {
  assert.equal(postDate(''), '')
  assert.equal(postDate(undefined), '')
})
