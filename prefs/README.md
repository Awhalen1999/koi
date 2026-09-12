# Preferences

Default preferences for Koi, grouped by origin and purpose. `npm run prefs`
(chained ahead of `surfer import`) compiles every file here into
`engine/browser/app/profile/koi.js` and pulls it into Firefox's `firefox.js`.

- `firefox/` — overrides of Mozilla's own defaults
- `koi/` — preferences for Koi's own features

## Format

A flat YAML list per file:

```yaml
- name: browser.newtabpage.enabled
  value: false

- name: browser.startup.homepage
  value: "about:blank"
  locked: true   # optional -> locked_pref
  sticky: true   # optional -> sticky_pref
```

Any other key is a hard error, so a typo cannot silently do nothing. Why a
pref is set goes in a `#` comment above it, where it stays next to the value
a reader is checking.

Defining the same pref in two files is a hard error — otherwise whichever
loaded last would silently win.

## Adding a pref

The pref has to exist. A default for a name Firefox never reads looks like it
works and does nothing, so `npm run prefs` refuses any name it cannot find
read somewhere in the engine or in `src/koi/` (one `git grep` of each, tests
excluded). What it cannot
see is a reader compiled out by our build flags — `MOZ_TELEMETRY_REPORTING`,
`MOZ_NORMANDY` and friends — so still look at the hits before adding one:

```
git -C engine grep -l -F 'the.pref.name' -- . ':!**/test/**' ':!**/tests/**' ':!testing'
```

If the only readers are behind a flag we switch off, leave the pref out.
