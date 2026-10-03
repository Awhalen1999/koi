// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Lints Koi's code with Firefox's own linters. `mach lint` on engine/koi/
 * reports success over zero files (eslint drops paths that resolve outside
 * the tree, prettier refuses symlinks), so src/koi/ is copied to
 * engine/koi-lint/, linted there and removed. The copy's name has no dot:
 * Firefox's .prettierignore ignores `*.*` and re-includes file types, so a
 * dotted directory was silently skipped. mach's eslint and stylelint run
 * prettier themselves.
 *
 * Usage: npm run lint            check
 *        npm run lint -- --fix   let the tools rewrite, copied back into src/
 */

import { cpSync, existsSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const ENGINE = 'engine'
const SRC = join('src', 'koi')
const COPY = 'koi-lint' // relative to engine/
const fix = process.argv.includes('--fix')

if (!existsSync(join(ENGINE, 'mach'))) {
  console.error('lint: engine/ is not there — run `npm run download` first')
  process.exit(1)
}

// mozbuild hides its output when it sees CLAUDECODE; the output is the point.
const env = { ...process.env }
delete env.CLAUDECODE

const copy = join(ENGINE, COPY)
rmSync(copy, { recursive: true, force: true })
cpSync(SRC, copy, { recursive: true })

let status
try {
  const args = ['lint', '-l', 'eslint', '-l', 'stylelint', ...(fix ? ['--fix'] : []), COPY]
  const result = spawnSync('./mach', args, { cwd: ENGINE, env, stdio: 'inherit' })
  if (result.error) throw result.error
  status = result.status
  if (fix) cpSync(copy, SRC, { recursive: true })
} finally {
  rmSync(copy, { recursive: true, force: true })
}

process.exit(status ?? 1)
