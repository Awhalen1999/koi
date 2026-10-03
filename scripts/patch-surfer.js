// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Postinstall: edits two files in node_modules that have no config hook, which
 * a plain `npm install` would otherwise silently revert.
 *   1. surfer's branding generator hardcodes zen-browser.app URLs into
 *      branding.nsi and pref/firefox-branding.js.
 *   2. async-icns calls fs.promises.rmdir(..., {recursive}), removed in Node 24.
 * Each edit is an exact from/to pair: already applied is skipped, and a file
 * with neither fails loudly, because the dependency changed shape.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const HOMEPAGE = 'https://koi.surf'
const ISSUES = 'https://github.com/Awhalen1999/koi/issues'

const targets = [
  {
    file: 'node_modules/@zen-browser/surfer/dist/commands/patches/branding-patch.js',
    why: "surfer's hardcoded Zen URLs",
    // The edits know only the URLs surfer had when they were written, so the
    // pass also fails if any zen-browser.app URL survives it.
    forbid: /zen-browser\.app/,
    edits: [
      // Emptied, not pointed at Koi pages: nothing opens on first run.
      ['"https://zen-browser.app/whatsnew?v=%VERSION%"', '""'],
      ['"https://zen-browser.app/welcome/"', '""'],
      ['"https://zen-browser.app/privacy-policy/"', '""'],

      ['"https://github.com/zen-browser/desktop/issues"', `"${ISSUES}"`],

      // Keeps surfer's own escaped NSIS variable intact.
      [
        '"https://zen-browser.app/release-notes/\\${AppVersion}"',
        `"${HOMEPAGE}/release-notes/\\\${AppVersion}"`,
      ],

      ['"https://zen-browser.app/download/"', `"${HOMEPAGE}/"`],
      ['"https://zen-browser.app/download"', `"${HOMEPAGE}/"`],
      ['"https://zen-browser.app/release-notes/latest/"', `"${HOMEPAGE}/"`],
      ['"https://zen-browser.app/whatsnew/"', `"${HOMEPAGE}/"`],
      ['"https://www.zen-browser.app/release-notes/%VERSION%/"', `"${HOMEPAGE}/"`],
      ['"https://zen-browser.app/release-notes/%VERSION%/"', `"${HOMEPAGE}/"`],
      ['"https://zen-browser.app"', `"${HOMEPAGE}"`],
    ],
  },
  {
    file: 'node_modules/async-icns/icns.js',
    why: 'fs.promises.rmdir removed in Node >= 24',
    edits: [
      [
        "const { mkdir, rmdir } = require('fs/promises')",
        "const { mkdir, rm } = require('fs/promises')",
      ],
      [
        'await rmdir(tmpDirectory, { recursive: true })',
        'await rm(tmpDirectory, { recursive: true, force: true })',
      ],
    ],
  },
]

let changed = 0
let skipped = 0

for (const { file, why, edits, forbid } of targets) {
  if (!existsSync(file)) {
    console.warn(`patch-surfer: ${file} not present, skipping (${why})`)
    continue
  }

  const original = readFileSync(file, 'utf8')
  let contents = original

  for (const [from, to] of edits) {
    if (contents.includes(from)) {
      contents = contents.replaceAll(from, to)
    } else if (contents.includes(to)) {
      continue // already applied
    } else {
      console.error(
        `\npatch-surfer: FAILED on ${file}\n` +
          `  Could not find:  ${from}\n` +
          `  Nor its patched form. The dependency has changed shape, so this\n` +
          `  patch is no longer doing what it claims. Re-derive it against the\n` +
          `  installed version before building — do not ignore this.\n`
      )
      process.exit(1)
    }
  }

  if (forbid?.test(contents)) {
    console.error(
      `\npatch-surfer: INCOMPLETE on ${file}\n` +
        `  Still contains ${forbid} after patching. The dependency gained a\n` +
        `  URL this script does not know about. Add it to the edits above —\n` +
        `  shipping it would bake someone else's brand into a Koi build.\n`
    )
    process.exit(1)
  }

  if (contents === original) {
    skipped++
  } else {
    writeFileSync(file, contents)
    changed++
  }
}

console.log(
  `patch-surfer: ${changed} patched, ${skipped} already up to date`
)
