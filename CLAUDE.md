# Koi

A fast, minimal browser built on Firefox (Gecko), macOS only.

## Positioning
Helium's restraint, Zen's polish. Calm by default. Nothing pops up,
nothing asks for attention, nothing needs learning on first launch.
Chrome has no color of its own — it borrows the wallpaper. No themes.
All controls in 62px at the top; the rest belongs to the page.

## Stack
- Firefox 154 stable, forked via `@zen-browser/surfer` 1.14.7
- Reference implementation: github.com/zen-browser/desktop (MPL, safe to study)
- Surfer itself ships **no documentation**. Its README points at docs.gluon.dev,
  which documents the *ancestor* tool (still says `gluon.json`) and is stale.
  The authoritative references are surfer's own source in
  `node_modules/@zen-browser/surfer/dist/` and the Zen repo.

---

## Repo layout — the Zen model

The rule that keeps a Gecko fork maintainable: **your own code is never a patch.**
Zen's `src/` splits cleanly, and the ratio is the whole lesson:

```
src/browser/, toolkit/, layout/, dom/, ...   251 patches,    ~0 whole files
src/zen/                                       0 patches,   518 whole files
```

Koi mirrors this:

| Path | Contents |
|---|---|
| `engine/` | Firefox source. Gitignored here, but **it is its own git repo** (see below). Never commit it here. |
| `src/<firefox-path>/*.patch` | Minimal diffs into Mozilla source. Every one of these is a merge conflict waiting for the next Firefox update — keep them few and small. |
| `src/koi/**` | Every line of Koi's own UI. Whole files, symlinked into `engine/koi/` and appended to `engine/.gitignore` so they never pollute a diff. Zero patches live here. |
| `configs/{common,macos}/mozconfig` | Build config. Templated by surfer (`${binName}`, `${brandingDir}`, `${changeset}`) and merged into `engine/mozconfig` at build time. |
| `configs/branding/release/` | Branding *inputs* (raster + ico). See Branding. |
| `prefs/**/*.yaml` | Default prefs, generated into `engine/browser/app/profile/koi.js`. |
| `scripts/` | Node tooling (prefs generator, surfer postinstall patcher). |

Design masters (SVG) live in `../koi-design/branding/` — **outside this repo and
not under version control.** Sole copy. Worth fixing.

### The four-hop bridge

This is how an entire parallel tree gets into the build while touching Firefox in
only two places. Zen's version, which Koi copies:

1. `src/browser/base/moz-build.patch` → `DIRS += ["../../koi"]` *(one line)*
2. `src/browser/base/jar-mn.patch` → `#include content/koi-assets.jar.inc.mn` *(one line)*
3. `src/browser/base/content/koi-assets.jar.inc.mn` → `#include`s a `jar.inc.mn`
   from each feature dir under `src/koi/`
4. `src/browser/base/content/browser-xhtml.patch` → drops
   `#include koi-assets.inc.xhtml` into `browser.xhtml`'s `<head>`; that fragment
   carries the `<linkset>` of every stylesheet and the preloaded `<script>` tags

After that, adding a feature touches **zero** Firefox files: new dir under
`src/koi/`, a `jar.inc.mn`, one `#include`.

A dir under `src/koi/` only needs to appear in `src/koi/moz.build`'s `DIRS` if it
has its own `moz.build` (i.e. ships JS modules via `EXTRA_JS_MODULES`). Pure
CSS/content dirs just need their `jar.inc.mn` included.

### jar.inc.mn: the `*` flag is a promise

A leading `*` on a jar entry means "run this file through the mozbuild
preprocessor". `jar.py` then calls `pp.failUnused()`, which **raises if the file
contained no directives at all**:

```
mozbuild.preprocessor.Error: (..., 'no preprocessor directives found')
```

So `*` on a plain stylesheet fails the build. This cost a full build cycle once,
because the failure only surfaces in the `browser/base/misc` tier, ~18 minutes
in. Add `*` only alongside real directives.

And the marker in `.css` files is `%`, not `#` — `jar.py` does
`if src[-4:] == ".css": pp.setMarker("%")`. So it is `%include`, `%ifdef`.
Zen's `zen-theme.css` carries `*` legitimately because it has eight `%include`
lines pulling in `schemes/dark.inc.css` and friends; don't copy the `*` without
copying the directives.

Fast way to test chrome wiring without a full build:
`./mach build browser/base/misc` exercises the whole jar chain in ~5 seconds.
`npm run build:ui` (`mach build faster`) covers front-end more broadly.

**Do not** use surfer's template approach of `%include`-ing your CSS into
Firefox's own `browser/themes/*/browser.css`. That makes every UI change a patch
against Mozilla source. Koi started that way; it was removed.

---

## Workflow

- `npm run import` → `npm run build` → `npm start`
- `npm start` runs `mach run --noprofile` so it uses the real profile at
  `~/Library/Application Support/Koi`, not a throwaway one in the objdir
- Prefer whole files in `src/koi/` over patches to Firefox source, always
- mozbuild hides build output when it sees `CLAUDECODE` in the env, which makes
  failures invisible. To see real errors:
  `cd engine && env -u CLAUDECODE ./mach configure` (or `./mach build`)

---

## engine/ must be a git repo

Surfer's `download` runs `git init` + an orphan commit of pristine Firefox inside
`engine/`. **Everything depends on that baseline**, because `surfer import`,
`export`, `status` and `reset` all shell out to git with `cwd=engine`.

If `engine/.git` is missing, git resolves to the *outer* koi repo and every patch
path lands outside the cwd, so git ignores it and exits 0 — `surfer import`
reports `[FINISH] Apply …` while applying **nothing**, and `surfer export` writes
empty patches.

Sanity check after any patch work: an exported patch should be non-empty, and
`git -C engine log --oneline -1` should show the baseline commit.

### Baseline integrity — how attempt #1 failed

The first attempt hand-rebuilt the baseline by reverse-applying patches instead of
re-downloading. The reverse-apply was incomplete, so the commit named
`Firefox 154.0` actually contained Koi output:

- `browser/branding/release/**` — the whole generated Koi branding
- `browser/installer/windows/nsis/shared.nsh` — `"Publisher" "Koi"`
- `build/application.ini.in` — surfer's rewritten update URL
- `.gitignore` — surfer's appended symlink lines
- `mozconfig` — a generated file that has no business in a pristine tree

Anything baked into the baseline is **invisible to `surfer export`**: it can never
be reproduced from `src/`, and a fresh clone would not build the same browser.

**Rule: the baseline comes from `surfer download` and nothing else.** Never
hand-build it. To verify, immediately after download `git -C engine status`
must be empty, and it must stay empty except for files you can account for.

---

## Patching Firefox source

1. Edit the file in `engine/`
2. `npm run export -- <path>` (e.g. `toolkit/moz.configure`)
3. `npm run import` to confirm it re-applies
4. Check the patch is non-empty — a 0-byte patch means the baseline is broken

Patch filenames mirror the engine path with dots turned into dashes:
`toolkit/moz.configure` → `src/toolkit/moz-configure.patch`.

Surfer warns above 8000 characters. Treat that as a hard smell: split the change
or move the logic into `src/koi/`.

### Configure options that cannot be set from a mozconfig

Some are `project_flag`s with `possible_origins=("implied",)`. Exporting them in a
mozconfig is a hard configure error (`… can not be set by mozconfig`). They must
be patched:

- `MOZ_APP_VENDOR` — implied `"Mozilla"` in `browser/moz.configure`
- `MOZ_APP_UA_NAME` — `default=""` in `toolkit/moz.configure`
- `MOZ_SERVICES_HEALTHREPORT`, `MOZ_NORMANDY` — implied `True` in
  `browser/moz.configure`; they are `project_flag`s with no default, so deleting
  the `imply_option` line is what turns them off

Note `default=` loses to `imply_option`, so patch whichever file supplies the
value. (Zen sets `MOZ_APP_VENDOR`'s default in `toolkit/moz.configure` while
`browser/moz.configure` still implies `"Mozilla"` — so their vendor is likely
still Mozilla. Patch the `imply_option`.)

---

## App identity

All verified in `obj-aarch64-apple-darwin/config/autoconf.mk` after a clean
`./mach configure` on the pristine baseline:

```
MOZ_APP_BASENAME = Koi              MOZ_DISTRIBUTION_ID = surf.koi
MOZ_APP_DISPLAYNAME = Koi           MOZ_MACBUNDLE_ID = surf.koi.browser
MOZ_APP_NAME = koi                  MOZ_CHILD_PROCESS_BUNDLEID = surf.koi.plugincontainer
MOZ_APP_VENDOR = Koi                MOZ_MACBUNDLE_NAME = Koi.app
MOZ_APP_UA_NAME = Firefox           MOZ_UPDATE_CHANNEL = release
MOZ_APP_VERSION = 0.1.0             MOZ_APP_ID = {ec8030f7-...} (Firefox's)
```

`MOZ_TELEMETRY_REPORTING`, `MOZ_DATA_REPORTING`, `MOZ_SERVICES_HEALTHREPORT`,
`MOZ_NORMANDY`, `MOZ_CRASHREPORTER` and `MOZ_REQUIRE_SIGNING` are all absent
from autoconf.mk, which is what "off" looks like — grep for their presence, not
for a `=0` value.

Note the objdir is `obj-aarch64-apple-darwin`, not the
`obj-aarch64-apple-darwin25.5.0` attempt #1 produced, because `configs/macos`
now passes `--target` explicitly. Surfer globs `obj-*` so it does not care, but
it warns if more than one exists.

- `MOZ_APP_VENDOR=Koi` — patch to `browser/moz.configure`
- `MOZ_APP_UA_NAME=Firefox` — patch to `toolkit/moz.configure`. **Load-bearing:**
  `nsHttpHandler` only emits the `Firefox/154.0` UA token when the app name is
  literally `Firefox`. Without it the UA is `… koi/0.1.0` with no Firefox token,
  which breaks site compatibility. It also suppresses the app token entirely, so
  the Koi version never leaks into the UA.
- `MOZ_APP_BASENAME=Koi` — application.ini `Name`, and the macOS profile directory
- `MOZ_APP_DISPLAYNAME=Koi` — comes from `brandShortName`, via the generated
  `browser/branding/release/configure.sh`. This is the macOS menu-bar name.
- `MOZ_MACBUNDLE_NAME=Koi.app` — surfer sets this from the brand name
- `MOZ_APP_ID` stays Firefox's GUID, as Zen does, so AMO extensions still install
- `MOZILLA_UAVERSION` (154.0) comes from `config/milestone.txt`, separate from
  `MOZ_APP_VERSION`

### The appId trap

`MOZ_MACBUNDLE_ID` is **composed**, per `toolkit/moz.configure`:

```python
return f"{distribution_id[0]}.{bundle_id}{suffix}"
```

where `bundle_id` is the `MOZ_MACBUNDLE_ID` env value if set, else
`re.sub("[^a-z-]", "", app_displayname.lower())`. Surfer's branding template
writes `MOZ_MACBUNDLE_ID="${appId}"` from surfer.json.

So **surfer.json `appId` must be the bare last component**, not a reverse-DNS
string:

- `appId: "browser"` + `--with-distribution-id=surf.koi` → `surf.koi.browser` ✅
- `appId: "surf.koi.browser"` + same → `surf.koi.surf.koi.browser` ❌

The scaffold ships `appId: "surf.koi.browser"`, which is the wrong shape. Zen uses
`appId: "zen"` + `app.zen-browser` → `app.zen-browser.zen`.

`MOZ_CHILD_PROCESS_BUNDLEID=surf.koi.plugincontainer` follows the distribution id.
The `MOZ_DISTRIBUTION_ID` env var is **ignored** — it must be the configure option
`--with-distribution-id`.

### Version

`MOZ_APP_VERSION` comes from surfer.json `brands.release.release.displayVersion`;
`surfer build` writes it into `engine/browser/config/version{,_display}.txt`.

**Lowering `displayVersion` between builds triggers Firefox's profile-downgrade
dialog.** Delete `obj-*/tmp/profile-default` (or the real profile) if that happens.

---

## Privacy and phone-home defaults

Firefox defaults send data to Mozilla; a fork has to switch each off explicitly.

- Telemetry: `mk_add_options` **and** `ac_add_options MOZ_TELEMETRY_REPORTING=`.
  `mk_add_options` alone only reaches make, so configure keeps the default.
- `MOZ_DATA_REPORTING` is **derived**, not settable: `telemetry or healthreport or
  crashreporter or normandy`. Turn off all four and it disappears.
- Crash reporter: `--disable-crashreporter`. Left on, Firefox submits to
  crash-reports.mozilla.com under Firefox's own GUID. Zen does the same (their
  release builds only) and never redirects the URL.
- Add-on signing: `MOZ_REQUIRE_SIGNING=` + `--with-unsigned-addon-scopes=app,system`
- Runtime backstop in the generated prefs (below)

Keep heavy release flags gated behind an env test (`$KOI_RELEASE`) the way Zen
does, so local dev builds stay fast. Attempt #1 had `--enable-release
--enable-optimize` unconditional, which taxes every local build.

---

## Default preferences

`prefs/**/*.yaml` → `engine/browser/app/profile/koi.js`, plus an idempotent
`#include koi.js` appended to Firefox's `firefox.js`. Generated at import time by
a Node script in `scripts/`, chained ahead of `surfer import` in the `import`
npm script. **No patch to `firefox.js` is needed** — this is why Zen has none.

Format follows Zen's: flat YAML lists of `name` / `value`, split by origin —
`prefs/firefox/` overrides Mozilla defaults, `prefs/koi/` defines Koi's own.

Zen's equivalent tool is Rust (`tools/ffprefs`, 376 lines, serde only). Nothing
about it needs Rust; theirs is Rust because Gecko already mandates a Rust
toolchain so it was free. Koi uses Node to keep a build step out of the inner
loop, since `scripts/` needs Node for the postinstall patcher anyway.

Static prefs with C++ mirrors additionally need `pref_groups += ["koi"]` in
`modules/libpref/moz.build`. Not needed for plain default prefs.

---

## Branding

Brand key is `release`. Surfer generates `engine/browser/branding/release/` at
import from `configs/branding/release/` plus the `brands.release` block in
surfer.json.

**The brand is machine-local state:** `npx surfer set brand release`, once per
clone. It lives in `.surfer/`, which is gitignored.

### Inputs vs generated output

Only these are real inputs. Everything else in the generated branding dir is
either derived from them or copied from Firefox's `unofficial` branding.

- Required, or `checkForFaults` throws: `logo.png`, `logo-mac.png`, `firefox.ico`,
  `firefox64.ico`. The two `.ico` files are required **even though Koi is
  macOS-only.**
- Required by `setupImages`: `logo{16,22,24,32,48,64,128,256,512}.png`
- Optional, copied verbatim: anything else at the top level, plus `content/`
  (`about-logo.svg`, `about-wordmark.svg`, `firefox-wordmark.svg`,
  `identity-icons-brand.svg`, `MacOSInstaller.svg`)

Derived, so never hand-edit: `default{N}.png` (copies of `logo{N}.png`),
`content/about-logo{,@2x}.png` (sharp resizes of `logo.png`), `firefox.icns`
(async-icns from `logo-mac.png`), `branding.nsi`, `configure.sh`,
`pref/firefox-branding.js`, `locales/en-US/brand.{ftl,dtd,properties}`, and the
`--theme-bg` substitution into `content/aboutDialog.css` +
`stubinstaller/*.css` (attempt #1 used `#131417`).

To tell input from output in a generated dir, diff it against
`engine/browser/branding/unofficial/` — identical means it came from Mozilla.

After a design change: regenerate rasters from `../koi-design/branding/`, then
`npm run import`.

---

## Surfer gotchas

- **Two files in `node_modules` must be patched by `scripts/patch-surfer.js`
  (postinstall), or `npm install` silently reverts them:**
  - `@zen-browser/surfer/dist/commands/patches/branding-patch.js` — hardcodes
    zen-browser.app URLs into `branding.nsi` and `pref/firefox-branding.js`.
    Replace with koi.surf; empty the startup/welcome pages so nothing opens on
    first run.
  - `async-icns/icns.js` — uses `rmdir(…, {recursive})`, removed in Node ≥ 24.
    Needs `rm(…, {recursive, force})`.
- `.surfer/patchCount` records the patch count at last import. If it disagrees
  with `src/`, `surfer build` emits a blocking "you have not imported all of your
  patches" warning.
- **`surfer reset` runs `git clean -fdx` inside `engine/`** — it deletes the
  objdir. Not a cheap command.
- `surfer build` **regenerates** `engine/mozconfig` from `configs/common` +
  `configs/<os>` + an optional untracked root `./mozconfig` + surfer's internal
  block. Never edit `engine/mozconfig` directly; it is output.
- `MOZ_APPUPDATE_HOST` defaults to `localhost:7648`, deliberately non-resolving.
  Set surfer.json `updateHostname` only once a real update server exists; until
  then keep `app.update.auto` off.
- `surfer license-check --fix` inserts MPL headers into `src/` for
  `.mjs/.js/.ts/.css/.html/.svg/.xml/.py`, `moz.build`, `jar.mn`. Run it before
  committing new files.
- `surfer download` needs GNU tar on macOS (`brew install gnu-tar`).
- `surfer download` **rewrites surfer.json** when it finishes. Write surfer.json
  after a download, not before, or the edit is clobbered.
- `getCurrentBrandName()` does `config.brands[brand].brandShortName` with no
  guard. If the brand is set but `brands.<name>` is missing from surfer.json it
  throws a TypeError; if the brand is unset it silently returns `Nightly`.
- `buildOptions.generateBranding` appears in Zen's surfer.json but **surfer
  1.14.7 never reads it.** Don't copy config keys from Zen without grepping the
  installed surfer for them first.

### Expected clean state

Know these signatures, so real contamination is obvious.

Immediately after `surfer download`, `git -C engine status` shows exactly one
modification:

```
 M browser/extensions/moz.build
```

That is surfer's addon step appending `DIRS += []` with `addons: {}` empty — a
no-op that reappears on every download.

After `npm run import`, ten modifications plus one untracked directory, all
attributable:

| Path | Source |
|---|---|
| `.gitignore` | symlink entries (surfer) + `koi.js` (gen-prefs) |
| `browser/app/profile/firefox.js` | `#include koi.js` (gen-prefs) |
| `browser/base/content/browser.xhtml` | patch |
| `browser/base/jar.mn` | patch |
| `browser/base/moz.build` | patch |
| `browser/extensions/moz.build` | surfer download no-op |
| `browser/installer/windows/nsis/shared.nsh` | surfer branding, Publisher |
| `browser/moz.configure` | patch |
| `build/application.ini.in` | surfer `setUpdateURLs` |
| `toolkit/moz.configure` | patch |
| `?? browser/branding/release/` | generated branding, untracked |

The last three of those — `shared.nsh`, `application.ini.in` and
`branding/release/` — are precisely what attempt #1 had baked into its
baseline. Seeing them as working-tree changes is the correct state.

---

## Toolchain and caches — do not delete

- `~/.mozbuild/` (~3.2G) — bootstrapped Mozilla toolchain: clang, cbindgen,
  sccache binary, node, the macOS SDK. Upstream artifacts, version-keyed, cannot
  carry Koi contamination. Re-downloading is pure waste.
- `~/Library/Caches/Mozilla.sccache` (~7G) — content-addressed compiler cache. A
  hit means byte-identical compilation inputs, so it also cannot be
  contaminated. This is what makes a clobbered rebuild fast.

`.surfer/engine/firefox-154.0.source.tar.xz` (~811MB) is surfer's download
cache. Gitignored. Keeping it means a future baseline rebuild is instant and
byte-identical rather than a fresh download — worth the disk. Delete it only if
you need the space.

Safe to clear when resetting: `~/.mozbuild/srcdirs/engine-*` (per-srcdir mach
state, keyed by path hash — stale state gets reused if `engine/` is recreated at
the same path) and `~/.mozbuild/mach_func_cache`.

`sccache` is invoked via `--with-ccache=sccache`; it is not on `PATH`, mach puts
`~/.mozbuild/sccache/` there during the build.

---

## Current state

Attempt #1 was abandoned and fully removed: its work lived only as uncommitted
edits inside `engine/`, and its baseline was contaminated (above). Nothing of it
was committed. The only thing carried across is the branding raster set, which
was verified against surfer's required-file checks before reuse.

**Done — the base is in place and validated:**
- Pristine baseline from `surfer download`; `git -C engine status` was clean
- `surfer.json` with the correct `appId` shape, `brands.release` strings
- `package.json` workflow scripts; `scripts/patch-surfer.js` verified to survive
  an `npm install`; `scripts/gen-prefs.js` generating 20 prefs
- `configs/` mozconfigs with privacy defaults and `$KOI_RELEASE` gating
- `src/koi/` with the four-hop wiring; 5 patches, all exported non-empty
- `npm run import` runs clean; `./mach configure` succeeds and every identity
  and privacy value checks out (see App identity)

**`npm run build` succeeds.** `Koi.app` (289M, dev build) is at
`engine/obj-aarch64-apple-darwin/dist/Koi.app`, verified:

- `CFBundleIdentifier surf.koi.browser`, `CFBundleName Koi`,
  `CFBundleShortVersionString 0.1.0`, binary `Contents/MacOS/koi`
- bundle icon is byte-identical to `configs/branding/release/firefox.icns`
- `Contents/Resources/browser/chrome/browser/content/browser/koi-styles/koi-theme.css`
  is present, so the full four-hop chain ships into the app
- our prefs are inlined at the end of the packaged
  `browser/defaults/preferences/firefox.js`

Dev builds do not produce `omni.ja`; chrome is served unpacked from `dist`.

**Not yet done:** the browser has not been launched, so nothing is verified at
runtime. `src/koi/` is a skeleton — one stylesheet declaring
`--koi-chrome-height` and no rules, so Koi currently looks exactly like Firefox.
`src/koi/moz.build` has an empty `DIRS` until a feature ships JS modules.
`prefs/koi/` does not exist yet.

Known gap: the startup page is still Firefox's `about:home`.
`browser.newtabpage.enabled` covers new tabs only; the start page is
`browser.startup.homepage` / `browser.startup.page` and is unset. Decide what
should be there — it is the first thing a user sees.

`identity-icons-brand.svg` sits unused in `../koi-design/branding/`; it lives in
`browser/themes/shared`, not in branding, so it needs a different mechanism.

Deliberately deferred (Zen has it, Koi does not need it yet): crowdin and
multi-locale, GitHub release workflows, MAR signing, PGO, flatpak,
`configs/dumps/`, `src/external-patches/`, the marionette test harness, and a
`.python-version` pin.
