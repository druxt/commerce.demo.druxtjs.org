/**
 * Run Laya for the concierge's intent model in development: an
 * open-weights model that answers on Jev's protocol, so the code that
 * asks TypeSafe's hosted Jev in production asks this instead.
 *
 * The first run makes a Python virtualenv in .laya/ with CPU-only torch
 * and downloads the typed-decisions checkpoint (about 1.6 GB). Then it
 * serves on loopback until stopped. Point the storefront at it in .env:
 *
 *   TYPESAFE_BASE_URL=http://127.0.0.1:8765
 *   ASSIST_INTENT_MODEL=typed-decisions
 */

import fs from 'node:fs'
import path from 'node:path'
import { ROOT, exitWithError, foreground, run, toolAvailable } from './lib.mjs'

const LAYA_VERSION = '0.4.8'
const DIR = path.join(ROOT, '.laya')
const VENV = path.join(DIR, 'venv')
const BIN = path.join(VENV, process.platform === 'win32' ? 'Scripts' : 'bin')
const PORT = process.env.LAYA_PORT || '8765'
const PYTHON = ['python3', 'python'].find((p) => toolAvailable(p, ['--version']))

try {
  if (!fs.existsSync(path.join(BIN, 'laya-serve'))) {
    if (!PYTHON)
      exitWithError(
        'Laya needs Python 3.10 or newer, and neither python3 nor python is on the PATH.'
      )
    console.log(`Installing Laya ${LAYA_VERSION} with CPU-only torch into .laya/ (first run only).`)
    run(PYTHON, ['-m', 'venv', VENV])
    const pip = path.join(BIN, 'pip')
    run(pip, ['install', '--quiet', '--index-url', 'https://download.pytorch.org/whl/cpu', 'torch'])
    run(pip, ['install', '--quiet', `laya[serve]==${LAYA_VERSION}`])
  }
  console.log(`Laya on http://127.0.0.1:${PORT} (the first start downloads the checkpoint).`)
  process.exitCode = await foreground(path.join(BIN, 'laya-serve'), [], {
    env: {
      HF_HOME: path.join(DIR, 'hf'),
      LAYA_HOST: '127.0.0.1',
      LAYA_PORT: PORT,
      LAYA_DEVICE: 'cpu',
      LAYA_MODELS: 'typed-decisions',
      LAYA_MAX_LOADED: '1',
    },
  })
} catch (error) {
  exitWithError(error.message)
}
