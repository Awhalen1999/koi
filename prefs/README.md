# Preferences

Koi's default preferences. `npm run prefs` (run after `surfer import` by
`npm run import`) compiles every file here into
`engine/browser/app/profile/koi.js` and includes it from Firefox's
`firefox.js`.

- `firefox/` — overrides of Mozilla's own defaults
- `koi/` — preferences for Koi's own features

## Format

A flat YAML list per file:

```yaml
- name: browser.newtabpage.enabled
  value: false

- name: browser.startup.homepage
  value: "about:blank"

- name: browser.nova.enabled
  value: false
  locked: true   # optional -> pref(name, value, locked): read-only in about:config
```

Any other key is an error, so a typo cannot silently do nothing, and so is
setting one pref in two files. The reason for a pref goes in a `#` comment
above it.

## Adding a pref

A default for a name nothing reads silently does nothing, so `npm run prefs`
refuses any name with no reader in the engine or `src/koi/` (tests
excluded). It cannot tell a reader that Koi's build flags compile out
(`MOZ_TELEMETRY_REPORTING`, `MOZ_NORMANDY`), so check the hits yourself:

```
git -C engine grep -l -F 'the.pref.name' -- . ':!**/test/**' ':!**/tests/**' ':!testing'
```

If the only readers are behind a flag Koi switches off, leave the pref out.
