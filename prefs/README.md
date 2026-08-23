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
  locked: true          # optional -> locked_pref
  sticky: true          # optional -> sticky_pref
  comment: why this is  # optional, emitted above the pref
```

Defining the same pref in two files is a hard error — otherwise whichever
loaded last would silently win.

## Adding a pref

Confirm the pref actually exists before adding it. A default pref for a name
Firefox never reads looks like it works and does nothing:

```
grep -rl '"the.pref.name"' engine/browser/app/profile/firefox.js \
  engine/modules/libpref/init/ engine/browser/extensions/newtab/
```

If the only hits are tests, or code excluded by our build flags, leave it out.
