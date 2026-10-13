/**
 * Start developing: bring up the backend if (and only if) BASE_URL points
 * at the local .devtools PHP server, then run the Nuxt dev server.
 *
 * DDEV / remote backends are used as-is and never started from here.
 */

import {
  FRONTEND_PORTS,
  NUXT_DIR,
  ensureBackend,
  exitWithError,
  firstFreePort,
  foregroundNpm,
  isPortOpen,
} from './lib.mjs'

// Nuxt binds 0.0.0.0 (see nuxt.config.js), which answers on loopback
// too, so this is the probe for "is that port taken".
const HOST = '127.0.0.1'
const PORT_RANGE = `${FRONTEND_PORTS[0]}-${FRONTEND_PORTS[FRONTEND_PORTS.length - 1]}`
const ENV_PORT = Number(process.env.PORT)
// A usable PORT in the environment is a decision; the default is only a
// starting point. An empty or unparsable one is neither.
const PORT_IS_EXPLICIT = Number.isInteger(ENV_PORT) && ENV_PORT > 0
const REQUESTED_PORT = PORT_IS_EXPLICIT ? ENV_PORT : FRONTEND_PORTS[0]

/**
 * Pick the port to serve the frontend on.
 *
 * Nuxt's dev server does not fail on a busy port, it falls back to a
 * random one, and everything that advertises the frontend URL then
 * points at the wrong place. Taking the next free port and saying so
 * keeps the address knowable. A port the user named is theirs.
 *
 * Something else can still take the port between this check and Nuxt
 * binding it, which lands back on Nuxt's own random fallback - the same
 * place an unguarded start would have been anyway.
 */
async function resolveFrontendPort() {
  if (!(await isPortOpen(HOST, REQUESTED_PORT))) {
    return REQUESTED_PORT
  }

  if (PORT_IS_EXPLICIT) {
    exitWithError(
      `Port ${REQUESTED_PORT} is already in use, and PORT asks for it by name.\n\n` +
        `  Nuxt would fall back to a random port. Free it (another dev server,\n` +
        `  or another copy of this project), or drop PORT and let\n` +
        `  \`npm run dev\` take the first free one of ${PORT_RANGE}.`
    )
  }

  const port = await firstFreePort(HOST)
  if (port === null) {
    exitWithError(
      `Ports ${PORT_RANGE} are all in use.\n\n` +
        `  Nuxt would fall back to a random port. Free one of them, or choose\n` +
        `  another deliberately with \`PORT=<port> npm run dev\`.`
    )
  }

  console.log(`Port ${REQUESTED_PORT} is in use - starting on ${port} instead.`)
  console.log('')
  return port
}

async function main() {
  await ensureBackend()
  // Last thing before the spawn. Everything above is config, and none of
  // it needs the port, so choosing one here leaves the smallest window
  // for another process to take it in the meantime.
  const port = await resolveFrontendPort()
  console.log(`Starting the Nuxt dev server -> http://localhost:${port}`)
  console.log('')
  process.exitCode = await foregroundNpm(['run', 'dev'], {
    cwd: NUXT_DIR,
    env: { PORT: String(port) },
  })
}

main().catch((error) => exitWithError(error.message))
