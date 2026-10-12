/**
 * Render the share card, static/og/site.png, from scripts/og-card.html at
 * 1200 by 630, and the square logo, static/og/logo.png, from
 * scripts/og-logo.html at 512. The PNGs are committed, so a build doesn't
 * need a browser.
 *
 * Regenerate with `npm run og:card`. It needs Playwright with a browser
 * installed, which the storefront does not depend on: PLAYWRIGHT names a copy
 * that has one, as in `PLAYWRIGHT=/path/to/node_modules/playwright`.
 */

import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright')

const here = dirname(fileURLToPath(import.meta.url))
const images = [
  { template: 'og-card.html', file: 'site.png', width: 1200, height: 630 },
  { template: 'og-logo.html', file: 'logo.png', width: 512, height: 512 },
]

const browser = await chromium.launch()
for (const { template, file, width, height } of images) {
  const out = join(here, '..', 'static', 'og', file)
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(join(here, template)).href)
  await page.evaluate(() => document.fonts.ready)
  mkdirSync(dirname(out), { recursive: true })
  await page.screenshot({ path: out, type: 'png' })
  await page.close()
  console.log(`wrote ${out}`)
}
await browser.close()
