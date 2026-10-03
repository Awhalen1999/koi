/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Colour-codes `mach run` output for `npm start`, so chrome errors stand out
 * from page noise. Consecutive lines from the same page collapse into one
 * counter (see `run`).
 *   red      chrome JS errors, Koi's included
 *   yellow   chrome JS warnings
 *   magenta  other lines from Koi's files (koi-*)
 *   dim      page JS and its stack frames, known macOS and dev-build noise
 *   plain    everything else
 * Firefox's terminal echo of JS errors cannot tell page from chrome, so the
 * split is made here from each line's source URL. Colour only on a TTY;
 * NO_COLOR is respected, KOI_LOG_COLOR=1 forces it. */

import { createInterface } from "node:readline";

const useColor =
  (process.stdout.isTTY || process.env.KOI_LOG_COLOR) && !process.env.NO_COLOR;
const paint = (code, line) =>
  useColor ? `\x1b[${code}m${line}\x1b[0m` : line;

/* Bright black, not SGR 2 (faint), which Terminal.app renders as normal. */
const DIM = "90";
const RED = "1;31";
const YELLOW = "33";
const MAGENTA = "1;35";

// Fixed strings that identify harmless macOS / dev-build chatter.
const NOISE = [
  "Koi GPU Helper",
  "hiservices-xpcservice",
  "Error received in message reply handler",
  "UNSUPPORTED (log once)",
  "sysctlbyname",
  "Error in cpuinfo",
  "NotOpenSSLWarning",
  "warnings.warn",
];

const PAGE_JS =
  /^JavaScript (warning|error): (https?|blob|about|data|moz-extension):/;
const PAGE_STACK_FRAME = /^[^\s@]*@(https?|blob|data|moz-extension):/;
const CHROME_JS =
  /^JavaScript (warning|error): (chrome|resource|moz-src|jar|file):/;
const KOI_OWN = /koi-[a-z]+\.(css|js|svg)|content\/koi-/;

// Page errors trail multi-line stacks; keep dimming until the frames stop.
let inPageStack = false;

// The first line of a run from one host prints; the rest become one counter.
let run = null; // { host, count }

const hostOfLine = line => {
  const url = line.match(/(https?|blob|data|moz-extension):\/\/[^\s/]*/);
  return url ? url[0] : "page";
};

const flushRun = () => {
  if (run?.count) {
    process.stdout.write(
      paint(DIM, `  ⋮ ${run.count} more page-console lines from ${run.host}`) +
        "\n"
    );
  }
  run = null;
};

const emit = line => process.stdout.write(line + "\n");

createInterface({ input: process.stdin }).on("line", line => {
  if (PAGE_JS.test(line) || (inPageStack && PAGE_STACK_FRAME.test(line))) {
    const startsEntry = !inPageStack || PAGE_JS.test(line);
    inPageStack = true;
    const host = startsEntry ? hostOfLine(line) : run?.host;
    if (run && run.host === host) {
      run.count += 1;
      return; // Swallowed into the counter.
    }
    flushRun();
    run = { host, count: 0 };
    emit(paint(DIM, line));
    return;
  }
  inPageStack = false;
  flushRun();
  // Errors before KOI_OWN, so Koi's own errors show red, not magenta.
  if (CHROME_JS.test(line)) {
    emit(paint(line.startsWith("JavaScript error") ? RED : YELLOW, line));
  } else if (KOI_OWN.test(line)) {
    emit(paint(MAGENTA, line));
  } else if (NOISE.some(marker => line.includes(marker))) {
    emit(paint(DIM, line));
  } else {
    emit(line);
  }
}).on("close", flushRun);
