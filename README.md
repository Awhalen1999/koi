# Koi

A fast, minimal browser built on Firefox (Gecko). macOS only.

Calm by default. Nothing pops up, nothing asks for attention, nothing needs
learning on first launch. All controls in two rows at the top; the rest
belongs to the page.

## Building

Requires Xcode command line tools, Node 26, Python 3, and GNU tar
(`brew install gnu-tar`).

```sh
npm install
npm run download          # fetches Firefox (surfer.json's version) into engine/
npx surfer set brand release   # machine-local, once per clone
npm run bootstrap         # Mozilla build toolchain
npm run import            # apply patches and branding, generate prefs
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
| `scripts/` | prefs generator, dependency patcher, lint runner, log filter |
| `engine/` | Firefox source, gitignored, its own git repo |

`CLAUDE.md` has the details: the build traps, the decisions, and how to
work on the tree.

Built with [surfer](https://github.com/zen-browser/surfer). Firefox is
Mozilla's; see LICENSE.
