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
- Surfer has no current docs (docs.gluon.dev covers a stale ancestor). Read
  its source in `node_modules/@zen-browser/surfer/dist/`, and the Zen repo.

## How the code documents itself
Every file under `src/koi/` opens with what it owns and why; comments carry
what the code cannot say (Firefox internals relied on, traps, deliberate
departures), with Firefox file names to verify against. This file holds the
build, the traps that span files, and the standing decisions. Keep both that
way: a comment states a reason in as few sentences as it takes, never a
history of attempts.

---

## Repo layout

Koi's own code is never a patch. Zen's `src/` is ~250 small patches against
Mozilla paths plus ~500 whole files under `src/zen/`; Koi mirrors the split.

| Path | Contents |
|---|---|
| `engine/` | Firefox source. Gitignored here, but **its own git repo** (see below). Never commit it here. |
| `src/<firefox-path>/*.patch` | Minimal diffs into Mozilla source. Each is a merge conflict waiting for the next Firefox update — keep them few and small. |
| `src/<firefox-path>/<file>` | A non-patch file under a Mozilla path *replaces* Mozilla's file (see Replacing a Mozilla asset). |
| `src/koi/**` | All of Koi's own UI. Whole files, symlinked into `engine/koi/` and listed in `engine/.gitignore`. No patches. |
| `configs/{common,macos}/mozconfig` | Build config, templated by surfer (`${binName}`, `${changeset}`) and merged into `engine/mozconfig` at build time. |
| `configs/branding/release/` | Branding inputs (raster + ico). See Branding. |
| `prefs/**/*.yaml` | Default prefs, generated into `engine/browser/app/profile/koi.js`. |
| `scripts/` | Node tooling: prefs generator, surfer postinstall patcher, lint runner, log filter. |

## Design sources

`../koi-design/`, outside this repo and unversioned (the only copy).

- `branding/` — SVG masters for `configs/branding/release/`.
  `identity-icons-brand.svg` is dead: its target no longer exists
  (`sidebar/firefox.svg` replaced it).
- `design/` — Claude Design prototypes (`.dc.html`). **Koi Shell v4 is the
  authoritative shell layout** (two rows, tabs below nav). **v5 is
  authoritative only for the empty-state card** (noTabs); its one-row layout
  and its palette (cmdOpen) were dropped. Read values from the specs, not
  from screenshots or the brand kit.

The prototypes are inline styles with `{{template}}` bindings: port values,
never markup. Deliberate departures are commented where they live
(koi-theme.css for glass, motion and the field cap; koi-chrome.css for the
omitted dividers).

### The four-hop bridge

How `src/koi/` reaches the build while touching Firefox in two places
(Zen's mechanism):

1. `src/browser/base/jar-mn.patch` → `#include content/koi-assets.jar.inc.mn` (one line)
2. `src/browser/base/content/koi-assets.jar.inc.mn` → `#include`s each feature dir's `jar.inc.mn`
3. `src/browser/base/content/browser-xhtml.patch` → `#include koi-assets.inc.xhtml` in `browser.xhtml`'s `<head>`
4. `src/browser/base/content/koi-assets.inc.xhtml` → the `<linkset>` of stylesheets and the `<script>` tags

A new feature touches no Firefox file: a dir under `src/koi/`, its
`jar.inc.mn`, an `#include` in step 2 and its tags in step 4.

`src/browser/base/moz-build.patch` (`DIRS += ["../../koi"]`) reaches
`src/koi/moz.build`, whose `DIRS` is empty: unused scaffolding, needed only to
ship modules via `EXTRA_JS_MODULES`, and shared JS is decided to go another
way (below). If it conflicts on a Firefox update, delete both files.

### Decided, not built yet

- **Shared JS** will be an `.mjs` under `src/koi/common/modules/`, shipped by
  the common `jar.inc.mn` and loaded with
  `ChromeUtils.importESModule("chrome://browser/content/koi-common/….mjs")`,
  as Zen does: no moz.build, no patch. Until then every script is an IIFE.
  The trigger is a third copy: `el()` and the XHTML constant are duplicated
  in koi-newtab.js and koi-board.js, and two copies cost less than the
  indirection.
- **`src/koi/about/` is the content-page dir**, with rules no chrome dir has:
  no koi-theme.css (its ink is chrome ink), its own `default-src chrome:`
  CSP, chrome:// assets reachable only because `content browser` is
  `contentaccessible=yes`, and `light-dark()` following the *chrome* scheme
  because an about: page is a chrome document.
- **koi-theme.css splits when a second content page lands.** It mixes
  chrome-only ink with a universal scale/type/radii vocabulary, which is why
  koi-rights.css hand-rolls its spacing.

### jar.inc.mn: the `*` flag

A leading `*` preprocesses the file, and `jar.py` then fails with `no
preprocessor directives found` if it has none — in the `browser/base/misc`
tier, ~18 minutes into a full build. Use `*` only with real directives; in
`.css` the marker is `%` (`%include`, `%ifdef`), not `#`.

Fast checks that skip C++: `./mach build browser/base/misc` exercises the jar
chain in ~5s; `npm run build:ui` (`mach build faster`) covers the front end in
~20s. `npm run build` is for configure or C++ changes.

Never `%include` Koi CSS into Firefox's `browser/themes/*/browser.css`
(surfer's template approach): every UI change would become a Mozilla patch.

---

## Chrome CSS — rules learned the hard way

- **Write nested selectors with an explicit `&`** (`& > #nav-bar { }`), as
  Zen does.
- **`tabpanels` is a grid; padding on it does not inset its children.**
  xul.css gives `tabpanels`/`deck`/`stack` `display: grid` and pins children
  to `grid-area: 1 / 1`. Inset with margin on the grid item (Zen's
  `#zen-tabbox-wrapper` exists for this).
- **Scope `browser[type="content"]` rules** under `.browserSidebarContainer`.
  Bare, it also matches the sidebar, the AI window, picture-in-picture and
  devtools.
- **Guard only what assumes the wallpaper is there.** The guard is
  `:root:not([inDOMFullscreen="true"]):not([inFullscreen]):not([popup-window]):not([chromeless-window]):not([web-extension-popup-window])`,
  applied to one rule, the page card. Restyling a control assumes no
  wallpaper, so koi-chrome.css guards nothing.
- **Style through Firefox's variables** (`--tab-*`, `--urlbar-*`,
  `--toolbarbutton-*`, `--panel-*`), not its DOM structure, and grep the
  tree before writing a name: names move between majors. 157 renamed
  `--urlbar-min-height` to `--urlbar-height`, replaced the urlbar's
  `[breakout]` with a native popover (`[popover-open]`,
  `--urlbar-background-overhang-open`) and the root's `chromehidden` with
  `popup-window` / `chromeless-window`. A rule that misses inside the tab
  strip is usually its internal DOM: kill the thing at its variable
  (`--tabstrip-inner-border`).
- **Set the token Firefox reads, where it reads it.** A token derived at
  `:root` from another is computed there and inherited, so overriding the
  source on a descendant does nothing (157's tab buttons read
  `--tab-content-button-size/-padding`, derived at `:root` from
  `--tab-close-button-padding`).
- **Shadow-DOM tokens need no patch.** Rules from the chrome document outrank
  a shadow root's `:host` rules, so a custom element's tokens and host
  pseudo-elements can be set on the element itself (the infobars'
  `--info-bar-*` and `::before`, the urlbar row menu's `--panel-list-*`, the
  tab audio button's moz-button tokens).
- **Before cancelling a Firefox animation, find what clears its state.**
  `animation: none` on the tab load burst left `[bursting]` stuck (tab.js
  clears it on `animationend`); the fix is `visibility: hidden`.
- **`-moz-window-transform` is invisible to `CSS.supports` and
  `getComputedStyle`** (`enabled_in = "chrome"`). Verify it via the parsed
  rule's `cssText` in `document.styleSheets`, and cascade order via
  `InspectorUtils.getMatchingCSSRules(el)`.

### Lint

`npm run lint` (`-- --fix` to rewrite), never `mach lint` on `engine/koi/`:
its symlinks resolve outside the tree, so eslint drops them and prettier
refuses them, each reporting success over zero files (scripts/lint.js works
around it). `src/-stylelintrc-js.patch` turns off `use-design-tokens` with
`null`, the only "off" stylelint accepts (`false` silently skips every rule).
**A clean run proves nothing on its own: plant an error once to prove the
linter saw the file.** Koi's CSS and JS lint clean; keep it that way. 157's
`no-has-selector` asks for an inline disable with a reason; the one `:has()`
in koi-chrome.css carries it.

### Debugging chrome

- When a rule seems not to work, do not reason about why: build it with an
  unmissable value (24px padding, red background, 3px outline) and look.
  Serving a file over `chrome://` proves it is registered, not applied.
- Vertical spacing off? Paint every box in the stack a different translucent
  colour in one throwaway build. A dark seam is an unowned gap; a colour
  outgrowing its children is that element inflating the row.
- Change one variable per measurement, and do not read small differences off
  scaled screenshots.
- When following Zen, take the whole thing: their C++, CSS *and* pref
  defaults. Each omission has cost a debugging cycle.
- To read chrome state without touching the running Koi, start a second
  instance on a throwaway profile: `koi --marionette
  --remote-allow-system-access --no-remote --profile <dir>` (set
  `marionette.port` in its user.js). Marionette speaks length-prefixed JSON
  (`WebDriver:NewSession`, `Marionette:SetContext {value: "chrome"}`,
  `WebDriver:ExecuteScript`); without `--remote-allow-system-access` the
  chrome context is a null-principal sandbox. Find its windows by the koi
  process's PID (pgrep matches the launching shell too), not by owner name.

## Workflow

- `npm run import` → `npm run build` → `npm start`
- A new file under `src/koi/` needs `npm run import`: surfer symlinks each
  file into `engine/koi/` at import.
- A pref-only change needs `npm run prefs` then `npm run build:ui` (the
  faster backend re-preprocesses `firefox.js`, which includes koi.js).
- A change to `koi-assets.inc.xhtml` (a new stylesheet or script) needs the
  profile's startup cache cleared, with Koi quit:
  `rm -rf ~/Library/Caches/Koi/Profiles/*/startupCache`. `build:ui` writes
  `.purgecaches` into `dist/bin`, which the app bundle does not read.
- `npm start` runs `mach run --noprofile`, so it uses the real profile at
  `~/Library/Application Support/Koi`, not a throwaway one.
- **Dev builds need a sandbox pref for Koi files in web pages.** Chrome files
  are symlinks into `engine/`, and Koi's are a second symlink out to `src/`,
  which content processes may not read (only the repo and obj dirs are
  granted in unpackaged builds, ContentParent.cpp). Without it the dev-mode
  error count never loads on http(s) pages and replaced assets do not render
  in child processes. Per profile, never shipped:
  `user_pref("security.sandbox.content.mac.testing_read_path1", "<repo>/src");`
  in user.js. Firefox copies user.js values into prefs.js, so removing the
  line later also needs a reset in about:config. Packaged builds use omni.ja
  and are unaffected.
- mozbuild hides build output when `CLAUDECODE` is in the env. To see real
  errors: `cd engine && env -u CLAUDECODE ./mach build`.
- **Quit Koi with ⌘Q.** Ctrl+C in the `npm start` terminal counts as a crash;
  two in a row and startup lands on about:sessionrestore.
- **A running Koi absorbs the next `mach run`**: the second launch hands its
  URL to the running instance. Compare process start time with file mtime
  before debugging code that "did not take".
- **Koi opens on its own macOS Space**, so `screencapture -R` grabs the wrong
  one. Capture by window id: `CGWindowListCopyWindowInfo([], …)` (empty
  option set) filtered to the owner, then `screencapture -l<id>`. Headless
  `--screenshot` cannot see chrome.
- `npm start` pipes through `scripts/koi-log.mjs`: red/yellow = chrome JS
  errors/warnings, magenta = Koi's own files, gray = page JS and macOS noise.

---

## engine/ must be a git repo

Surfer's `download` runs `git init` plus an orphan commit of pristine Firefox
inside `engine/`, and `surfer import`, `export`, `status` and `reset` all run
git with `cwd=engine`. If `engine/.git` is missing, git resolves to the outer
koi repo, every patch path lands outside the cwd, `surfer import` reports
`[FINISH] Apply …` while applying nothing, and `surfer export` writes empty
patches.

**The baseline comes from `surfer download` and nothing else.** Never
hand-build it: anything baked into the baseline commit becomes invisible to
`surfer export`. Right after download, `git -C engine status` shows only
` M browser/extensions/moz.build` (surfer's addon step, a no-op). After any
patch work, exported patches are non-empty and `git -C engine log --oneline
-1` shows the baseline commit.

## Patching Firefox source

1. Edit the file in `engine/`
2. `npm run export -- <path>` (e.g. `toolkit/moz.configure`)
3. `npm run import` to confirm it re-applies
4. Check the patch is non-empty — a 0-byte patch means the baseline is broken

Patch filenames mirror the engine path with dots turned into dashes:
`toolkit/moz.configure` → `src/toolkit/moz-configure.patch`. Surfer warns
above 8000 characters; treat that as a hard limit and move logic into
`src/koi/`.

### Configure options that cannot be set from a mozconfig

`project_flag`s with `possible_origins=("implied",)` are a hard configure
error if exported from a mozconfig. Patch them:

- `MOZ_APP_VENDOR` — implied `"Mozilla"` in `browser/moz.configure`
- `MOZ_APP_UA_NAME` — `default=""` in `toolkit/moz.configure`
- `MOZ_SERVICES_HEALTHREPORT`, `MOZ_NORMANDY` — implied `True` in
  `browser/moz.configure`, with no default, so deleting the `imply_option`
  line turns them off

`default=` loses to `imply_option`, so patch whichever file supplies the value.

### Updating Firefox

`npx surfer update` fetches the latest release number, deletes `engine/`
(objdir included), downloads and unpacks the new source, makes the baseline
commit and writes the version into surfer.json (dropping its trailing newline
and adding a `buildOptions` key, both harmless). Clear
`~/.mozbuild/srcdirs/engine-*` first (see Toolchain). Then:

1. `npm run import`. Surfer stops at the first patch that fails; make that
   edit by hand in `engine/`, `npm run export` it, and import again until all
   apply. gen-prefs then refuses any pref the new tree no longer reads;
   delete it from its yaml.
2. A full build; the first after a bump mostly misses sccache (~25 minutes
   on the M5 Pro).
3. Look at everything: the chrome, the empty state, the board, Settings, a
   private window. The dry run below cannot see rendering.

To know the damage before downloading: fetch each patched file from
`https://hg.mozilla.org/releases/mozilla-release/raw-file/FIREFOX_<v>_RELEASE/<path>`
into a scratch git repo and `git apply --check` each patch, then `git grep
-F` the new tree for every Firefox CSS variable, id and JS name Koi uses
(git grep's ERE has no `\b`). The grep catches renames, not new defaults or
moved DOM: 157 also turned on split view, the trust panel and tab hover
previews, moved notification bars into the toolbox and re-derived the tab
button tokens. After a bump, diff Zen's `prefs/` against Koi's again.

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
`--target`. Surfer globs `obj-*` and warns if more than one exists.

- `MOZ_APP_UA_NAME=Firefox` is **load-bearing**: `nsHttpHandler` emits the
  `Firefox/157.0` UA token only when the app name is literally `Firefox`.
  Without it the UA is `… koi/0.1.0`, which breaks sites; it also keeps the
  Koi version out of the UA.
- `MOZ_APP_BASENAME=Koi` is application.ini's `Name` and the macOS profile
  dir. (`MOZ_USER_DIR` is not a mozconfig env var; it stays `Mozilla`.)
- `MOZ_APP_DISPLAYNAME`, the menu-bar name, comes from `brandShortName` via
  the generated `browser/branding/release/configure.sh`.
- `MOZ_APP_ID` stays Firefox's GUID, as in Zen, so AMO extensions install.
- `MOZILLA_UAVERSION` (157.0) comes from `config/milestone.txt`, separate
  from `MOZ_APP_VERSION`.

### The appId trap

`MOZ_MACBUNDLE_ID` is composed in `toolkit/moz.configure` as
`{distribution_id}.{bundle_id}`, where `bundle_id` is the env value surfer
writes from surfer.json's `appId`. So **`appId` must be the bare last
component**: `appId: "browser"` + `--with-distribution-id=surf.koi` →
`surf.koi.browser`, while `appId: "surf.koi.browser"` →
`surf.koi.surf.koi.browser` (surfer's scaffold ships that wrong shape).
`MOZ_CHILD_PROCESS_BUNDLEID` follows the distribution id, which must be the
configure option; a `MOZ_DISTRIBUTION_ID` env var is ignored.

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
  crashreporter or normandy`), not settable; with all four off it disappears.
- Crash reporter: `--disable-crashreporter`. Left on, Firefox submits to
  crash-reports.mozilla.com under Firefox's GUID.
- Add-on signing: `MOZ_REQUIRE_SIGNING=` + `--with-unsigned-addon-scopes=app,system`.
- Runtime backstop: `prefs/firefox/telemetry.yaml`.
- Mozilla's Terms of Use modal is skipped only when `MOZILLA_OFFICIAL` is
  unset (firefox.js). `$KOI_RELEASE` sets it, so
  `termsofuse.bypassNotification` (onboarding.yaml) keeps release builds
  clean, as in Zen.
- Heavy release flags stay behind `$KOI_RELEASE` so local builds stay fast.

---

## Default preferences

`scripts/gen-prefs.js` turns `prefs/**/*.yaml` into
`engine/browser/app/profile/koi.js` and appends an idempotent `#include
koi.js` to `firefox.js`; no patch. It runs after `surfer import` because it
refuses a pref with no reader in the tree, and a `koi.*` pref may be read
only by patched code (`koi.theme.disable-lightweight` is). Format and rules:
`prefs/README.md`. Node rather than Zen's Rust `ffprefs`, because `scripts/`
already needs Node.

C++-mirrored prefs also need StaticPrefs plumbing (below).

---

## Window vibrancy (macOS)

The chrome borrows the desktop wallpaper, which **CSS cannot do**: the
compositor has no desktop pixels, so `backdrop-filter` in the chrome blurs
only Koi's own content. Browser windows are backed by an `NSVisualEffectView`
in `BehindWindow` blending mode (`src/widget/cocoa/nsCocoaWindow-mm.patch`),
the idiom Firefox uses for menus and tooltips
(`-[BaseWindow setEffectViewWrapperForStyle:]`) and Zen for browser windows.

**It takes two halves.** Gecko paints over the effect view unless
koi-shell.css makes `body`, `#tabbrowser-tabpanels`, `#navigator-toolbox`
and `#browser` transparent; either half alone looks like an ordinary opaque
window.

- The material chooses the blur; the spec's `blur(52px) saturate(160%)`
  does not port. Default material 1 (HUD window); 7
  (`UnderWindowBackground`) is nearly invisible and looks like a broken
  patch. Numbering matches Zen's.
- `koi.widget.macos.window-vibrancy` (bool) and
  `koi.widget.macos.window-material` (uint32) update live
  (`Preferences::RegisterCallback`), so materials compare in about:config
  without rebuilding.
- State is pinned to `NSVisualEffectStateActive`, so the wallpaper does not
  dim when the window loses focus.
- `SetWindowClass` is where a widget learns it is `navigator:browser`.
- Firefox forces `mWindow.opaque = YES` for non-popup windows, and on macOS
  26 the titlebar backdrop is drawn across the top strip between the effect
  view and the DOM, so the patch calls `SetTransparencyMode(Transparent)`
  when vibrancy is on (verified by a native view-tree dump).

There is **no CSS blur anywhere in Koi's chrome**, and none is possible:
`backdrop-filter` has nothing to sample over the chrome band or over the
page card (content renders out of process). Popups macOS draws get its real
blur; everything Firefox or Koi draws over the page takes the 96% MENU tint
(koi-theme.css, Glass).

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
  `about-logo-private{,@2x}.png` (about:privatebrowsing; the app icon, mark
  on its dark tile).

**`content/about-logo{,@2x}.png` is supplied, not derived.** `setupImages`
writes resizes of `logo.png`, but `addOptionalIcons` runs after it and copies
`content/` verbatim, so the input wins. `logo.png` is the tiled app icon,
which vanishes at 32px; the supplied file is the bare mark at `#889098`, a
tone that holds on both `#fff` and `#1c1c1e` because `moz-page-nav` paints
one bitmap for both schemes.

Derived, never hand-edit: `default{N}.png`, `firefox.icns` (async-icns from
`logo-mac.png`), `branding.nsi`, `configure.sh`, `pref/firefox-branding.js`,
`locales/en-US/brand.*`, the `--theme-bg` substitution into
`content/aboutDialog.css` + `stubinstaller/*.css`.

Still Mozilla's, deliberately: `background.png`, `dsstore`, `disk.icns`
(DMG; no release to package yet), `document.icns` (file-type icon),
`document_pdf.svg`, and `Assets.car`.

**`Assets.car` must stay unused.** It is the macOS 26 asset-catalog icon
copied from `unofficial` (the blue globe), and macOS 26 prefers it over
`firefox.icns` whenever Info.plist names it. `Info-plist-in.patch` drops
`CFBundleIconName`, as Zen's `no_liquid_glass_icon.patch` does. A Koi
`Assets.car` (built from an Icon Composer file) is the route to a native
Liquid Glass icon. A Dock icon still wrong after a rebuild is LaunchServices'
cache: `touch` the bundle, `lsregister -f` it, relaunch.

After a design change: regenerate rasters from `../koi-design/branding/`,
then `npm run import`.

### Replacing a Mozilla asset outright

Some Firefox brand glyphs live in Mozilla's theme dirs, out of branding's
reach. Surfer's `copyManual` handles them: any non-`.patch` file under
`src/<mozilla path>` replaces Mozilla's file with a symlink to Koi's and is
listed in `engine/.gitignore`. Zero patches. Koi replaces nine:

- `src/browser/themes/shared/sidebar/firefox.svg` — the monochrome "this
  browser" glyph (About Koi nav item, Settings headers). Bare mark,
  `fill="context-fill"`. Not the fox on the default-browser card.
- `src/browser/themes/shared/privatebrowsing/favicon.svg`,
  `src/toolkit/themes/shared/icons/indicator-private-browsing.svg` and
  `src/browser/themes/shared/privatebrowsing/pbm-logo.svg` — the private tab
  mask, the old indicator pill, and the mask 157 draws as the indicator
  button and the about:privatebrowsing logo. All the app icon, viewBox
  trimmed to the tile.
- `src/toolkit/themes/shared/illustrations/kit-{concerned,happy,confetti,holding-lock,in-circle}.svg`
  — the fox-kit illustrations, one Koi file under five names. Every consumer
  is a `moz-promo`, four of them `imagedisplay="cover"` (cropped to the
  card's text height), which rules out the tile: the bare mark at 40% on a
  transparent square, centred, `context-fill` (40%, not 50%, because a
  one-line card crops the top ~30%). Seen on the default-browser card only.

A replaced file is tracked, so it shows as ` T ` (typechange) in
`git -C engine status` — expected. It is a silent override: if Mozilla
changes the original, nothing tells you. Static assets only, never logic.
In dev builds a replaced asset does not render in content processes without
the sandbox pref (Workflow).

---

## Surfer gotchas

- **Two files in `node_modules` are patched by `scripts/patch-surfer.js`
  (postinstall)**, or `npm install` silently reverts them: surfer's
  `branding-patch.js` (hardcoded zen-browser.app URLs) and
  `async-icns/icns.js` (`rmdir(…, {recursive})`, removed in Node ≥ 24).
- `.surfer/patchCount` records the patch count at last import; if it
  disagrees with `src/`, `surfer build` emits a blocking warning.
- **`surfer reset` runs `git clean -fdx` inside `engine/`**, deleting the
  objdir.
- `surfer build` regenerates `engine/mozconfig` from `configs/common` +
  `configs/<os>` + an optional untracked root `./mozconfig` + surfer's block.
  Never edit `engine/mozconfig`.
- `MOZ_APPUPDATE_HOST` defaults to `localhost:7648`, deliberately
  non-resolving. Set surfer.json `updateHostname` only with a real update
  server; until then `app.update.auto` stays off.
- `surfer import` applies each patch as `git apply -R` (errors swallowed)
  then `git apply`. On "patch does not apply", diff the engine file against
  its patch before suspecting the baseline: editing `engine/` without
  `npm run export` leaves the tree matching neither state. Export, then
  import.
- `surfer license-check` scans `ENGINE_DIR/src` relative to the cwd, which
  does not exist in Koi's layout. Put the MPL header on new files by hand;
  every file in `src/` has one to copy.
- `surfer download` needs GNU tar (`brew install gnu-tar`) and **rewrites
  surfer.json** when it finishes — edit surfer.json after, not before.
- `getCurrentBrandName()` reads `config.brands[brand].brandShortName`
  unguarded: a set brand missing from surfer.json throws; an unset brand
  silently returns `Nightly`.
- Zen's surfer.json has keys 1.14.7 never reads
  (`buildOptions.generateBranding`). Grep the installed surfer before
  copying config from Zen.

### Expected clean state

Right after `surfer download`: exactly ` M browser/extensions/moz.build`.

After `npm run import`, `git -C engine status --short` shows 33 rows, all
attributable. Check the list, not the number:

| Rows | Source |
|---|---|
| `.gitignore` | symlink entries (surfer) + `koi.js` (gen-prefs) |
| `browser/app/profile/firefox.js` | `#include koi.js` (gen-prefs) |
| `browser/config/version.txt`, `version_display.txt` | surfer build, from `displayVersion` |
| `browser/extensions/moz.build` | surfer download no-op |
| `browser/installer/windows/nsis/shared.nsh` | surfer branding, Publisher |
| `build/application.ini.in` | surfer `setUpdateURLs` |
| `.stylelintrc.js`, `browser/app/macbuild/Contents/Info.plist.in`, `browser/base/content/browser.xhtml`, `browser/base/jar.mn`, `browser/base/moz.build`, `browser/components/about/AboutRedirector.cpp`, `browser/components/preferences/config/appearance.mjs`, `browser/moz.configure`, `toolkit/moz.configure`, `toolkit/modules/LightweightThemeConsumer.sys.mjs`, `toolkit/mozapps/extensions/content/aboutaddons.css`, `toolkit/themes/shared/global-shared.css`, `modules/libpref/moz.build`, `modules/libpref/init/StaticPrefList.yaml`, `widget/cocoa/nsCocoaWindow.{h,mm}` | the 16 patches |
| ` T ` × 9 | the replaced assets above |
| `?? browser/branding/release/` | generated branding |

---

## Toolchain and caches — do not delete

- `~/.mozbuild/` (~3.2G): bootstrapped toolchain (clang, cbindgen, sccache,
  node, macOS SDK). Version-keyed upstream artifacts; re-downloading is waste.
- `~/Library/Caches/Mozilla.sccache` (~7G): content-addressed compiler cache.
  Cannot be contaminated; it is what makes a clobbered rebuild fast.
- `.surfer/engine/firefox-<version>.source.tar.xz` (~800MB each): surfer's
  download cache. The current one makes a baseline rebuild instant and
  byte-identical; older ones can go.

Safe to clear when resetting: `~/.mozbuild/srcdirs/engine-*` (per-srcdir
mach state keyed by path hash, reused if `engine/` is recreated at the same
path) and `~/.mozbuild/mach_func_cache`.

`sccache` is passed as `--with-ccache`; mach puts `~/.mozbuild/sccache/` on
`PATH` during the build.

---

## Decisions

Standing decisions and the open list. How each is built is in the files
named.

- **Two rows, v4** (koi-chrome.css, koi-chrome.js). Firefox ships tabs above
  nav, so the layout is a flex `order` swap plus nav-bar's own traffic-light
  buttonbox. Back/forward/reload and + are placed through CustomizableUI,
  imported from
  `moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs`
  (`resource:///modules/` fails to load), in a capture-phase
  DOMContentLoaded listener (koi-chrome.js says why). The address pill is
  centred on the window, so a growing right side (dev mode, pinned
  extensions) shrinks it symmetrically. Toolbox rows are ordered nav-bar 1,
  tabs 2, bookmarks 3, `#notifications-toolbar` 4 (since 157 it holds every
  tab's notification bars); a child with no order sorts above the lights.
- **Customize mode is locked out.** koi-chrome.css hides every entry point;
  koi-chrome.js disables the command.
- **Nova is off and locked, as in Zen** (nova.yaml). Koi's chrome targets the
  Proton paths Mozilla still ships. koi-chrome.css's Nova overrides (the tab
  ring, `sidebar-button`, the dropdown's view half) stay for when Proton is
  removed; re-review the chrome under Nova then (~130 icons, notification
  bars, the identity panel and menus were never looked at). A Nimbus
  rollout can override a locked default (its `nova` feature sets the default
  branch): if Nova reappears on a profile, look there first.
- **No floating search palette.** The address pill is a plain field; only the
  open dropdown takes the MENU tint. A palette (v5's cmdOpen) shipped in
  `ceefef2`, was removed, and was decided against again: in 157 only the
  results view is a popover (UrlbarInputBase.mjs), so centring the input
  means moving it over the page card or Zen's ~700-line patch. If it
  returns: new destinations only, click and ⌘L stay in place, ⌘T keeps the
  empty card, patch-free or not at all (`gURLBar.view.autoOpen({event})`
  opens rows without input; `browser.urlbar.openintab` makes commits open
  tabs).
- **Developer mode** (src/koi/devmode/; KoiDevMode.sys.mjs's header has the
  mechanics). Off by default; local pages are always in it, as in Arc. Two
  buttons, both disabled off web pages: Developer Tools fires
  `key_toggleToolbox` (every panel is a tab inside; per-panel and screenshot
  buttons were cut), and ⚒ holds the rest. Everything reuses Firefox's
  machinery. A runtime-registered window actor must declare
  `safeForUntrustedWebProcess`, or it never runs in web or file processes;
  its modules load from Koi's chrome:// dir. Settings ▸ General was declined
  as its home: three Firefox patches.
- **Peek has no trigger yet.** koi-board.js carries a `peek` mode (one row of
  cards over the light scrim) that nothing opens; its trigger is hold-a-tab.
  The board is ⇧⌘E.
- **Shortcuts: bind as little as possible**, as a XUL `<key>` in a keyset of
  Koi's own (the WebExtension pattern), never a window key listener.
  Auditing a chord means three places: `browser-sets.inc.xhtml`,
  `ShortcutUtils.getSystemActionForEvent` (on macOS it takes ⌘{ and ⌘} by
  charCode, and ⇧⌘ with punctuation varies by layout — use letters) and
  `ShortcutKeyDefinitions.cpp`. ⌘E is macOS-wide "Use Selection for Find".
- **The shell does not move**: no entrances, springs or hover lifts; only
  colour and opacity ease (`--koi-fade`, 150ms), and arrow panels do not
  slide. Motion returns as a pass of its own.
- **Every popup is native, Zen's way.** Menupopups are native menus; arrow
  panels become NSPopovers (`widget.macos.native-popovers`, which Zen
  upstreamed), with Zen's fix for that pref taken whole (D299584, in the
  nsCocoaWindow patches and global-shared-css.patch; a Koi override could not
  restore the per-panel padding Firefox zeroes). What macOS draws keeps its
  material; what Firefox or Koi draws over the page takes the MENU tint: the
  urlbar dropdown and its "…" menu, the findbar, the board's cards and the
  bookmark menus (Firefox-drawn for drag and drop; Zen's native appearance
  for them is macOS 26's clear glass, greyer than the popovers).
- **In-content pages keep Firefox's accent** (Settings, Add-ons). The lever,
  `browser.theme.native-theme`, would also paint a native titlebar material
  on `#navigator-toolbox::after` (browser-shared.css) that koi-shell.css
  would have to neutralise.
- **about: pages.** `about:rights` is Koi's own static page (Firefox made it
  a redirect to Mozilla's Terms of Use). `about:credits` stays mozilla.org:
  Gecko is their work. `about:home` still loads the activity stream;
  typed-only, so it does not earn a patch. `about:studies` and
  `about:crashes` are compiled out (`#ifdef MOZ_NORMANDY` /
  `MOZ_CRASHREPORTER`); hiding a page that exists would need a C++ flag, so
  nothing is hidden.
- **Tab groups are off** until the strip has a design for a group label.
- **Zen is the reference for what to switch off.** Its `prefs/` and
  `src/zen/common/styles/` were audited against 157 and Koi follows it:
  split view and vertical tabs locked off, the trust panel off, the
  "Firefox Suggest" label, trending searches, hover previews, the
  auto-opening downloads panel, CFR, UITour, profiles and every AI feature.
- **Themes are off, Zen's way** (koi/theme.yaml): a theme over vibrancy
  half-applies, so the mechanism is off, not just the UI. Three small
  patches, one pref, an about:config escape hatch. Website appearance
  (light/dark for content) is untouched.
- **The startup page is the empty state**: `browser.startup.homepage` is
  about:blank and session restore is on request (History ▸ Restore Previous
  Session).

**Not yet done:** spaces, the field-as-progress-bar tint, hold-a-tab to peek,
re-pointing View › Show All Tabs at the board, a bookmarks surface with
folders (a flat grid shipped and was withdrawn), the ⌘B/sidebar decision, tab
groups, the private-window empty state, the link-hover status panel (still
Firefox's grey label; only its corner padding is Koi's). Fox glyphs still
inherited, each a product decision: `preferences/fox-ai.svg`,
`sidebar/foxy.svg`, `fxa/avatar-fox*.svg`, `privatebrowsing/fox-tail.svg`,
`icons/firefox-view.svg`, `addons/extensions-panel-empty-onboarding.svg` (the
extensions panel with nothing installed). Strings naming Firefox literally
("Firefox Labs") want a strings pass of their own.

**Known issues, found and not yet fixed:**

- **Pages with no background of their own read black on dark.**
  `browser.tabs.allow_transparent_browser` sets `transparent` on every tab's
  browser (Tabbrowser.sys.mjs), not just blank ones, so an unstyled page in
  dark mode shows the #1c1c1e ground under its default black text. Zen
  leaves the pref off. Likely fix: drop the pref and have koi-newtab.js
  toggle `transparent` only while the tab shows nothing.
- **macOS Light appearance has never been looked at.** The NSWindow's
  appearance follows the chrome root's used `color-scheme`
  (PresShell::SyncWindowPropertiesIfNeeded → nsCocoaWindow::SetColorScheme),
  which Koi leaves at Firefox's `light dark`. The chrome's ink assumes dark;
  `:root { color-scheme: dark }` would pin the window to match (content
  keeps its own scheme). Check once in Light before deciding.
- **An unfocused window dims only the tab row.** Firefox fades
  `.browser-titlebar` to 0.6 when inactive, and that class sits on
  TabsToolbar, not nav-bar, so Koi's real titlebar row stays full strength
  while tab-row buttons compound with osx/browser.css's 0.5.
- **`.gitignore` is GitHub's stock Node template**, ~140 lines for tools Koi
  does not use; only the Firefox and surfer entries at the end matter.

**Deferred outright** (Zen has it, Koi does not need it yet): crowdin and
multi-locale, GitHub release workflows, MAR signing, PGO, flatpak,
`configs/dumps/`, `src/external-patches/`, the marionette harness, a
`.python-version` pin. Before a release: a Google Safe Browsing API key
(without one, phishing and malware protection is silently off) and the
macOS updater's signing team id.

## Known startup output

- **If several unrelated things break at once at startup, suspect an early
  throw in `BrowserGlue._onFirstWindowLoaded`**: it silently skips the whole
  `browser-first-window-ready` category (PageActions and the ⌘D popup,
  AboutNewTab, TabCrashHandler). A missing branding pref
  (`app.update.checkInstallTime.days`) did it once; misc.yaml's
  `app.update.checkInstallTime: false` fixed it.
- **Benign:** `TelemetryUtils.sys.mjs` throws `TypeError: date is undefined`
  when EventPing assembles a ping from a TelemetrySession that never
  initialised. Reporting is compiled out so nothing can be sent, and a
  Firefox patch for a console line is not worth it. It prints red in
  `npm start`; leave it.
