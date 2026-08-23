# Koi

A fast, minimal browser built on Firefox (Gecko). macOS only.

Calm by default. Nothing pops up, nothing asks for attention, nothing needs
learning on first launch. All controls in 62px at the top; the rest belongs to
the page.

## Building

Requires Xcode command line tools, Node 26, Python 3, and GNU tar
(`brew install gnu-tar`).

```sh
npm install
npm run download          # fetches Firefox 154 into engine/
npx surfer set brand release   # machine-local, once per clone
npm run bootstrap         # Mozilla build toolchain
npm run import            # generate prefs, branding, apply patches
npm run build
npm start
```

Set `KOI_RELEASE=1` for an optimised release build; without it you get a faster
dev build.

## Layout

| Path | |
|---|---|
| `src/koi/` | Koi's own UI — whole files, no patches |
| `src/<firefox-path>/*.patch` | minimal diffs into Firefox source |
| `configs/` | mozconfigs and branding inputs |
| `prefs/` | default preferences as YAML |
| `scripts/` | prefs generator, dependency patcher |
| `engine/` | Firefox source, gitignored, its own git repo |

`CLAUDE.md` has the details, including the parts that are load-bearing and
non-obvious.

Built with [surfer](https://github.com/zen-browser/surfer). Firefox is
Mozilla's; see LICENSE.
