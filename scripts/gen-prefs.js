// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Generates Koi's default preferences from prefs/ into the engine.
 *
 * Reads every prefs/**\/*.yaml and writes engine/browser/app/profile/koi.js,
 * then appends `#include koi.js` to Firefox's own firefox.js. firefox.js
 * already runs through the mozbuild preprocessor, so no moz.build or jar.mn
 * change is needed.
 *
 * This runs ahead of `surfer import` (see the `import` npm script), which is
 * why Koi needs no patch against firefox.js: the include is regenerated on
 * every import rather than carried as a diff.
 *
 * Pref format — a flat YAML list per file:
 *
 *   - name: browser.newtabpage.enabled
 *     value: false
 *
 *   - name: browser.startup.homepage
 *     value: "about:blank"
 *     locked: true   # optional -> locked_pref
 *     sticky: true   # optional -> sticky_pref
 *
 * Why a pref is set is written as a `#` comment above it, which stays in the
 * YAML where it is read. An `emit this into koi.js` field existed and went
 * unused by every prefs file; unknown keys are now refused so a stray one
 * cannot silently do nothing.
 *
 * Every name is also checked against the engine: a default for a pref that
 * nothing in Firefox reads looks like it works and does nothing — the same
 * silent no-op as a mistyped CSS variable — so README.md's grep runs here,
 * on every import, and a name with no reader fails the build.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative } from 'node:path'
import { parse } from 'yaml'

const PREFS_DIR = 'prefs'
const ENGINE = 'engine'
const KOI_SRC = join('src', 'koi')
const PROFILE_DIR = join(ENGINE, 'browser', 'app', 'profile')
const OUT = join(PROFILE_DIR, 'koi.js')
const FIREFOX_JS = join(PROFILE_DIR, 'firefox.js')
const INCLUDE_LINE = '#include koi.js'
const ENGINE_GITIGNORE = join(ENGINE, '.gitignore')
const IGNORE_ENTRY = 'browser/app/profile/koi.js'
const KNOWN_KEYS = new Set(['name', 'value', 'locked', 'sticky'])

function die(message) {
  console.error(`gen-prefs: ${message}`)
  process.exit(1)
}

function walk(dir) {
  const found = []
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...walk(path))
    else if (/\.ya?ml$/.test(entry)) found.push(path)
  }
  return found
}

/** Renders a YAML scalar as a JS literal for a pref() call. */
function literal(value, name) {
  switch (typeof value) {
    case 'boolean':
      return String(value)
    case 'number':
      return String(value)
    case 'string':
      return JSON.stringify(value)
    default:
      die(`pref "${name}" has unsupported value type ${typeof value}`)
  }
}

if (!existsSync(PROFILE_DIR)) {
  die(
    `${PROFILE_DIR} does not exist. Run \`npm run download\` first — prefs are ` +
      `generated into the engine, so the engine has to be there.`
  )
}

if (!existsSync(PREFS_DIR)) die(`${PREFS_DIR}/ does not exist`)

const files = walk(PREFS_DIR)
if (files.length === 0) die(`no YAML files found under ${PREFS_DIR}/`)

const seen = new Map()
const sections = []
let count = 0

for (const file of files) {
  const parsed = parse(readFileSync(file, 'utf8'))
  if (parsed === null) continue // empty file
  if (!Array.isArray(parsed)) die(`${file} must contain a YAML list`)

  const lines = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') die(`${file} has a malformed entry`)
    const { name, value, locked, sticky } = entry
    if (typeof name !== 'string') die(`${file} has an entry with no name`)
    if (value === undefined) die(`pref "${name}" in ${file} has no value`)
    for (const key of Object.keys(entry)) {
      if (!KNOWN_KEYS.has(key)) {
        die(`pref "${name}" in ${file} has unknown key "${key}"`)
      }
    }

    // A pref set twice silently takes whichever came last, so refuse it.
    if (seen.has(name)) {
      die(`pref "${name}" is defined in both ${seen.get(name)} and ${file}`)
    }
    seen.set(name, file)

    const fn = locked ? 'locked_pref' : sticky ? 'sticky_pref' : 'pref'
    lines.push(`${fn}(${JSON.stringify(name)}, ${literal(value, name)});`)
    count++
  }

  if (lines.length > 0) {
    sections.push(`// ${relative(PREFS_DIR, file)}\n${lines.join('\n')}`)
  }
}

// One `git grep` per tree, tests excluded. With -o and -F it prints each
// literal it matched, so a name absent from the output is read nowhere. Two
// trees, because the engine is its own git repo (CLAUDE.md) and Koi's own
// scripts reach it only as gitignored symlinks: a `koi.*` pref read by
// koi-board.js is invisible to a grep of the engine, so src/koi is grepped
// where it lives. koi.js itself is untracked in the engine, so the generated
// file cannot vouch for its own names.
function grepLiterals(cwd, names, pathspecs, flags = []) {
  try {
    const args = ['grep', '-o', '-h', '-F', '-f', '-', ...flags, '--', ...pathspecs]
    const out = execFileSync('git', args, {
      cwd,
      input: names.join('\n'),
      encoding: 'utf8',
      maxBuffer: 1 << 26,
    })
    return out.split('\n')
  } catch (error) {
    if (error.status === 1) return [] // git grep: nothing matched at all
    throw error
  }
}

function readersOf(names) {
  return new Set([
    // Top-level testing/ needs its own pathspec: `**/testing/**` only matches
    // a `/testing/` with a slash on both sides.
    ...grepLiterals(ENGINE, names, ['.', ':!**/test/**', ':!**/tests/**', ':!testing']),
    // --untracked: a script that is still new to git is a reader too.
    ...grepLiterals('.', names, [KOI_SRC], ['--untracked']),
  ])
}

const readers = readersOf([...seen.keys()])
for (const [name, file] of seen) {
  if (!readers.has(name)) {
    die(
      `pref "${name}" in ${file} is read nowhere in the engine. A default for ` +
        `a name Firefox never reads does nothing — see prefs/README.md.`
    )
  }
}

const banner = [
  '// This Source Code Form is subject to the terms of the Mozilla Public',
  '// License, v. 2.0. If a copy of the MPL was not distributed with this',
  '// file, You can obtain one at http://mozilla.org/MPL/2.0/.',
  '',
  '// GENERATED by scripts/gen-prefs.js from prefs/ — do not edit.',
  '',
].join('\n')

writeFileSync(OUT, `${banner}\n${sections.join('\n\n')}\n`)

// Pull koi.js into firefox.js, idempotently.
const firefoxJs = readFileSync(FIREFOX_JS, 'utf8')
if (!firefoxJs.includes(INCLUDE_LINE)) {
  writeFileSync(FIREFOX_JS, `${firefoxJs.replace(/\s*$/, '')}\n\n${INCLUDE_LINE}\n`)
}

// Keep the generated file out of the engine's diffs, the same way surfer does
// for symlinked whole files.
if (existsSync(ENGINE_GITIGNORE)) {
  const ignore = readFileSync(ENGINE_GITIGNORE, 'utf8')
  if (!ignore.includes(IGNORE_ENTRY)) {
    writeFileSync(ENGINE_GITIGNORE, `${ignore.replace(/\s*$/, '')}\n${IGNORE_ENTRY}\n`)
  }
}

console.log(
  `gen-prefs: ${count} prefs from ${files.length} file(s) -> ${OUT}`
)
