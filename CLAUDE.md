# Koi

A fast, minimal browser built on Firefox (Gecko), macOS only.

## Positioning
Helium's restraint, Zen's polish. Calm by default. Nothing pops up,
nothing asks for attention, nothing needs learning on first launch.
Chrome has no colour of its own — it borrows the wallpaper. No themes.
All controls in two 36px rows at the top; the rest belongs to the page.

## Stack
- Firefox 157 stable, forked via `@zen-browser/surfer` 1.14.7
- Reference implementation: github.com/zen-browser/desktop (MPL, safe to study)
- Surfer ships no documentation; docs.gluon.dev documents its ancestor and is
  stale. The references are surfer's own source in
  `node_modules/@zen-browser/surfer/dist/` and the Zen repo.

---

## Repo layout — the Zen model

Your own code is never a patch. Zen's `src/` is ~250 small patches against
Mozilla paths and ~500 whole files under `src/zen/`; Koi mirrors the split.

| Path | Contents |
|---|---|
| `engine/` | Firefox source. Gitignored here, but **its own git repo** (see below). Never commit it here. |
| `src/<firefox-path>/*.patch` | Minimal diffs into Mozilla source. Each is a merge conflict waiting for the next Firefox update — keep them few and small. |
| `src/<firefox-path>/<file>` | A non-patch file under a Mozilla path *replaces* Mozilla's file (see Replacing a Mozilla asset). |
| `src/koi/**` | Every line of Koi's own UI. Whole files, symlinked into `engine/koi/` and appended to `engine/.gitignore` so they never pollute a diff. Zero patches live here. |
| `configs/{common,macos}/mozconfig` | Build config. Templated by surfer (`${binName}`, `${changeset}`) and merged into `engine/mozconfig` at build time. |
| `configs/branding/release/` | Branding inputs (raster + ico). See Branding. |
| `prefs/**/*.yaml` | Default prefs, generated into `engine/browser/app/profile/koi.js`. |
| `scripts/` | Node tooling: prefs generator, surfer postinstall patcher, lint runner, log filter. Each file's header says what it does and why. |

## Design sources

`../koi-design/` — outside this repo and not under version control (sole copy).

- `branding/` — SVG masters behind `configs/branding/release/`.
  `identity-icons-brand.svg` there is dead; the file it targeted no longer
  exists in 154 (`sidebar/firefox.svg` is its modern home).
- `design/` — Claude Design prototypes as `.dc.html`. **`Koi Shell v4` is the
  authoritative shell layout** (two rows, tabs below nav). v5 ("one line of
  chrome") was built, shipped and retired — one shared row needed DOM surgery
  where v4 needs none — but **v5 stays authoritative for the floating
  surfaces**: the palette (cmdOpen) and the empty-state card (noTabs). Read
  values from the specs, not from screenshots or the brand kit.

The prototypes are inline styles with `{{template}}` bindings — port values,
never markup. Where Koi deliberately departs from them, the code says so:
koi-theme.css for glass, motion and the address-field cap; koi-chrome.css
for the omitted hairline dividers.

### The four-hop bridge

How the whole `src/koi/` tree gets into the build while touching Firefox in
two places. Zen's version, which Koi copies:

1. `src/browser/base/jar-mn.patch` → `#include content/koi-assets.jar.inc.mn` (one line)
2. `src/browser/base/content/koi-assets.jar.inc.mn` → `#include`s a `jar.inc.mn` from each feature dir under `src/koi/`
3. `src/browser/base/content/browser-xhtml.patch` → drops `#include koi-assets.inc.xhtml` into `browser.xhtml`'s `<head>`
4. `src/browser/base/content/koi-assets.inc.xhtml` → the `<linkset>` of every stylesheet and the `<script>` tags

Adding a feature touches zero Firefox files: new dir under `src/koi/`, a
`jar.inc.mn`, one `#include`.

A third patch, `src/browser/base/moz-build.patch` (`DIRS += ["../../koi"]`),
reaches `src/koi/moz.build`, whose `DIRS` is empty. It is unused scaffolding:
a feature dir would only need it to ship modules via `EXTRA_JS_MODULES`, and
shared JS is decided to go another way (below). If it ever conflicts on a
Firefox update, delete both files rather than fix them.

### Decided, deliberately not built yet

- **Shared JS.** Every Koi script is an IIFE behind a `<script>` tag. When
  sharing is needed, the answer is an `.mjs` under `src/koi/common/modules/`,
  shipped by the common `jar.inc.mn` and loaded with
  `ChromeUtils.importESModule("chrome://browser/content/koi-common/….mjs")` —
  no moz.build, no patch. Zen does exactly this. The trigger is a third copy:
  `el()` and the XHTML constant are duplicated in koi-newtab.js and
  koi-board.js, and two copies cost less than the indirection.
- **`src/koi/about/` is the content-page dir.** Content pages play by rules
  no chrome dir has: koi-theme.css is not loaded (its ink is chrome ink), the
  page carries its own `default-src chrome:` CSP, it reaches chrome:// assets
  only because `content browser` is `contentaccessible=yes`, and
  `light-dark()` resolves off the *chrome* scheme because an about: page is a
  chrome document.
- **koi-theme.css splits when the second content page lands.** It mixes
  chrome-only ink with a universal scale/type/radii vocabulary, which is why
  koi-rights.css hand-rolls its spacing. One page does not justify the surgery.

### jar.inc.mn: the `*` flag is a promise

A leading `*` runs the file through the mozbuild preprocessor, and `jar.py`
then calls `pp.failUnused()`, which raises `no preprocessor directives found`
if the file had none. So `*` on a plain stylesheet fails the build — and only
in the `browser/base/misc` tier, ~18 minutes into a full build. Add `*` only
alongside real directives. The marker in `.css` files is `%` (`%include`,
`%ifdef`), not `#`.

Fast checks that skip C++: `./mach build browser/base/misc` exercises the jar
chain in ~5s; `npm run build:ui` (`mach build faster`) covers the front end in
~20s. Reserve `npm run build` for configure or source changes.

Do not `%include` Koi CSS into Firefox's own `browser/themes/*/browser.css`
(surfer's template approach): it turns every UI change into a Mozilla patch.

---

## Chrome CSS — rules learned the hard way

- **Write nested selectors with an explicit `&`** (`& > #nav-bar { }`), as
  Zen does. Verified to apply from Koi's sheets.
- **`tabpanels` is a grid; padding on it does not inset its children.**
  xul.css gives `tabpanels`/`deck`/`stack` `display: grid` and pins children
  to `grid-area: 1 / 1`. Inset with margin on the grid item. (Zen's
  `#zen-tabbox-wrapper` exists for this reason.)
- **Scope `browser[type="content"]` rules** under `.browserSidebarContainer`.
  Bare, it also matches the sidebar, the AI window, picture-in-picture and
  devtools.
- **Guard only what assumes the wallpaper is there.** The guard is
  `:root:not([inDOMFullscreen="true"]):not([inFullscreen]):not([popup-window]):not([chromeless-window]):not([web-extension-popup-window])`
  and Koi applies it to one rule, the page card. Restyling a control does not
  assume a wallpaper, so koi-chrome.css guards nothing.
- **Style through Firefox's variable API** (`--tab-*`, `--urlbar-*`,
  `--toolbarbutton-*`, `--panel-*`), not its structure, and grep the tree
  before writing a name: names move between majors.
  `--toolbarbutton-inner-padding` became `--toolbarbutton-padding-inner`;
  157 renamed `--urlbar-min-height` to `--urlbar-height`, replaced the
  urlbar's `[breakout]` with a native popover (`[popover-open]` on the field,
  `--urlbar-background-overhang-open` for the joint surface) and replaced
  the root's `chromehidden` with `popup-window` / `chromeless-window`.
  When a rule mysteriously misses inside the tab strip, suspect its internal
  DOM and kill the thing at its variable (`--tabstrip-inner-border`).
- **Before cancelling a Firefox animation, find what clears its state.**
  `animation: none` on the tab load burst left `[bursting]` stuck (tab.js
  clears it on `animationend`); the fix is `visibility: hidden`.
- **`-moz-window-transform` is invisible to `CSS.supports` and
  `getComputedStyle`** (`enabled_in = "chrome"`). Verify via the parsed rule's
  `cssText` on `document.styleSheets` and cascade order via
  `InspectorUtils.getMatchingCSSRules(el)`.

### Lint

`npm run lint` (`-- --fix` to let the tools rewrite), never `mach lint` on
`engine/koi/`: those are symlinks resolving outside the tree, and eslint drops
such paths while prettier refuses them — each reports success over zero
files. `scripts/lint.js` explains the workaround. `src/-stylelintrc-js.patch`
turns off `use-design-tokens` with `null`, the only "off" stylelint accepts
(`false` makes stylelint exit without running anything, silently). **A clean
lint run proves nothing on its own; plant an error once to prove the linter
saw the file.** Koi's CSS and JS pass with zero problems; keep it that way.
157 added `no-has-selector`, whose own message asks for an inline disable
with a reason; the one `:has()` in koi-chrome.css carries it.

### Debugging chrome

- When a rule appears not to work, do not reason about why. Build it with an
  unmissable value (24px padding, red background, 3px outline) and look. One
  `npm run build:ui`. Serving a file over `chrome://` proves it is
  registered, not applied.
- Vertical spacing off? Paint every box in the stack a different translucent
  colour in one throwaway build. A dark seam is an unowned gap; a colour
  outgrowing its children is that element inflating the row.
- Change one variable per measurement.
- Do not read small differences off scaled screenshots.
- When following Zen, take the whole thing: their C++, their CSS *and* their
  pref defaults. Each omission has cost a debugging cycle.

## Workflow

- `npm run import` → `npm run build` → `npm start`
- `npm start` runs `mach run --noprofile`, so it uses the real profile at
  `~/Library/Application Support/Koi`, not a throwaway one in the objdir.
- mozbuild hides build output when it sees `CLAUDECODE` in the env. To see
  real errors: `cd engine && env -u CLAUDECODE ./mach build`.
- **Quit Koi with ⌘Q.** Ctrl+C in the `npm start` terminal is recorded as a
  crash; two in a row and startup lands on about:sessionrestore. Dev-loop
  artifact, not a bug.
- **A running Koi absorbs the next `mach run`**: the second launch hands its
  URL to the existing instance. Compare process start time against file
  mtime before debugging code that "did not take".
- **Koi opens on its own macOS Space**, so `screencapture -R` grabs the
  visible Space. Capture by window id: `CGWindowListCopyWindowInfo([], …)`
  (empty option set) filtered to owner `Koi`, then `screencapture -l<id>`.
  Headless `--screenshot` cannot see chrome.
- `npm start` pipes through `scripts/koi-log.mjs`: red/yellow = chrome JS
  errors/warnings (the bug radar), magenta = Koi's own files, gray = page JS
  and macOS noise.

---

## engine/ must be a git repo

Surfer's `download` runs `git init` + an orphan commit of pristine Firefox
inside `engine/`. `surfer import`, `export`, `status` and `reset` all shell
out to git with `cwd=engine`. If `engine/.git` is missing, git resolves to
the outer koi repo, every patch path lands outside the cwd, and `surfer
import` reports `[FINISH] Apply …` while applying nothing; `surfer export`
writes empty patches.

**The baseline comes from `surfer download` and nothing else.** Never
hand-build it: an earlier attempt reverse-applied patches into a "pristine"
commit, baked Koi output into it, and everything baked in became invisible
to `surfer export`. Right after download, `git -C engine status` must show
only ` M browser/extensions/moz.build` (surfer's addon step, a no-op that
reappears every download). After any patch work: exported patches are
non-empty and `git -C engine log --oneline -1` shows the baseline commit.

## Patching Firefox source

1. Edit the file in `engine/`
2. `npm run export -- <path>` (e.g. `toolkit/moz.configure`)
3. `npm run import` to confirm it re-applies
4. Check the patch is non-empty — a 0-byte patch means the baseline is broken

Patch filenames mirror the engine path with dots turned into dashes:
`toolkit/moz.configure` → `src/toolkit/moz-configure.patch`. Surfer warns
above 8000 characters; treat that as a hard smell and move logic into
`src/koi/`.

### Configure options that cannot be set from a mozconfig

`project_flag`s with `possible_origins=("implied",)` are a hard configure
error if exported from a mozconfig. Patch them:

- `MOZ_APP_VENDOR` — implied `"Mozilla"` in `browser/moz.configure`
- `MOZ_APP_UA_NAME` — `default=""` in `toolkit/moz.configure`
- `MOZ_SERVICES_HEALTHREPORT`, `MOZ_NORMANDY` — implied `True` in
  `browser/moz.configure`; no default, so deleting the `imply_option` line is
  what turns them off

`default=` loses to `imply_option`, so patch whichever file supplies the value.

### Updating Firefox

`npx surfer update` fetches Mozilla's latest release number, deletes
`engine/` (objdir included), downloads and unpacks the new source, makes the
baseline commit and writes the version into surfer.json (it also drops the
file's trailing newline and adds a `buildOptions` key; both harmless). Clear
`~/.mozbuild/srcdirs/engine-*` first (see Toolchain). Then:

1. `npm run import`. surfer stops at the first patch that fails to apply;
   make that edit by hand in `engine/`, `npm run export` it, and import again
   until all apply. gen-prefs then refuses any pref the new tree no longer
   reads — delete it from its yaml (157 dropped
   `browser.promo.focus.enabled`).
2. A full build follows; the first after a bump mostly misses sccache
   (154 → 157 took about 25 minutes on the M5 Pro).
3. Look at everything: the chrome, the empty state, the board, Settings, a
   private window. The dry run below cannot see rendering.

To know the damage before downloading anything: fetch each patched file from
`https://hg.mozilla.org/releases/mozilla-release/raw-file/FIREFOX_<v>_RELEASE/<path>`
into a scratch git repo and `git apply --check` each patch against it, then
`git grep -F` the new tree for every Firefox CSS variable, id and JS name
Koi uses (git grep's ERE has no `\b`; use `-F`). 154 → 157 cost two
context-shifted patches, one dead pref, two renamed urlbar variables, one
renamed root attribute and one dead menu id.

---

## App identity

Verified in `obj-aarch64-apple-darwin/config/autoconf.mk`:

```
MOZ_APP_BASENAME = Koi              MOZ_DISTRIBUTION_ID = surf.koi
MOZ_APP_DISPLAYNAME = Koi           MOZ_MACBUNDLE_ID = surf.koi.browser
MOZ_APP_NAME = koi                  MOZ_CHILD_PROCESS_BUNDLEID = surf.koi.plugincontainer
MOZ_APP_VENDOR = Koi                MOZ_MACBUNDLE_NAME = Koi.app
MOZ_APP_UA_NAME = Firefox           MOZ_UPDATE_CHANNEL = release
MOZ_APP_VERSION = 0.1.0             MOZ_APP_ID = {ec8030f7-...} (Firefox's)
```

`MOZ_TELEMETRY_REPORTING`, `MOZ_DATA_REPORTING`, `MOZ_SERVICES_HEALTHREPORT`,
`MOZ_NORMANDY`, `MOZ_CRASHREPORTER` and `MOZ_REQUIRE_SIGNING` are absent from
autoconf.mk, which is what "off" looks like — grep for presence, not `=0`.

The objdir is `obj-aarch64-apple-darwin` because `configs/macos` passes
`--target` explicitly. Surfer globs `obj-*`; it warns if more than one exists.

- `MOZ_APP_UA_NAME=Firefox` is **load-bearing**: `nsHttpHandler` only emits
  the `Firefox/157.0` UA token when the app name is literally `Firefox`.
  Without it the UA is `… koi/0.1.0`, which breaks site compatibility. It
  also suppresses the app token, so the Koi version never leaks into the UA.
- `MOZ_APP_BASENAME=Koi` — application.ini `Name` and the macOS profile dir.
- `MOZ_APP_DISPLAYNAME` comes from `brandShortName` via the generated
  `browser/branding/release/configure.sh`. This is the menu-bar name.
- `MOZ_APP_ID` stays Firefox's GUID, as Zen does, so AMO extensions install.
- `MOZILLA_UAVERSION` (157.0) comes from `config/milestone.txt`, separate
  from `MOZ_APP_VERSION`.

### The appId trap

`MOZ_MACBUNDLE_ID` is composed in `toolkit/moz.configure` as
`{distribution_id}.{bundle_id}`, where `bundle_id` is the `MOZ_MACBUNDLE_ID`
env value surfer writes from surfer.json's `appId`. So **`appId` must be the
bare last component**: `appId: "browser"` + `--with-distribution-id=surf.koi`
→ `surf.koi.browser`, while `appId: "surf.koi.browser"` →
`surf.koi.surf.koi.browser`. Surfer's scaffold ships the wrong shape.
`MOZ_CHILD_PROCESS_BUNDLEID` follows the distribution id. The
`MOZ_DISTRIBUTION_ID` env var is ignored — it must be the configure option
`--with-distribution-id`.

### Version

`MOZ_APP_VERSION` comes from surfer.json `brands.release.release.displayVersion`;
`surfer build` writes it into `engine/browser/config/version{,_display}.txt`.
**Lowering it between builds triggers Firefox's profile-downgrade dialog.**
Delete `obj-*/tmp/profile-default` (or the real profile) if that happens.

---

## Privacy and phone-home defaults

- Telemetry: `mk_add_options` **and** `ac_add_options MOZ_TELEMETRY_REPORTING=`.
  `mk_add_options` alone only reaches make.
- `MOZ_DATA_REPORTING` is derived (`telemetry or healthreport or
  crashreporter or normandy`), not settable. Turn off all four and it
  disappears.
- Crash reporter: `--disable-crashreporter`. Left on, Firefox submits to
  crash-reports.mozilla.com under Firefox's GUID.
- Add-on signing: `MOZ_REQUIRE_SIGNING=` + `--with-unsigned-addon-scopes=app,system`.
- Runtime backstop in `prefs/firefox/telemetry.yaml`.
- Heavy release flags stay gated behind `$KOI_RELEASE` so local builds stay
  fast.

---

## Default preferences

`prefs/**/*.yaml` → `engine/browser/app/profile/koi.js` plus an idempotent
`#include koi.js` appended to Firefox's `firefox.js`, generated by
`scripts/gen-prefs.js` after `surfer import`. No patch to `firefox.js`.
Patches go first because gen-prefs refuses a pref with no reader in the
tree, and a `koi.*` pref may be read only by patched code
(`koi.theme.disable-lightweight` is); on a fresh baseline the reader does
not exist until the patches land.
The format (`name`, `value`, optional `locked` — emitted as the parser's
`pref(name, value, locked)`; there is no `locked_pref()`), and the rule that
every pref must have a reader in the tree, are in `prefs/README.md`. Node rather than Zen's Rust `ffprefs` because
`scripts/` already needs Node for the postinstall patcher.

Static prefs with C++ mirrors additionally need `pref_groups += ["koi"]` in
`modules/libpref/moz.build` (see StaticPrefs plumbing).

---

## Window vibrancy (macOS)

The chrome borrows the desktop wallpaper. **CSS cannot do this**: the
compositor has no desktop pixels, so `backdrop-filter` in the chrome document
blurs Koi's own content and nothing else. Browser windows are therefore
backed by an `NSVisualEffectView` in `BehindWindow` blending mode
(`src/widget/cocoa/nsCocoaWindow-mm.patch`) — the idiom Firefox already uses
for menus and tooltips in `-[BaseWindow setEffectViewWrapperForStyle:]`, and
the approach Zen uses for browser windows.

**It takes two halves.** The effect view sits behind the content view, so
Gecko paints straight over it unless koi-shell.css makes `body`,
`#tabbrowser-tabpanels`, `#navigator-toolbox` and `#browser` transparent.
Either half alone looks like an ordinary opaque window.

- The material chooses the blur; the spec's `blur(52px) saturate(160%)` does
  not port to the window layer. Default material is 1 (HUD window).
  `UnderWindowBackground` (7) is nearly invisible and looks like a broken
  patch. Numbering matches Zen's.
- `koi.widget.macos.window-vibrancy` (bool) and
  `koi.widget.macos.window-material` (uint32) update live via
  `Preferences::RegisterCallback`, so materials can be compared in
  about:config without rebuilding.
- State is pinned to `NSVisualEffectStateActive` so the wallpaper does not
  dim when the window loses focus.
- `SetWindowClass` is where a widget learns it is `navigator:browser`.
- Firefox forces `mWindow.opaque = YES` for non-popup windows. On macOS 26
  the titlebar backdrop is drawn across the top strip between the effect view
  and the DOM, so the patch calls `SetTransparencyMode(Transparent)` when
  vibrancy is on. Verified by a native view-tree dump.

There is **no CSS blur anywhere in Koi's chrome**, and none is possible:
`backdrop-filter` is a no-op over the chrome band (nothing painted to sample)
and over the page card (content renders out of process). Popups get real
blur from macOS instead (below); what Koi floats inside the window — the
urlbar dropdown, the findbar, the board's cards — carries a 96% tint.
koi-theme.css's glass section has the doctrine.

### StaticPrefs plumbing

C++-mirrored prefs need three things:

1. an entry in `modules/libpref/init/StaticPrefList.yaml`, in the
   alphabetically placed `# Prefs starting with "koi."` section
2. `"koi"` in `pref_groups` in `modules/libpref/moz.build`
3. `#include "mozilla/StaticPrefs_koi.h"` at the use site

Miss (2) and the generated header never exists, which surfaces as a
missing-include error, not anything about prefs.

---

## Branding

Brand key is `release`. Surfer generates `engine/browser/branding/release/`
at import from `configs/branding/release/` plus surfer.json's
`brands.release`. **The brand is machine-local state:** `npx surfer set brand
release`, once per clone; it lives in gitignored `.surfer/`.

Inputs (everything else in the generated dir is derived or copied from
Firefox's `unofficial` branding; diff against
`engine/browser/branding/unofficial/` to tell which):

- Required or `checkForFaults` throws: `logo.png`, `logo-mac.png`,
  `firefox.ico`, `firefox64.ico` — the `.ico`s even though Koi is macOS-only.
- Required by `setupImages`: `logo{16,22,24,32,48,64,128,256,512}.png`.
- Optional, copied verbatim: anything else at the top level, plus `content/`.
  Koi supplies `about-logo.svg`, `about-wordmark.svg`, `firefox-wordmark.svg`,
  `about-logo{,@2x}.png` (the Settings/Add-ons header mark via
  `moz-page-nav`, at 32px), `about.png` (`about:logo`), and
  `about-logo-private{,@2x}.png` (about:privatebrowsing; this set is the app
  icon, mark on its dark tile).

**`content/about-logo{,@2x}.png` is supplied, not derived.** `setupImages`
does write them (resizes of `logo.png`) but `addOptionalIcons` runs after it
and copies `content/` verbatim, so the input wins. It matters because
`logo.png` is the tiled app icon, which vanishes at 32px; the supplied file
is the bare mark filling the canvas at `#889098`, a tone that holds on both
`#fff` and `#1c1c1e` because `moz-page-nav` paints one bitmap for both
schemes.

Derived, never hand-edit: `default{N}.png`, `firefox.icns` (async-icns from
`logo-mac.png`), `branding.nsi`, `configure.sh`, `pref/firefox-branding.js`,
`locales/en-US/brand.*`, the `--theme-bg` substitution into
`content/aboutDialog.css` + `stubinstaller/*.css`.

Still Mozilla's, deliberately: `background.png`, `dsstore`, `disk.icns`
(DMG; no release to package yet), `document.icns` (file-type icon),
`document_pdf.svg`.

After a design change: regenerate rasters from `../koi-design/branding/`,
then `npm run import`.

### Replacing a Mozilla asset outright

Some Firefox brand glyphs live in Mozilla's theme dirs, out of branding's
reach. Surfer's `copyManual` handles them: any non-`.patch` file under
`src/<mozilla path>` has Mozilla's file removed and Koi's symlinked in its
place, path appended to `engine/.gitignore`. Zero patches. Koi does it for
nine files:

- `src/browser/themes/shared/sidebar/firefox.svg` — the monochrome "this
  browser" glyph (About Koi nav item, Settings headers). Bare mark,
  `fill="context-fill"`. Not the fox on the default-browser card.
- `src/browser/themes/shared/privatebrowsing/favicon.svg`,
  `src/toolkit/themes/shared/icons/indicator-private-browsing.svg` and, since
  157, `src/browser/themes/shared/privatebrowsing/pbm-logo.svg` — the private
  tab mask, the old indicator pill, and the purple mask 157 draws as the
  indicator button and the about:privatebrowsing logo. All the app icon,
  viewBox trimmed to the tile.
- `src/toolkit/themes/shared/illustrations/kit-{concerned,happy,confetti,holding-lock,in-circle}.svg`
  — the five fox-kit illustrations, one Koi file under five names. Every
  consumer is a `moz-promo`, four of them `imagedisplay="cover"` (cropped to
  the card's text height), which rules out the tile. So: the bare mark at 40%
  on a transparent square, centred, `context-fill` — 40% not 50% because a
  one-line card crops the top ~30%. Verified on the default-browser card; the
  browser-icon subpage and about:pdf promo were not seen rendered.

A replaced file is tracked, so it shows as ` T ` (typechange to symlink) in
`git -C engine status` — expected, not contamination. It is a silent
override: if Mozilla changes the original, nothing tells you. Static assets
only, never logic.

**A replaced asset does not render in a content process in dev builds.** The
dev build serves chrome through symlinks into `engine/`, and a replaced file
is a second symlink out to `src/`, which the content sandbox will not follow;
the parent process reads it fine. So the private tab icon and the indicator
button show Koi's mark while the about:privatebrowsing logo (a child-process
page) shows nothing until packaged — swapping the engine symlink for a real
copy proved the asset itself is fine. The same explains the about:pdf promo
never being seen rendered.

---

## Surfer gotchas

- **Two files in `node_modules` are patched by `scripts/patch-surfer.js`
  (postinstall)**, or `npm install` silently reverts them: surfer's
  `branding-patch.js` (hardcoded zen-browser.app URLs) and
  `async-icns/icns.js` (`rmdir(…, {recursive})`, removed in Node ≥ 24).
- `.surfer/patchCount` records the patch count at last import; if it
  disagrees with `src/`, `surfer build` emits a blocking warning.
- **`surfer reset` runs `git clean -fdx` inside `engine/`** — it deletes the
  objdir.
- `surfer build` regenerates `engine/mozconfig` from `configs/common` +
  `configs/<os>` + an optional untracked root `./mozconfig` + surfer's block.
  Never edit `engine/mozconfig`.
- `MOZ_APPUPDATE_HOST` defaults to `localhost:7648`, deliberately
  non-resolving. Set surfer.json `updateHostname` only with a real update
  server; until then `app.update.auto` stays off.
- `surfer import` applies each patch as `git apply -R` (errors swallowed)
  then `git apply`. On "patch does not apply", diff the engine file against
  its `src/` patch before suspecting the baseline: a session that edited
  `engine/` without `npm run export` leaves the tree matching neither state.
  Export the file, then import.
- `surfer license-check` scans `ENGINE_DIR/src` relative to the cwd, which
  does not exist in Koi's layout, and has not been seen to complete here. Put
  the MPL header on new files by hand; every file in `src/` has one to copy.
- `surfer download` needs GNU tar (`brew install gnu-tar`), and **rewrites
  surfer.json** when it finishes — edit surfer.json after, not before.
- `getCurrentBrandName()` reads `config.brands[brand].brandShortName` with no
  guard: a set brand missing from surfer.json throws; an unset brand silently
  returns `Nightly`.
- Zen's surfer.json has keys 1.14.7 never reads
  (`buildOptions.generateBranding`). Grep the installed surfer before copying
  config from Zen.

### Expected clean state

Right after `surfer download`: exactly ` M browser/extensions/moz.build`.

After `npm run import`, `git -C engine status --short` shows 31 rows, all
attributable. Check the list, not the number:

| Rows | Source |
|---|---|
| `.gitignore` | symlink entries (surfer) + `koi.js` (gen-prefs) |
| `browser/app/profile/firefox.js` | `#include koi.js` (gen-prefs) |
| `browser/config/version.txt`, `version_display.txt` | surfer build, from `displayVersion` |
| `browser/extensions/moz.build` | surfer download no-op |
| `browser/installer/windows/nsis/shared.nsh` | surfer branding, Publisher |
| `build/application.ini.in` | surfer `setUpdateURLs` |
| `.stylelintrc.js`, `browser/base/content/browser.xhtml`, `browser/base/jar.mn`, `browser/base/moz.build`, `browser/components/about/AboutRedirector.cpp`, `browser/components/preferences/config/appearance.mjs`, `browser/moz.configure`, `toolkit/moz.configure`, `toolkit/modules/LightweightThemeConsumer.sys.mjs`, `toolkit/mozapps/extensions/content/aboutaddons.css`, `modules/libpref/moz.build`, `modules/libpref/init/StaticPrefList.yaml`, `widget/cocoa/nsCocoaWindow.{h,mm}` | the 14 patches |
| ` T ` × 9 | the replaced assets above |
| `?? browser/branding/release/` | generated branding |

---

## Toolchain and caches — do not delete

- `~/.mozbuild/` (~3.2G): bootstrapped toolchain (clang, cbindgen, sccache,
  node, macOS SDK). Version-keyed upstream artifacts; re-downloading is waste.
- `~/Library/Caches/Mozilla.sccache` (~7G): content-addressed compiler cache.
  Cannot be contaminated; it is what makes a clobbered rebuild fast.
- `.surfer/engine/firefox-<version>.source.tar.xz` (~800MB each): surfer's
  download cache, one per version fetched. The current one makes a baseline
  rebuild instant and byte-identical; older ones can go.

Safe to clear when resetting: `~/.mozbuild/srcdirs/engine-*` (per-srcdir
mach state keyed by path hash; stale state is reused if `engine/` is
recreated at the same path) and `~/.mozbuild/mach_func_cache`.

`sccache` is invoked via `--with-ccache=sccache`; mach puts
`~/.mozbuild/sccache/` on `PATH` during the build.

---

## Decisions

What is built is described where it lives: every file under `src/koi/` opens
with the why, and koi-chrome.css's header carries the spacing system. This
section is only the standing decisions and the open list.

- **Two rows, v4.** Firefox ships tabs above nav; the layout is a flex
  `order` swap plus nav-bar's own titlebar buttonbox (normally hidden unless
  `[tabs-hidden]`). Back/forward/reload sit in the tab row, moved by
  koi-chrome.js through CustomizableUI; the import URI is
  `moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs`
  (`resource:///modules/` fails to load). The script's DOMContentLoaded
  listener is a **capture** listener: since 157 Firefox builds the toolbars
  from its own window DOMContentLoaded handler (browser-main.js), registered
  before Koi's script, and the `removable` flip has to land before that
  build or CustomizableUI evicts back/forward to the end of nav-bar. The +
  is pinned to the placement right after `tabbrowser-tabs`; anything between
  them sends it to the toolbar's far end (tabs.js `_updateNewTabVisibility`).
- **Customize mode is locked out.** The layout is opinionated; koi-chrome.css
  hides every entry point and koi-chrome.js disables the command.
- **Nova is off and locked, matching Zen** (`browser.nova.enabled` and
  `pdfjs.enableNova`, prefs/firefox/nova.yaml). Nova is Firefox's visual
  refresh, default since 157: new icons, a purple in-content accent, new
  urlbar open geometry, a gradient ring on the selected tab, a density
  control, a theme picker. Koi's chrome was reviewed against Proton-era 154
  and Mozilla still ships the Proton paths, so they are used. The
  Nova-specific overrides in koi-chrome.css stay as the net: the tab ring
  zeroed at `--tab-border-color-accent`, `sidebar-button` hidden with the
  other upsells (CustomizableUI forces it into nav-bar regardless), and the
  open dropdown's view half reading `--urlbar-background-color-focus` (menu
  tint, scoped to `[open]`). When Mozilla removes Proton the pref stops
  meaning anything; re-review the chrome under Nova then — the ~130 icon
  swaps, notification bars, identity panel and menus were never looked at.
  A locked default can still be overridden by a Nimbus rollout (its `nova`
  feature sets the pref on the default branch), so if Nova reappears on a
  profile, look there first.
- **The palette is shelved.** The address pill is a plain editable field
  again; only the open dropdown takes the menu tint. The full palette is
  `src/koi/palette/` in commit `ceefef2`, and the mechanism if it returns:
  since 157 the urlbar view is a native popover in the top layer
  (`[popover-open]` on the field, geometry in `urlbar.css`), so a palette is
  a restyle of it, not a rebuild — the 154-era notes about `[breakout]` and
  pinning `top` no longer apply as written; `gURLBar.view.autoOpen({event})`
  opens rows without typed input; `browser.urlbar.openintab` turns commits
  into new tabs.
- **Peek exists but has no trigger.** koi-board.js and .css carry a `peek`
  mode (one row of cards over the light scrim) that nothing opens; its
  trigger is hold-a-tab, not built. The board is ⇧⌘E.
- **Shortcuts: bind as little as possible**, and bind as a XUL `<key>` in a
  keyset of Koi's own (the WebExtension pattern), never a window key
  listener. Auditing a chord means three places: `browser-sets.inc.xhtml`,
  `ShortcutUtils.getSystemActionForEvent` (JS; on macOS it eats ⌘{ and ⌘} by
  charCode, and Cmd+Shift+punctuation is layout-dependent — use letters), and
  `ShortcutKeyDefinitions.cpp`. ⌘E was dropped because it is macOS-wide "Use
  Selection for Find".
- **Motion is macOS's.** The spring is `300ms cubic-bezier(0.22, 1.2, 0.36, 1)`,
  a deliberate deviation from the spec's 380ms/1.36 (koi-theme.css). Arrow
  panels do not slide (`-moz-window-transform: none`; not swapped for a fade
  because Firefox skips `-moz-window-opacity` on Big Sur+, bug 1672091).
- **Every popup is native, Zen's way.** Menupopups always were; arrow
  panels become NSPopovers via `widget.macos.native-popovers` (a Firefox
  pref Zen upstreamed, off by default), and koi-panels.css clears Firefox's
  `--panel-background-color` so the material shows; `[nonnative]` arrow
  panels take the menu appearance instead. The rule: what macOS draws wears
  its material, what Firefox or Koi draws wears the MENU tint (96% of a
  near-black neutral) — the urlbar dropdown, the findbar, the board's cards
  and the bookmark menus (`.toolbar-menupopup`, Firefox-drawn because they
  need drag and drop). Handing the bookmark menus the native menu
  appearance instead, as Zen does, gets macOS 26's clear menu glass,
  visibly greyer than the popovers.
- **In-content pages keep Firefox's accent** (Settings, Add-ons). The lever
  is `browser.theme.native-theme`, which would also paint a native titlebar
  material on `#navigator-toolbox::after` (browser-shared.css) and need a
  neutraliser in koi-shell.css. Those are Firefox's pages until Koi owns them.
- **about: pages.** `about:rights` is Koi's own static page (154 made it a
  redirect to Mozilla's Terms of Use). `about:credits` stays mozilla.org:
  Gecko is their work. `about:home` still loads the activity stream;
  typed-only, so it does not earn a patch. `about:studies` and
  `about:crashes` are gone, not hidden — their entries are `#ifdef
  MOZ_NORMANDY` / `MOZ_CRASHREPORTER`. Hiding an about: page that exists
  means a C++ flag, so nothing is hidden.
- **Tab groups are off** (`browser.tabs.groups.enabled`) until the strip has
  a design for a group label.
- **Zen is the reference for what to switch off.** Its `prefs/` and
  `src/zen/common/styles/` were audited against 157 and Koi follows it:
  split view and vertical tabs locked off (the two-row layout assumes one
  horizontal strip and one card), the 157 trust panel off (the urlbar CSS
  targets the identity box; re-review when Mozilla removes it, as with
  Nova), the "Firefox Suggest" group label, tab hover previews, the
  auto-opening downloads panel, CFR, UITour, profiles and every AI feature
  (prefs/firefox/ai.yaml). Firefox's accent tokens point at the system
  accent in the chrome; attention glyphs (the starred star, download
  progress) take their button's ink, as in Zen.
- **Themes are off, Zen's way.** `koi.theme.disable-lightweight`
  (prefs/koi/theme.yaml, default true) makes `LightweightThemeConsumer`
  treat any installed theme as the default one, hides the Themes category in
  about:addons and the "Manage themes" link in Settings ▸ Appearance, and
  `browser.aboutaddons.novaThemesPickerEnabled` is off besides. Three
  small patches, one pref, an about:config escape hatch. A theme painted over
  vibrancy half-applies, which is why the mechanism is off and not just the
  UI. Website appearance (light/dark/auto for content) is untouched.
- **The startup page is the empty state**: `browser.startup.homepage` is
  about:blank and session restore is on request (History ▸ Restore Previous
  Session).

**Not yet done:** spaces, the field-as-progress-bar tint, hold-a-tab to
peek, re-pointing View › Show All Tabs at the board, a bookmarks surface
with folders (a flat grid shipped and was withdrawn), the ⌘B/sidebar
decision, the palette's return, tab groups, the private-window empty state. Fox glyphs still inherited, each a product
decision: `preferences/fox-ai.svg`, `sidebar/foxy.svg`,
`fxa/avatar-fox*.svg`, `privatebrowsing/fox-tail.svg`,
`icons/firefox-view.svg` (the app menu's `kit-signed-out.svg` is hidden, as
Zen hides it). Strings naming Firefox literally ("Firefox Labs")
want a strings pass of their own.

**Deferred outright** (Zen has it, Koi does not need it yet): crowdin and
multi-locale, GitHub release workflows, MAR signing, PGO, flatpak,
`configs/dumps/`, `src/external-patches/`, the marionette harness, a
`.python-version` pin.

## Known startup output

- **If several unrelated things break at once at startup, suspect an early
  throw in `BrowserGlue._onFirstWindowLoaded`.** A missing branding pref
  (`app.update.checkInstallTime.days`) once aborted it and silently killed
  the whole `browser-first-window-ready` category: PageActions (the ⌘D
  popup), AboutNewTab, TabCrashHandler. Fixed by
  `app.update.checkInstallTime: false` (misc.yaml).
- **Benign:** `TelemetryUtils.sys.mjs` throws `TypeError: date is undefined`
  when EventPing assembles a ping from a TelemetrySession that never
  initialised. Reporting is compiled out so nothing can be sent; patching
  Firefox for a console line fails the patch budget. It prints red in
  `npm start`; leave it.
