# Koi

A fast, minimal browser built on Firefox (Gecko), macOS only.

## Positioning
Restrained and polished. Calm by default. Nothing pops up,
nothing asks for attention, nothing needs learning on first launch.
Chrome has no colour of its own — it borrows the wallpaper. No themes.
All controls in two rows at the top, a short address row and the tabs;
the rest belongs to the page.

## Stack
- Firefox 157 stable, forked via `@zen-browser/surfer` 1.14.7
- Surfer has no current docs (docs.gluon.dev covers a stale ancestor). Read
  its source in `node_modules/@zen-browser/surfer/dist/`.

## How the code documents itself
Every file under `src/koi/` opens with what it owns and why; comments carry
what the code cannot say (Firefox internals relied on, traps, deliberate
departures), with Firefox file names to verify against. This file holds the
build, the traps that span files, and the standing decisions. Keep both that
way: a comment states a reason in as few sentences as it takes, never a
history of attempts.

---

## Repo layout

Koi's own code is never a patch: Firefox is changed by a few small patches
against Mozilla paths, and everything Koi adds is whole files under `src/koi/`.

| Path | Contents |
|---|---|
| `engine/` | Firefox source. Gitignored here, but **its own git repo** (see below). Never commit it here. |
| `src/<firefox-path>/*.patch` | Minimal diffs into Mozilla source. Each is a merge conflict waiting for the next Firefox update — keep them few and small. |
| `src/<firefox-path>/<file>` | A non-patch file under a Mozilla path *replaces* Mozilla's file (see Replacing a Mozilla asset). |
| `src/koi/**` | All of Koi's own UI. Whole files, symlinked into `engine/koi/` and listed in `engine/.gitignore`. No patches. |
| `configs/{common,macos}/mozconfig` | Build config, templated by surfer (`${binName}`, `${changeset}`) and merged into `engine/mozconfig` at build time. |
| `configs/branding/release/` | Branding inputs (raster + ico). See Branding. |
| `prefs/**/*.yaml` | Default prefs, generated into `engine/browser/app/profile/koi.js`. |
| `scripts/` | Node tooling: prefs generator, surfer postinstall patcher, lint runner, log filter; the install window's picture source. |

## Brand sources

The files in `configs/branding/release/` are the masters: the folder of
SVG sources that once sat beside the repo was for an earlier mark and is
gone (2026-11-11). The install window's picture has its source in
`scripts/dmg-background.html`.

### The four-hop bridge

How `src/koi/` reaches the build while touching Firefox in two places:

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
  `ChromeUtils.importESModule("chrome://browser/content/koi-common/….mjs")`:
  no moz.build, no patch. Until then every script is an IIFE.
  `el()` and the XHTML constant are in koi-newtab.js and koi-board.js, with
  a variant that also sets text in koi-agents.js: three six-line copies
  still cost less than the indirection. The trigger is a helper worth
  sharing that is more than a few lines.
- **`src/koi/about/` is the content-page dir**, with rules no chrome dir has:
  its own `default-src chrome:` CSP, chrome:// assets (koi-theme.css
  included) reachable only because `content browser` is
  `contentaccessible=yes`, and `light-dark()` following the *chrome* scheme
  because an about: page is a chrome document. Koi's ink is light only, so a
  page with a light scheme (about:rights) keeps its own light ink.

### jar.inc.mn: no wildcards

jar.py's wildcard resolves a glob against the source root (a leading `/`),
then looks each hit up relative to `browser/base/` again and fails. List
every file.

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

- **Write nested selectors with an explicit `&`** (`& > #nav-bar { }`).
- **`tabpanels` is a grid; padding on it does not inset its children.**
  xul.css gives `tabpanels`/`deck`/`stack` `display: grid` and pins children
  to `grid-area: 1 / 1`. Inset with margin on the grid item, or on a wrapper
  made to be one.
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
`no-has-selector` asks for an inline disable with a reason; the `:has()`
rules in koi-chrome.css and koi-panels.css carry one.

### Debugging chrome

- When a rule seems not to work, do not reason about why: build it with an
  unmissable value (24px padding, red background, 3px outline) and look.
  Serving a file over `chrome://` proves it is registered, not applied.
- Spacing or sizing off? Paint every box in the stack a different
  translucent colour in one throwaway build: a colour outgrowing its
  children is that element inflating the row, and a dark seam is a gap no
  box owns.
- Change one variable per measurement, and do not read small differences off
  scaled screenshots.
- **Drags need real mouse input.** WebDriver pointer actions never start a
  tab drag (an OS drag session), so synthetic tests of drag states only set
  Firefox's attributes by hand. `scripts/mouse.swift` posts HID events
  through CGEvent (`activate` the instance, check `front`, then `down`,
  `drag`, `up`); a merge wants the dragged tab over 20–80% of the target
  for the 240ms grouping delay, a closed chip the same over its label.
- When porting a technique from another Firefox fork, take the whole thing:
  its C++, CSS *and* pref defaults. Each omission has cost a debugging cycle.
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
- **`npm start` clears the profile's startup cache first.** The cache keeps
  browser.xhtml's compiled scripts (`xulcache/script/…`) and is invalidated
  only by a new build ID, which only a full build makes; `build:ui` writes
  `.purgecaches` into `dist/bin`, which the app bundle does not read. A
  stale cache runs old chrome JS against new CSS, so a throwaway profile can
  pass while the real one fails. Launching any other way, clear it by hand
  with Koi quit: `rm -rf ~/Library/Caches/Koi/Profiles/*/startupCache`.
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
- **`npm run vm` runs the current build in a VM** (scripts/vm.sh): `mach
  package` makes the self-contained app (dev builds are symlinks into the
  repo), the DMG goes into the Cua Space `koi`, a headless macOS 26 VM
  on this Mac, and Koi launches there. `cua do screenshot`, `cua do click`
  and `cua do shell` drive it without touching the real screen. The Space
  must be running (`cua spaces start koi`). A packaged build reads
  omni.ja, so the sandbox pref above does not apply to it. The startup cache
  does: `build:ui` then `npm run vm` keeps the build ID, so a profile that
  ran the previous package runs its old chrome JS against the new CSS
  (a board fix did not show, 2026-11-11). Delete the profile's
  `startupCache` (in the profile dir for a `--profile` one) before judging. The guest has python3, so the Marionette harness runs inside
  it (launch with `--marionette --remote-allow-system-access --profile`,
  `marionette.port` in the profile's user.js). Its display hands a recorder
  only the frames that changed, a few a second during motion, so motion is
  judged from clips on this Mac; the VM's job is stills and computed styles.
- **`npm run release` makes the DMG people download** (scripts/release.sh,
  whose header names what it needs): a `KOI_RELEASE` build in its own
  objdir, `engine/objdir-release` (~10 minutes; the dev build is left
  alone), signed, notarized and stapled at `dist/koi.dmg`, and the update
  file installed copies take, `dist/koi.mar`, signed with the update key
  (Replacing a Mozilla asset outright) and checked against it, and
  `dist/update.xml`, which goes into the `koi-updates` repo once the
  release is published: Cloudflare serves it at `update.koi.surf`, where
  installed copies look. Only release builds have the updater
  (configs/macos/mozconfig): a dev build would be offered every release, and
  applying one overwrites the objdir's app. Test it in the VM
  as a stranger would: mark the DMG as a download (`xattr -w
  com.apple.quarantine "0083;<hex time>;Koi;<uuid>"`), drag Koi to
  Applications in its window, and expect only macOS's "downloaded from the
  Internet" prompt. Then Google's test page,
  `testsafebrowsing.appspot.com/s/phishing.html`, must say "Deceptive site
  ahead" (the lists arrive about a minute after first launch;
  `about:url-classifier` shows each provider's last update). A new profile
  runs as `*.default-release`, not `*.default`: a test user.js goes there.
  To test an update without the public server, point the installed copy at
  one in the VM: Firefox reads macOS policies from the app's defaults domain
  (157 has no update-URL pref), so `defaults write surf.koi.browser
  EnterprisePoliciesEnabled -bool true` and `AppUpdateURL
  http://127.0.0.1:8000/update.xml`, serve the newer build's `koi.mar` and an
  `update.xml` pointed at it with `python3 -m http.server`, and open About
  Koi. Building the newer one means bumping `displayVersion` and putting it
  back. A file not signed with the update key fails as `failed: 19`
  (CERT_VERIFY_ERROR) in `~/Library/Caches/Koi/updates/…/last-update.log`.
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
4. `npm run release` once and install it in the VM: the release options
   (157 dropped `--enable-wasm-simd`) and Safe Browsing (misc.yaml) only
   show there.

To know the damage before downloading: fetch each patched file from
`https://hg.mozilla.org/releases/mozilla-release/raw-file/FIREFOX_<v>_RELEASE/<path>`
into a scratch git repo and `git apply --check` each patch, then `git grep
-F` the new tree for every Firefox CSS variable, id and JS name Koi uses
(git grep's ERE has no `\b`). The grep catches renames, not new defaults or
moved DOM: 157 also turned on split view, the trust panel and tab hover
previews, moved notification bars into the toolbox and re-derived the tab
button tokens. After a bump, read the new version's default prefs
(`firefox.js`, `all.js`) for features to switch off in `prefs/`, and
connect an agent once: Agent Connect leans on Mozilla internals that
KoiAgents.sys.mjs's header names.

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
- `MOZ_APP_ID` stays Firefox's GUID, so AMO extensions install.
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
  clean.
- Heavy release flags stay behind `$KOI_RELEASE` so local builds stay fast.

---

## Default preferences

`scripts/gen-prefs.js` turns `prefs/**/*.yaml` into
`engine/browser/app/profile/koi.js` and appends an idempotent `#include
koi.js` to `firefox.js`; no patch. It runs after `surfer import` because it
refuses a pref with no reader in the tree, and a `koi.*` pref may be read
only by patched code (`koi.theme.disable-lightweight` is). Format and rules:
`prefs/README.md`. Written in Node because `scripts/` already needs it.

C++-mirrored prefs also need StaticPrefs plumbing (below).

---

## Window vibrancy (macOS)

The chrome borrows the desktop wallpaper, which **CSS cannot do**: the
compositor has no desktop pixels, so `backdrop-filter` in the chrome blurs
only Koi's own content. Browser windows are backed by an `NSVisualEffectView`
in `BehindWindow` blending mode (`src/widget/cocoa/nsCocoaWindow-mm.patch`),
the idiom Firefox uses for menus and tooltips
(`-[BaseWindow setEffectViewWrapperForStyle:]`).

**It takes two halves.** Gecko paints over the effect view unless
koi-shell.css makes `body`, `#tabbrowser-tabpanels`, `#navigator-toolbox`
and `#browser` transparent; either half alone looks like an ordinary opaque
window.

- The material chooses the blur; no CSS blur value ports. Default material 1 (HUD window); 7
  (`UnderWindowBackground`) is nearly invisible and looks like a broken
  patch.
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
page card (content renders out of process). Menus macOS draws get its real
blur; every panel Firefox or Koi draws is the opaque solid (koi-theme.css,
Solid).

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

Still Mozilla's, deliberately: `document.icns` (file-type icon),
`document_pdf.svg`, and `disk.icns`, which only `mach
package`'s intermediate DMG uses (scripts/release.sh gives the volume
`firefox.icns`).

**The DMG window is `background.png` (1520 × 800 at 144 dpi, a 760 × 400
pt picture) and `dsstore`** (2026-11-11): a light ground with a neutral
silver wash at the top and a light blue one at the foot, "Drag Koi to Applications", three chevrons, and 144px icons centred
at 214,212 and 546,212 pt in a 760 × 412 window (32 of it the titlebar on
macOS 26). The picture is `scripts/dmg-background.html` rendered by
headless Chrome (`--headless=new --hide-scrollbars
--force-device-scale-factor=2 --window-size=760,400 --screenshot=…`), then
`sips -s dpiWidth 144 -s dpiHeight 144`. It draws the name under the
Applications link, which Mozilla names with a space so Finder shows none;
Finder draws "Koi", in black on this ground in light and dark alike. Finder
finds the background through an alias in `dsstore` to
`.background/background.png` on a volume named `Koi` (by file number,
then by path), so `--volume-name Koi` is load-bearing; Mozilla's points at
a volume named Firefox, which left Koi's window white. It was written with
the `ds_store` and `mac_alias` Python libraries (dmgbuild's), against a
DMG make_dmg built around the real app, and deliberately has no `pBBk`
bookmark: one names the exact volume it was made on, Finder trusts it over
the alias, and the window goes white. New art at the same size needs only
`background.png`. Moving the icons or resizing the window is an edit of
the existing file, which keeps the alias: open it with
`ds_store.DSStore.open(path, "r+")` and set `bwsp`'s WindowBounds,
`icvp`'s iconSize and textSize, and the two `Iloc` entries (`Koi.app`
and `" "`). Test by building a DMG with release.sh's make_dmg line around
any packaged Koi.app and opening it in the VM. Finder's own AppleScript
route needs an Automation prompt, which ignores synthetic clicks.

**The app icon is `scripts/AppIcon.icon`, compiled to `Assets.car`**
(2026-11-11). macOS 26 shrinks an app without a layered icon onto a plate,
which is how Koi looked in system menus while it shipped only
`firefox.icns`. The icon is an Icon Composer document written by hand: a
light tile (`#f2f0ed`) with the graphite mark for the default appearance, a
dark one (`#131417`) with the silver mark for Dark, and the silver mark for
Clear and Tinted (the `tinted` appearance covers both), switched by
`opacity-specializations` on two layers. Light is the default, so it is
what most people see. Compile it with `xcrun actool scripts/AppIcon.icon
--compile <dir> --app-icon AppIcon --platform macosx
--minimum-deployment-target 10.15 --output-partial-info-plist <file>` and
copy `<dir>/Assets.car` to `configs/branding/release/`, which import copies
over the `unofficial` one; Info.plist names it `AppIcon` as Firefox does, so
there is no patch. `ictool` inside Icon Composer.app renders any appearance
to a PNG (`--export-image --rendition Default|Dark|ClearLight|…`), with no
margin. `logo-mac.png`, from which import derives `firefox.icns` for macOS
15 and earlier, is that render of the light icon scaled to 824 and centred
on 1024. A Dock icon still wrong after a rebuild is the icon cache: `touch`
the bundle, `lsregister -f` it, relaunch; in the VM that was not enough, and
deleting `com.apple.iconservices*` and `com.apple.dock.iconcache` under
`/private/var/folders` then `killall Dock` was.

**The mark has two finishes, silver on dark and graphite on light**
(2026-11-11), one recipe: six stops on the same diagonal with the sheen at
54% (`koi-mark.svg`, `content/about-logo.svg`, the icon's two layers). The
Settings header is flat `#889098` because that slot is one image for both
schemes. The brand's one colour is a light blue, `#c3dbe2`, the website's
ground and the install window's wash; the chrome itself still has none.

After a design change: replace the rasters in `configs/branding/release/`,
then `npm run import`.

### Replacing a Mozilla asset outright

Some Firefox brand glyphs live in Mozilla's theme dirs, out of branding's
reach. Surfer's `copyManual` handles them: any non-`.patch` file under
`src/<mozilla path>` replaces Mozilla's file with a symlink to Koi's and is
listed in `engine/.gitignore`. Zero patches. Koi replaces thirteen:

- `src/browser/themes/shared/sidebar/firefox.svg` — the monochrome "this
  browser" glyph (About Koi nav item, Settings headers). Bare mark,
  `fill="context-fill"`. Not the fox on the default-browser card.
- `src/browser/themes/shared/privatebrowsing/favicon.svg` — the private
  tab's icon: the ghost, Koi's private-browsing glyph, in `context-fill`.
  The tab row's private pill uses it too (koi-chrome.css), and
  about:privatebrowsing a white copy (koi-private-ghost.svg).
- `src/toolkit/themes/shared/icons/indicator-private-browsing.svg` and
  `src/browser/themes/shared/privatebrowsing/pbm-logo.svg` — the private
  badge in about:addons and the address bar's quick action, and the logo of
  Firefox's private page and Nova's indicator button, neither shown in Koi.
  One file under two names: the ghost on a `--koi-private` disk.
- `src/toolkit/themes/shared/illustrations/kit-{concerned,happy,confetti,holding-lock,in-circle}.svg`
  — the fox-kit illustrations, one Koi file under five names. Every consumer
  is a `moz-promo`, four of them `imagedisplay="cover"` (cropped to the
  card's text height), which rules out the tile: the bare mark at 40% on a
  transparent square, centred, `context-fill` (40%, not 50%, because a
  one-line card crops the top ~30%). Seen on the default-browser card only.
- `src/toolkit/themes/shared/illustrations/{no-connection,security-error}.svg`
  — the fox on the error pages (a page that would not load, a connection
  that is not secure), found in the audit of 2026-11-11 with the VM offline.
  The mark in flat `#889098`, since the page draws one image for light and
  dark.
- `src/toolkit/mozapps/update/updater/release_{primary,secondary}.der` —
  the public half of Koi's update signing key, in both of the release
  channel's slots: the updater applies only updates signed
  with it. The private half is `~/.koi-keys/mar/private_key.pem`, the only
  file a release needs (scripts/release.sh wraps it in a throwaway
  certificate for signmar), never the repo, backed up in Alex's password
  manager; losing it means no installed Koi can update again. A build embeds it in the generated
  `primaryCert.h`/`secondaryCert.h`, which `mach build <dir>` does not
  regenerate; a full incremental build does.

A replaced file is tracked, so it shows as ` T ` (typechange) in
`git -C engine status` — expected. It is a silent override: if Mozilla
changes the original, nothing tells you. Static assets only, never logic.
In dev builds a replaced asset does not render in content processes without
the sandbox pref (Workflow).

---

## Surfer gotchas

- **Two files in `node_modules` are patched by `scripts/patch-surfer.js`
  (postinstall)**, or `npm install` silently reverts them: surfer's
  `branding-patch.js` (the URLs of surfer's original project, hardcoded) and
  `async-icns/icns.js` (`rmdir(…, {recursive})`, removed in Node ≥ 24).
- `.surfer/patchCount` records the patch count at last import; if it
  disagrees with `src/`, `surfer build` emits a blocking warning.
- **`surfer reset` runs `git clean -fdx` inside `engine/`**, deleting the
  objdir.
- `surfer build` regenerates `engine/mozconfig` from `configs/common` +
  `configs/<os>` + an optional untracked root `./mozconfig` + surfer's block.
  Never edit `engine/mozconfig`.
- **The update host is build/moz-build.patch**, `update.koi.surf` (the
  koi-updates repo). Surfer's `updateHostname` only writes
  `export MOZ_APPUPDATE_HOST` into the mozconfig, which 157's configure no
  longer reads, so builds fell back to `aus5.mozilla.org`; it is left unset.
  Surfer rewrites application.ini's update URL to
  `https://<host>/updates/browser/%BUILD_TARGET%/%CHANNEL%/update.xml`.
- The macOS updater's admin-rights helper only trusts code signed by the
  Apple team that configure names; update-programs-configure.patch swaps
  Mozilla's (43AQ936H96) for Koi's (TA2LQ3B5QN).
  Firefox's `--enable-mac-elevated-updates-with-generic-certs` would instead
  trust any Developer ID.
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
- Example surfer.json files online use keys 1.14.7 never reads
  (`buildOptions.generateBranding`). Grep the installed surfer before
  copying config.

### Expected clean state

Right after `surfer download`: exactly ` M browser/extensions/moz.build`.

After `npm run import`, `git -C engine status --short` shows 39 rows, all
attributable. Check the list, not the number:

| Rows | Source |
|---|---|
| `.gitignore` | symlink entries (surfer) + `koi.js` (gen-prefs) |
| `browser/app/profile/firefox.js` | `#include koi.js` (gen-prefs) |
| `browser/config/version.txt`, `version_display.txt` | surfer build, from `displayVersion` |
| `browser/extensions/moz.build` | surfer download no-op |
| `browser/installer/windows/nsis/shared.nsh` | surfer branding, Publisher |
| `build/application.ini.in` | surfer `setUpdateURLs` |
| `.stylelintrc.js`, `build/moz.build`, `build/moz.configure/update-programs.configure`, `browser/base/content/browser.xhtml`, `browser/base/jar.mn`, `browser/base/moz.build`, `browser/components/about/AboutRedirector.cpp`, `browser/components/preferences/preferences.{js,xhtml}`, `browser/moz.configure`, `toolkit/moz.configure`, `toolkit/modules/LightweightThemeConsumer.sys.mjs`, `toolkit/mozapps/extensions/content/aboutaddons.css`, `modules/libpref/moz.build`, `modules/libpref/init/StaticPrefList.yaml`, `remote/shared/webdriver/Capabilities.sys.mjs`, `widget/cocoa/nsCocoaWindow.{h,mm}` | the 18 patches |
| ` T ` × 13 | the replaced assets above |
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

- **Two rows, in Firefox's order** (2026-11-09; koi-chrome.css,
  koi-chrome.js). The tab row is the window's, on the glass: traffic lights,
  the board button, tabs, +, then Agent Connect, downloads and the menu. The
  toolbar is the page's: back, forward, reload, the address field, then what
  acts on the page (Developer tools, extensions). Buttons are placed through
  CustomizableUI, imported from
  `moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs`
  (`resource:///modules/` fails to load); the menu is markup, so its
  container is moved. The address pill is centred on the window, so a
  growing right side (dev mode, pinned extensions) shrinks it symmetrically.
  `#notifications-toolbar` (since 157 it holds every tab's notification
  bars) follows the toolbar, inside the card. One spacing rule runs through
  both rows (koi-chrome.css's header): the tab row is 44 with 36 controls
  and the toolbar 40 with 32, Firefox's own sizes; 4 between neighbours, 8 after the traffic lights, and a control's box 4
  inside the card's edges, so the rows' ends and glyphs line up. There is no bookmarks row: it
  is hidden and its pref locked to never (bookmarks are the empty tab's
  pins).
- **The toolbar is the top of the card, and the selected tab is the
  toolbar's** (2026-11-09; koi-shell.css, The card; koi-chrome.css, The
  selected tab). The glass is the window and is always dark: a grey film at
  half strength on the blur, white ink, resting tab names at the second ink. The toolbar and the selected tab are the solid's BAR, at 85% so a little of the glass comes through (2026-11-11; the two never overlap, which would show), and so is the empty tab's card, under which the blank page paints nothing (koi-newtab.css); the address field is the solid's LIFT, mixed opaque for its
  dropdown. Tabs are Firefox's own height, with no fill at rest and a pill under the
  pointer (2026-11-11; a resting fill was taken out); the selected
  one runs down into the toolbar with a curve at each foot, so the join is
  Koi's surface on both sides. A tab that wore the page's colour and joined
  the page itself was built and taken out the same day: a flat colour shows
  against a photo or a gradient, and a scroll leaves it stale. It has no
  ring. A folder's tray is the tabs' own height, so the selected tab is the
  only thing taller. Tabs, trays and the selected tab's top corners and feet
  all share the tab's one radius. A dragged tab is a pill until it lands:
  Firefox lifts it out of the row. Firefox paints a tab's label from
  `--tab-text-color*`, not the tab's `color`. The panels paint after the
  toolbox, so the card's shadow is clipped at its top edge. An unfocused
  window dims its buttons, not the tab row: a faded row would show through
  the selected tab where it meets the opaque toolbar. Weighed and declined:
  a glass that follows macOS Light, grain, a tint of the accent, folders as
  tinted pills (the tray stays).
- **Customize mode is locked out.** koi-chrome.css hides every entry point;
  koi-chrome.js disables the command.
- **Nova is off and locked** (nova.yaml). Koi's chrome targets the
  Proton paths Mozilla still ships. koi-chrome.css's Nova overrides (the tab
  ring, `sidebar-button`, the dropdown's view half) stay for when Proton is
  removed; re-review the chrome under Nova then (~130 icons, notification
  bars, the identity panel and menus were never looked at). A Nimbus
  rollout can override a locked default (its `nova` feature sets the default
  branch): if Nova reappears on a profile, look there first.
- **No floating search palette.** The address pill is a plain solid field;
  open, its results extend it as one surface. A palette shipped in
  `ceefef2`, was removed, and was decided against again: in 157 only the
  results view is a popover (UrlbarInputBase.mjs), so centring the input
  means moving it over the page card or a ~700-line patch. If it
  returns: new destinations only, click and ⌘L stay in place, ⌘T keeps the
  empty card, patch-free or not at all (`gURLBar.view.autoOpen({event})`
  opens rows without input; `browser.urlbar.openintab` makes commits open
  tabs).
- **Developer mode** (src/koi/devmode/; KoiDevMode.sys.mjs's header has the
  mechanics). Off by default; local pages are always in it. Two
  buttons, both disabled off web pages: Developer Tools fires
  `key_toggleToolbox` (every panel is a tab inside; per-panel and screenshot
  buttons were cut), and ⚒ holds the rest. Everything reuses Firefox's
  machinery. A runtime-registered window actor must declare
  `safeForUntrustedWebProcess`, or it never runs in web or file processes;
  its modules load from Koi's chrome:// dir. Settings ▸ General was declined
  as its home: three Firefox patches.
- **Agent Connect** (src/koi/agents/; KoiAgents.sys.mjs's header has the
  mechanics). A coding agent drives Koi's tabs through Mozilla's
  firefox-devtools-mcp. Its own button in the tab row, on every page, is off
  until ☰ ▸ Agent Connect shows it (`koi.agents.shown`), and stays while
  Allow agents is on, so a browser that listens always shows it; switching
  it off turns Allow agents off too. Allow agents is a setting (`koi.agents.enabled`), never switched off
  for the user: while on, Firefox's remote-control servers wait for agents
  from launch, and an agent that disconnects, idles out (the connector drops
  its session after 30 minutes) or is disconnected leaves them waiting.
  Koi's prompt replaces Firefox's modal one. Once allowed, connections are
  let in without asking until Koi quits, the user disconnects or Allow
  agents goes off (2026-10-31): the connector's idle drop would otherwise
  ask again mid-task. It is
  `noautohide`, so clicks elsewhere and app switches cannot close it (a
  switch to Koi used to, which read as a refusal); only Don't Allow (or
  Escape) holds off prompts for a minute, and a prompt ended any other way
  (40 seconds unanswered, just inside the connector's 45-second wait) refuses
  just that connection. With Koi in the background, the Dock icon
  bounces and a macOS notification, the only one Koi sends, brings Koi
  forward to the prompt. Firefox refuses a second agent before asking, so
  agents take turns. An "Agent" label sits at the end of the
  address field while one is connected. Firefox's banners and red
  address-bar stripes are off. The panel adds Koi to Claude Code (`claude mcp add`, user scope)
  or copies the command for any other agent; the connector is
  pinned to a tested release (KoiAgents.sys.mjs, SERVER; bump after testing)
  and given its console and network tools without the developer preset's
  rarely used ones, and
  Capabilities-sys-mjs.patch so it sees Gecko's 157 rather than Koi's 0.1.0
  (it disables version-gated tools). **The agent works in a folder of its
  own** (KoiAgentTabs.sys.mjs): a tab group marked
  `koi-agent`, one per window, made at the end of the strip and moved like
  any folder, in the agent's blue with the tile glyph and a live dot while
  connected. The agent lists only its tabs (the ones it opens, their
  children, and tabs the user shares); new ones open in the background in
  the folder, Take Back ungroups a tab (Firefox sets it down after the
  folder), and selecting a tab or raising a window is a no-op for the agent,
  so the user's view and keyboard focus never change. Its chip has a small
  native menu instead of the editor; Allow agents off releases it into an
  ordinary folder, as does a restart (the attribute is not persisted). A
  pinned-last folder with new tabs placed before it was built and taken out:
  simpler to let it sit like any folder. Firefox's
  remote code is bent through its exported objects (TabManager,
  windowManager, browser.Context), no patch. **What it does is shown**
  (KoiAgentSteps.sys.mjs): every command passes through
  `GeckoDriver.prototype.getCommandHandler` (Marionette) or
  `WebDriverSession.prototype.execute` (BiDi), both wrapped, so no patch;
  housekeeping is skipped and a successful action becomes a step in words
  ("Clicked “Place order”", named by the page helper before it lands). The
  "Agent" label and the folder chip's "Show Steps" open the last six or
  all (500 kept in memory until quit, a fresh list per connection, a step
  opens its tab); while it acts on the tab on screen, the page card takes
  a ring and an input action a tag where it lands, drawn by the chrome over
  the page, for a beat. Testing trap: a harness session's NewSession clears
  the steps too, so copy them out before reading. A background tab is hidden to its page: Firefox
  pauses its animation frames entirely and throttles its timers, which froze
  scrolling and transitions and kept state out of screenshots. So while an
  agent is connected its tabs are made active as the visible tab is
  (`docShellIsActive`, set again after each tab switch, since the switcher
  turns off a tab the user leaves; `BrowsingContext.isActive` alone left
  frames paused). Smooth scrolls still never move in a background tab:
  Firefox hands them to the compositor (ScrollContainerFrame.cpp), which
  only animates the tab on screen, and rendering a tab is not showing it.
  So an awake tab's smooth scrolls are made instant by a page helper
  (KoiAgentPage.sys.mjs, a window actor created only in agent tabs, again
  after each navigation): a user sheet overrides CSS `scroll-behavior`, and
  the scroll methods take "smooth" as "instant". Undone when the tab stops
  being the agent's or the user looks at it. Tabs an agent's pages open (`target="_blank"`,
  `window.open`) stay in the background too: koi-agents.js wraps the
  window's `gBrowser.addTab` to set `inBackground` when the opener is an
  agent tab, where Firefox would bring them forward. On start, Koi deletes
  every connector port file but its own (`~/.firefox-devtools-mcp/instances`;
  Firefox leaves them after a crash or kill, and only one Koi can listen).
  A workspace, not a lock: a tab's handle still reaches it. Testing traps: the `--marionette` harness marks the launch as
  automation (agent tabs are not installed; call `KoiAgentTabs.install()`
  from the harness), blocks a runtime Marionette, orphans its own session
  once the Remote Agent starts, and meets Koi's prompt on its own later
  connections, even after access is off (Firefox keeps routing them through
  WebDriver BiDi). Script the run in one harness call with chrome timers
  (start, answer the prompt, record to a file with IOUtils), play the agent
  with the connector on the harness port or a WebDriver BiDi client, and read
  the file. Raise the window before a screencapture: macOS neither paints nor
  runs frame callbacks for an occluded window, so captures are stale and a
  wait on requestAnimationFrame never ends. Run test Python with `-I`: a
  helper named enum.py once shadowed the stdlib.
  A second instance cannot listen while the real Koi has Allow agents on:
  9222 is taken, and it shows "Port 9222 in use".
- **The board is a plain grid** (⇧⌘E, koi-board.js): every tab as a card,
  folders flattened. Decks for folders and a hold-a-tab peek were weighed
  and declined (2026-10-31); an untriggered peek mode was taken out.
- **Shortcuts: bind as little as possible**, as a XUL `<key>` in a keyset of
  Koi's own (the WebExtension pattern), never a window key listener.
  Auditing a chord means three places: `browser-sets.inc.xhtml`,
  `ShortcutUtils.getSystemActionForEvent` (on macOS it takes ⌘{ and ⌘} by
  charCode, and ⇧⌘ with punctuation varies by layout — use letters) and
  `ShortcutKeyDefinitions.cpp`. ⌘E is macOS-wide "Use Selection for Find".
- **Motion is felt, not watched** (koi-theme.css, Motion; the passes of
  2026-10-30 and 31). Only the chrome moves, and nothing springs, bounces or
  slides across it: a change is mostly done before it is noticed and ends
  where no one is looking. One curve, quick then soft, in four lengths: FADE
  (150ms) for something changing in place that the pointer did not ask for
  (a tab's content as its slot opens, a tray's tint during a drag), ARRIVE
  (130ms) for a surface coming in (the board crossfades with its cards
  settling from 98%, a tab's slot grows, a folder's tabs grow out of its
  chip), LEAVE (120ms) for one going (the board shrinking back as it fades,
  a tab's slot closing), SETTLE (150ms) for a shape giving way (a folder's
  tray parting into tiles for a drag). A state answering the pointer or the
  keyboard is instant both ways, as on macOS: a hover, a press, a button
  whose panel is open and the selected tab's fill have no transition,
  arriving or letting go (2026-11-11; letting go used to fade, which read
  as slower). A tab's content fades in as its slot opens and
  out as it closes, so a title is never seen squeezed; that means showing
  what Firefox hides while a tab is not [fadein], at tabs.css's specificity,
  with pointer events off. A folder closes at once (Firefox shrinks its tabs
  over the width transition, which tore the tray into pieces) and opens as
  its tabs do; the tray's corners never transition, since the rounded end
  moves to another piece. Panels appear in place, where Firefox slides them
  70px and a pass of 2026-10-31 grew them from their anchor: opened many
  times an hour, any motion there is a wait. The address dropdown is instant
  too; a status leaving (the agent's ring and tag) takes the slower
  --koi-fade-out. The board shows through [open] and visibility, not display
  (Gecko never starts a transition to display none, allow-discrete or not),
  and keeps its cards through the leave so the fade has something
  to fade. Reduced motion zeroes every timing. Weighed and held back as the
  easiest thing to overdo: the board opening from the page (the current
  tab's card shrinking from the page card into its tile); if it comes, it is a FLIP of the card Koi already draws.
- **Menus are native; panels are Koi's** (decided 2026-10-12 in the design
  pass, the Koi Designs canvas). Menupopups stay native menus. Every arrow
  panel, Firefox's and Koi's, is drawn from the panel kit (koi-theme.css,
  Panels; koi-panels.css): the solid at 98% (`--koi-solid-panel`; 95% let
  page text read through), a hairline, 16px corners, no arrow,
  6px below its anchor, 30px menu rows and white main actions, the accent
  kept for focus, selection and switches. Firefox's panels take it through
  the tokens they paint from, so their structure is untouched. Native
  popovers (`widget.macos.native-popovers`) are off, as upstream: macOS
  owned their shape and motion. Everything else over the page is the solid too:
  the address dropdown's results and "…" menu, the findbar, the status
  label, the board's cards and the bookmark menus. UI text never joins
  fragments with "·"; it says a phrase ("Working in 1 tab for 4 min").
- **In-content pages keep Firefox's accent** (Settings, Add-ons). The lever,
  `browser.theme.native-theme`, would also paint a native titlebar material
  on `#navigator-toolbox::after` (browser-shared.css) that koi-shell.css
  would have to neutralise.
- **about: pages.** `about:rights` is Koi's own static page (Firefox made it
  a redirect to Mozilla's Terms of Use), and so is `about:privatebrowsing`
  (below). `about:credits` stays mozilla.org:
  Gecko is their work. `about:home` still loads the activity stream;
  typed-only, so it does not earn a patch. `about:studies` and
  `about:crashes` are compiled out (`#ifdef MOZ_NORMANDY` /
  `MOZ_CRASHREPORTER`); hiding a page that exists would need a C++ flag, so
  nothing is hidden.
- **Private windows are violet**, the chrome's one colour besides the
  accent (`--koi-private`), so one is never mistaken for a normal window:
  the window's glass is tinted (koi-shell.css), the tab row ends in a violet
  "Private browsing" pill (koi-chrome.css), and every new private tab is
  Koi's own `about:privatebrowsing` (src/koi/about/koi-private.html). The
  AboutRedirector patch retargets that entry but keeps Firefox's flags, so
  the page still loads in the privileged about process, where
  `RPMIsWindowPrivate()` lets it say "This isn't a private window" when
  opened elsewhere.
- **No spaces for the MVP**: one window is one set of tabs. A build of
  named tab sets (hidden with `hideTab`) was finished and taken out;
  it is in git history up to `b6165a0`.
- **Folders are Firefox's tab groups** (src/koi/folders/; koi-folders.css's
  header has the DOM and the drawing, its "While a drag is on" section the
  drag states, koi-folders.js's header what Koi adds). A tinted tray around
  a chip and its tabs, painted piece by piece because `tab-group` is
  `display: contents` (a real box was weighed and rejected: Firefox lifts
  the dragged tab out of the row and slides the rest with transforms, so a
  box would end a tab short without JS following the drag); while anything
  drags the pieces round into tiles that slide whole with their tabs.
  Firefox's own feedback (the underline, the chip's fill, the hover halo,
  the drag rings and fills) is zeroed at its tokens or outranked by
  selector; nothing is ringed while a drag is on, the tint says it, and a
  drop target shows the tray the drop would make or join. Decided
  (2026-10-10, the Koi Tab Row canvas): drag-to-merge makes an unnamed
  folder with no panel; right-click opens Firefox's editor with Koi's icon
  row (a double-click rename was built and taken out: too easy to start by
  accident; the pick lives in `koi.folders.icons`, a JSON pref by group id,
  since Firefox persists only id, name, colour and collapsed); the nine
  colours are Koi's values of Firefox's names (koi-theme.css); a folder
  closes at once and opens as its tabs do (Motion); the words say "folder"
  (koi.ftl); Save and Close and Share Group are hidden and nothing is saved
  when a window closes, so Firefox's saved-groups surfaces stay empty; smart
  groups are locked off (chrome-ui.yaml). The closed chip's favicon pile is
  Koi's; the "+N" beside a closed folder's selected tab and the hover list
  are Firefox's. The board lists every tab, folders flattened. Firefox's
  tab menu lays itself out from a list of its items and refuses one it does
  not know (MenuSectionLayout), so a Koi item is added on popupshowing and
  removed on popuphidden.
- **One design system** (koi-theme.css), loaded by the chrome and the
  about: pages, and every Koi sheet is written in it: space (multiples of 4,
  plus INSET, the 10px text sits in from a pill's edge, and 6, a small
  pill's glyph gap); one ladder of heights (BOX 20, PILL-SMALL 24, PILL 28,
  TILE-SMALL 32, ROW 36, TILE 40, 48); icons 10–24; radii by the box's
  height (4 to a BOX, 6, 8 for a PILL or ROW, 10, 12, 16 for a panel); type
  (11, 12, 13, 15, 24, with leading for the three UI sizes; the system font
  throughout, with no mono: tabs and the address are 13); INK (three whites); the accent, private, agent and
  danger colours and the nine folder colours, with TINT (18%) and
  TINT-STRONG (30%) as a colour's film; GLASS (the shell's grey film, then
  rest, well, hover, raised: white films on it); one SOLID for everything on or over the page,
  with its own steps (rule, lift, hover, then the glass well); one scrim and
  two shadows. No size, colour or shadow is written anywhere else, except
  where the use site says why (about:rights' light ink, a page's reading
  measure). A new surface picks a family; a new
  value goes into koi-theme.css first. Verified 2026-10-29 by capturing every
  surface before and after (scratchpad/ds). Two traps found: a Firefox
  rule that paints a glyph's fill through context-stroke (the app menu's
  zoom discs) drops the colour's alpha, so a film must be mixed opaque; and
  the address dropdown colours its URLs through `--link-color`, sized 0.85em
  (view-proton.css), so koi-chrome.css sets both and drops the dash between
  title and address.
- **Koi's words in Firefox's panels** (src/koi/strings/, 2026-10-29).
  koi.ftl holds a message per Firefox string Koi rewords, named
  koi-<Firefox's id> with the same arguments, and koi-strings.js points each
  element at Koi's as its popup or panel view opens (and again once shown,
  for an id Firefox sets after opening). Firefox's strings are untouched:
  one file, no patch, and Firefox resetting an id (the tab menu, the folder
  editor's Copy Links) just gets reworded again. Actions and titles are
  Title Case, as macOS writes menus; descriptions, status lines and
  checkbox labels stay sentence case. A string Firefox formats in JS has no
  id to repoint (the app menu's sign-in row): its text is written directly.
  The chrome itself is repointed once built, and the address field's
  placeholder whenever Firefox sets it (at startup and on an engine change).
  Two ways that do not work: redefining Firefox's ids in a Koi resource (a
  message defined twice in one bundle is a console error, and resources
  join a bundle in a hash set's order), and a second copy of a Firefox file
  in a higher-priority source (every message not in the copy went
  unresolved). Firefox's panels beyond words: the app menu's sign-in promo
  card and the history and bookmarks views' sync promos are hidden, Learn
  More leaves permission prompts, the bookmark editor says Bookmark Added
  with Remove and Done, site information is headed by the host alone, and
  the folder editor's actions carry glyphs and Delete Folder says what it
  closes. The polish pass of 2026-10-30 (a pilot of the packaged build in a
  VM, scratchpad/cua/pilot2): panel titles start at the left; closing a
  folder around the selected tab selects the nearest tab outside it
  (Firefox keeps the selected one on show, so nothing seemed to happen);
  the address field reverts to the page's address when a load becomes a
  download (Firefox leaves the download's); the folder tray is TINT over
  the SHELL film, so a blue folder reads on a blue wallpaper; tab titles
  fade over 16px; the tab menu drops Send to Mobile, Open in New Container
  Tab, Unload Tab and Select All Tabs; the find bar keeps Highlight All and
  Match Case; the extensions panel's empty state is a glyph and "No
  extensions yet"; the downloads button is always in the tab row and the
  private window's second indicator (the flame) is off (chrome-ui.yaml);
  one placeholder, "Search or enter address"; the private pill says
  "Private"; the alerts service is made on first use, not at startup.
- **Settings leaves groups out rather than hiding them.**
  preferences-js.patch drops group ids from `CONFIG_PANES`, so they are never
  built and search cannot find them: Firefox Home (Koi's new windows and tabs
  are the empty state), the vertical-tabs layout, Mozilla's help and feedback,
  the themes group and Appearance's related links. Hiding them by CSS would
  leave search matching them: a pane heading over nothing. The nav's help
  button is `hidden` in preferences-xhtml.patch. "Firefox Relay" stays: it
  names Mozilla's service.
- **What is switched off** (`prefs/firefox/`): split view and vertical tabs
  locked off, the trust panel off, the "Firefox Suggest" label, trending
  searches, the auto-opening downloads panel, CFR, UITour, profiles and every
  AI feature. Firefox's tab hover previews stay, on trial.
- **The address bar suggests only the user's own things**
  (firefox/urlbar.yaml): history, bookmarks, open tabs, recent searches, top
  sites and the engine's plain suggestions. Firefox Suggest is locked
  off; top sites come from the standalone list without Mozilla's
  default sites or partner search shortcuts; no headings, trending or rich
  suggestions. The engine's suggestions as you type stay.
- **Themes are off** (koi/theme.yaml): a theme over vibrancy
  half-applies, so the mechanism is off, not just the UI. Three small
  patches, one pref, an about:config escape hatch. **The chrome is always
  dark**, in macOS Light too: its ink is white (koi-theme.css has no light
  variant), so LightweightThemeConsumer-sys-mjs.patch reports a dark toolbar
  scheme, which sets the chrome's `prefers-color-scheme`, the NSWindow's
  appearance (vibrancy and native menus) and
  `browser.theme.toolbar-theme`. A CSS `color-scheme: dark` pin is not
  enough: Firefox's own chrome keys some colours on the media query. Website
  appearance (`browser.theme.content-theme`) still follows the system.
  Test Light without switching the Mac: `ui.systemUsesDarkTheme = 0` on a
  throwaway profile.
- **The startup page is the empty state**: `browser.startup.homepage` is
  about:newtab, the + tab's page, so the first tab gets the mark like every
  other, and session restore is on request (History ▸ Restore Previous
  Session). Its pins are chips (2026-11-11;
  koi-newtab.css): the favicon and the bookmark's name in a tab's shape,
  wrapping in centred rows, up to 24. Icon-only tiles left the names to a
  hover; a site with no favicon gets Firefox's globe, where letter tiles on
  six colours were.

**Not yet done:** Agent Connect's pick-and-copy (phase 3), the field-as-progress-bar
tint, re-pointing View › Show All Tabs at the board, a bookmarks surface with
folders (a flat grid shipped and was withdrawn), the ⌘B/sidebar decision. No fox shows by default; the urlbar's "Firefox View" quick action
(typed) still has one. Help ▸ Get Help, Share Ideas and Feedback and
Switching to a New Device still lead to Mozilla's Firefox pages until Koi
has its own. Strings naming Firefox literally ("Firefox
Labs") go into koi.ftl as they are found.

**Known issues, found and not yet fixed:**

- **Firefox's "Open previous tabs?" bar shows after a restart** (seen in
  the packaged build, 2026-11-06): it tells the user to restore the session
  from the History menu. Nothing should pop up; find the pref that drives it.

- **The address bar's engine button is hidden** (koi-chrome.css) because its
  menu, a panel-list, ignored real mouse clicks while native popovers were
  on: the dropdown kept the keyboard and clicks on an engine did nothing.
  Arrows and Enter worked, and synthesized clicks (Marionette) passed, so
  only a real mouse shows it. Popovers are off now; retest with real clicks
  in the address bar pass, which would have to dress the button again.
- **Nimbus rollouts are on** (`nimbus.rollouts.enabled`, firefox.js), and
  they ignore the telemetry and studies switches, so Mozilla can still change
  Firefox-targeted features in Koi remotely; a rollout's Nimbus variable even
  outranks a locked fallback pref. Turning them off is
  one pref, but it also stops fixes Mozilla ships as rollouts; decide before
  a release.
- **`.gitignore` is GitHub's stock Node template**, ~140 lines for tools Koi
  does not use; only the Firefox and surfer entries at the end matter.

**Deferred outright** (common in Firefox forks, not needed yet): crowdin and
multi-locale, GitHub release workflows, PGO, flatpak,
`configs/dumps/`, `src/external-patches/`, the marionette harness, a
`.python-version` pin. Release builds read the Google Safe Browsing key
from `~/.koi-keys/safebrowsing.dat` (configs/macos/mozconfig), never the
repo; scripts/release.sh refuses to run without it. Before a
release: checking the Claude Code
icon in the agents panel (agents/claude-code.png, Claude's app icon) against
Anthropic's brand guidelines.

## Known startup output

- **If several unrelated things break at once at startup, suspect an early
  throw in `BrowserGlue._onFirstWindowLoaded`**: it silently skips the whole
  `browser-first-window-ready` category (PageActions and the ⌘D popup,
  AboutNewTab, TabCrashHandler). A missing branding pref
  (`app.update.checkInstallTime.days`) did it once; misc.yaml now
  defines it.
- **Benign:** `TelemetryUtils.sys.mjs` throws `TypeError: date is undefined`
  when EventPing assembles a ping from a TelemetrySession that never
  initialised. Reporting is compiled out so nothing can be sent, and a
  Firefox patch for a console line is not worth it. It prints red in
  `npm start`; leave it.
