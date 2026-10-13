import test from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'

// The script tests run with nothing installed. jiti only loads druxt-admin's
// ES module here, which Node's own require reads as it is.
const load = Module._load
Module._load = function (request, ...rest) {
  if (request === 'jiti') return (filename) => createRequire(filename)
  return load.call(this, request, ...rest)
}

const require = createRequire(import.meta.url)
const { isDrupalScreen } = require('../../nuxt/lib/drupal-paths.js')
const { isDrupalPath } = require('../../nuxt/server/drupal.js')

test("Drupal's screens and paths go to Drupal", () => {
  for (const path of [
    '/user/login',
    '/admin/content',
    '/product/add/default',
    '/product/3/edit',
    '/node/preview/abc/full',
  ]) {
    assert.equal(isDrupalScreen(path), true, path)
  }
  for (const url of [
    '/jsonapi/products/physical?page[limit]=1',
    '/router/translate-path?path=/blog',
    '/core/misc/drupal.js',
  ]) {
    assert.equal(isDrupalPath(url), true, url)
  }
  assert.equal(isDrupalScreen('/product/3'), false)
  assert.equal(isDrupalPath('/blog'), false)
})

test('a dot segment cannot carry a path past the test under an allowed prefix', () => {
  for (const path of [
    '/node/preview/../../node/1',
    '/node/preview/%2e%2e/%2E%2E/node/1',
    '/product/add/../../node/1',
    '/product/1/edit/..%2f..%2f/node/1',
  ]) {
    assert.equal(isDrupalScreen(path), false, path)
    assert.equal(isDrupalPath(path), false, path)
  }
  for (const url of [
    '/jsonapi/../node/1',
    '/core/%2e%2e/node/1',
    '/themes/..\\node/1',
    '/router/translate-path/../../node/1?x=1',
  ]) {
    assert.equal(isDrupalPath(url), false, url)
  }
})

test('a dot or slash in the query is not part of the path', () => {
  assert.equal(isDrupalPath('/router/translate-path?path=/a/../b'), true)
  assert.equal(isDrupalPath('/jsonapi/products/physical?filter[x]=a%2Fb'), true)
})
