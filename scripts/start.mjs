/**
 * Production mode, as Lagoon runs it: ensure the backend, then start
 * nuxt/server/start.js, which shows a starting page, generates the site
 * against the backend and serves it with the backend's paths proxied.
 */

import {
  NUXT_DIR,
  ensureBackend,
  exitWithError,
  firstFreePort,
  foregroundNpm,
  readEnv,
} from './lib.mjs'

const HOST = '127.0.0.1'

async function main() {
  await ensureBackend()
  const backend = readEnv().BASE_URL
  if (!backend) exitWithError('No BASE_URL in .env - run `npm run setup` first.')

  const port = await firstFreePort(HOST)
  if (port === null) exitWithError('Ports 3000-3009 are all in use.')
  const origin = `http://localhost:${port}`

  console.log(`Generating and serving the frontend -> ${origin}`)
  console.log('')
  process.exitCode = await foregroundNpm(['run', 'serve'], {
    cwd: NUXT_DIR,
    env: { DRUPAL_URL: backend, SITE_ORIGIN: origin, PORT: String(port), HOST },
  })
}

main().catch((error) => exitWithError(error.message))
