# Koi

A fast, minimal browser built on Firefox (Gecko), macOS only.

## Positioning
Helium's restraint, Zen's polish. Calm by default. Nothing pops up,
nothing asks for attention, nothing needs learning on first launch.
Chrome has no color of its own — it borrows the wallpaper. No themes.
All controls in two 44px rows at the top; the rest belongs to the page.

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

## Design sources

`../koi-design/` — **outside this repo and not under version control.** Sole
copy. Worth fixing.

- `branding/` — SVG masters. These are the inputs behind
  `configs/branding/release/`; the rasters there were generated from them.
- `design/` — the Claude Design prototypes, exported as `.dc.html`.
  **`Koi Shell v4.dc.html` is the authoritative shell layout** — two rows,
  tabs below nav, a centered address pill that is a control, not an input.
  v5 ("one line of chrome") was built, shipped, and deliberately retired: one
  shared row read as cool but not practical, and it needed DOM surgery where
  v4 needs none. **v5 stays authoritative for the floating surfaces** — the
  palette (cmdOpen), the empty-state card (noTabs) — which Koi kept. Read
  values from the specs rather than from screenshots or the brand kit, which
  is less complete. Also `Koi Brand Kit`, `Branding Handoff`, `Lockup Cards`,
  `Platform Icons`, `Spiral Mark`, plus `svg/` icon variants and `uploads/`
  (placeholder wallpapers).

The prototypes are inline styles with `{{template}}` bindings — POCs, so port
values, never the markup. What they settle:

- Chrome is **two rows**, split by what they act on. Top row, the window's:
  lights, back/fwd/reload, a **centered address pill capped at 520px** (lock,
  mono host, bookmark star; wash at rest, active on hover), then
  extensions/downloads/menu. Bottom row, the page's: the board button, the
  tab strip (equal-width tabs, 178px ceiling, 100px floor, then sideways
  scroll, 4px gaps), the +. The bottom row's `padding: 0 12px 4px` is where
  the page card's top gutter comes from.
- The address pill as a **display and a trigger** (clicking summons the
  palette, which is where typing happens) is spec intent that was built and
  then deliberately shelved — see the palette note in Current state. Today
  the pill is an ordinary editable field in Koi's clothes.
- Glass is a **depth system, not one value** — the further forward a surface
  sits, the more it blurs and saturates. Shell 52/160, menu 52/170, palette
  64/180, empty-state card 30/140, plus scrims at `rgba(8,10,14,.52)`+6px
  (board) and `rgba(8,10,14,.28)`+2px (palette).
- Motion is **two speeds**: spring `380ms cubic-bezier(.32,1.36,.5,1)` for
  anything that moves or resizes, fade `150ms linear` for anything that only
  changes colour. Keyframes `koiDrop`, `koiFade`, `koiRise`, `koiPop`.
- Still ahead of the implementation: peek (⌘E), the board (⇧⌘E), and spaces.

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

### Decided, deliberately not built yet

- **Shared JS, when it is needed.** Every Koi script is an IIFE behind a
  `<script>` tag, so they share the window and nothing is importable. When that
  stops being enough the answer is an `.mjs` under `src/koi/common/modules/`,
  shipped by the existing common `jar.inc.mn` and pulled in with
  `ChromeUtils.importESModule("chrome://browser/content/koi-common/…mjs")` — no
  `moz.build` change, no `EXTRA_JS_MODULES`, no patch. Zen does exactly this
  (`src/zen/common/modules/`). The trigger is a third copy: `el()` and the XHTML
  constant are duplicated across koi-newtab.js and koi-board.js today, and two
  copies cost less than the indirection.
- **`src/koi/about/` is the content-page dir**, and content pages play by four
  rules no chrome dir has: koi-theme.css is not loaded (its ink is chrome ink),
  the page carries its own `default-src chrome:` CSP, it reaches chrome://
  assets only because `content browser` is `contentaccessible=yes`, and
  `light-dark()` resolves off the *chrome* scheme because an about: page is a
  chrome document.
- **koi-theme.css splits when the second content page lands.** It mixes
  chrome-only ink with a universal scale/type/radii vocabulary, which is why
  koi-rights.css hand-rolls its spacing rather than using the tokens. One page
  does not justify the surgery; by the third the scale will have been
  re-derived by hand twice.

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
`npm run build:ui` (`mach build faster`) covers front-end more broadly and takes
~19s. Neither compiles C++, so both are safe to run constantly while working on
chrome. Reserve `npm run build` for changes that touch configure or source.

**Do not** use surfer's template approach of `%include`-ing your CSS into
Firefox's own `browser/themes/*/browser.css`. That makes every UI change a patch
against Mozilla source. Koi started that way; it was removed.

---

## Chrome CSS — rules learned the hard way

**Nesting works — but write the `&` explicitly.** An earlier round concluded
"nesting does not apply from Koi's stylesheets". That was **wrong**, and the
measurement behind it was confounded: flattening the selector also dropped
`#tabbrowser-tabbox` from the chain and removed the guards, so three things
changed and only one was blamed. A later probe with a single changed property
confirmed `& > #nav-bar { }` nested inside `#navigator-toolbox` applies.

What is still unverified is *bare* nesting — `#foo { }` with no `&`, which is
what the failed attempt used. Zen writes `& #foo` everywhere, so write the `&`
and the question never has to be answered.

**`tabpanels` is a grid; padding on it does not inset its children.**
`toolkit/content/xul.css` gives `tabpanels`/`deck`/`stack` `display: grid` and
pins children to `grid-area: 1 / 1`. Padding on the container has no effect on
them. Use **margin on the grid item**. This is why Zen injects
`#zen-tabbox-wrapper` and forces `#tabbrowser-tabbox { display: flex }` — that
wrapper is not decoration, it is the workaround.

**Scope `browser[type="content"]` rules.** On its own it also matches the
sidebar browser, the AI window, picture-in-picture and devtools panels. Anchor
it under `.browserSidebarContainer` when you mean tab content.

**Guard what assumes the wallpaper is there** — not chrome rules in general.
The guard is
`:root:not([inDOMFullscreen="true"]):not([inFullscreen]):not([chromehidden~="location"]):not([chromehidden~="toolbar"])`,
and it belongs on rules whose geometry only makes sense with desktop behind
the window: a fullscreen space has no wallpaper to frame a card with, and a
chrome-less `window.open` popup is not a browser window.

Koi applies it to exactly one rule, the page card in koi-shell.css. The other
rules in that sheet — the body film, the transparency set, the page ground —
are deliberately unguarded, and koi-chrome.css guards nothing across its 43
selectors, correctly: restyling a control does not assume a wallpaper. An
earlier version of this note said to guard chrome rules generally, which
would have added four clauses to every selector in the tree for nothing.

**`src/-stylelintrc-js.patch` turns off `use-design-tokens`.** Koi has its own
token system; linting against Mozilla's buried real errors under noise. Our CSS
passes `mach lint -l stylelint` with zero problems — keep it that way.

### Debugging chrome

When a rule appears not to work, do not reason about why. Build it with an
unmissable value — a 24px padding, a red background, a 3px outline — and look.
It costs one 12-second `npm run build:ui`.

**Row instrumentation, the spacing analogue:** when vertical spacing looks
off, do not measure screenshots — scaled captures lie (see below). Paint every
box in the stack a different translucent colour in one throwaway build
(`#nav-bar` red, `#TabsToolbar` blue, `#tabbrowser-tabs` green,
`.tabbrowser-tab` orange outline, `#PersonalToolbar` purple,
`#urlbar-container` yellow outline). A dark seam between two colours is an
unowned gap; one colour outgrowing the boxes inside it is that element
inflating the row. This found TabsToolbar accumulating height from content
where nav-bar was clamped — the fix that followed declares every row's
height explicitly.

**Change one variable per measurement.** More than one and the result tells you
about the pair, not the cause. This was got wrong repeatedly and cost a cycle
each time.

**Do not read small differences off scaled screenshots.** A "2px gap" in a
downscaled capture was read as a working 4px padding that was in fact doing
nothing, and an entire wrong explanation was built on top of it.

## Workflow

- `npm run import` → `npm run build` → `npm start`
- `npm start` runs `mach run --noprofile` so it uses the real profile at
  `~/Library/Application Support/Koi`, not a throwaway one in the objdir
- Prefer whole files in `src/koi/` over patches to Firefox source, always
- mozbuild hides build output when it sees `CLAUDECODE` in the env, which makes
  failures invisible. To see real errors:
  `cd engine && env -u CLAUDECODE ./mach configure` (or `./mach build`)
- **Quit Koi with ⌘Q.** Ctrl+C in the `npm start` terminal kills the process,
  which sessionstore records as a crash (sessionCheckpoints.json ends with no
  shutdown entries); two in a row and startup lands on about:sessionrestore's
  "trouble getting your pages back". Not a bug — a dev-loop artifact.
- **A running Koi absorbs the next `mach run`.** A second launch hands its URL
  to the existing instance rather than starting the new build, so a change can
  look like it did not take when it simply is not loaded. Compare the process
  start time against the file mtime before debugging the code.
- **Koi opens on its own macOS Space**, so `screencapture -R <rect>` grabs
  whatever app is on the *visible* Space, not Koi. Capture by window id
  instead — `CGWindowListCopyWindowInfo([], …)` (an empty option set;
  `optionOnScreenOnly` hides other Spaces) filtered to owner `Koi`, then
  `screencapture -l<id>`. Headless `--screenshot` stays the better tool for
  page content, but it cannot see chrome.
- `npm start` pipes through `scripts/koi-log.mjs`: magenta = Koi's own files,
  red/yellow = chrome errors/warnings (the bug radar), gray = page JS and
  macOS noise, with same-host page spam collapsed to a counter. The JS-error
  echo is gated by `browser.dom.window.dump.enabled` (local builds only),
  which cannot split page from chrome — hence the filter.

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

## Window vibrancy (macOS)

The chrome borrows the desktop wallpaper. **CSS cannot do this** — the
compositor has no desktop pixels to sample, so `backdrop-filter` on the chrome
document blurs Koi's own content and nothing else. Only the OS can composite
what is behind a window.

So browser windows are backed by an `NSVisualEffectView` in
`NSVisualEffectBlendingModeBehindWindow`, in
`src/widget/cocoa/nsCocoaWindow-mm.patch`. This is not exotic: Firefox already
uses the identical idiom for menus and tooltips in
`-[BaseWindow setEffectViewWrapperForStyle:]`. Zen does the same for browser
windows, which is where the approach came from.

### It takes two halves

The patch alone does nothing visible. The effect view sits *behind* the content
view, so Gecko paints the chrome straight over it and the window looks entirely
normal. The other half is `src/koi/common/styles/koi-shell.css` making
`body`, `#tabbrowser-tabpanels`, `#navigator-toolbox` and `#browser`
transparent. **Neither half is worth anything without the other**, and both
failure modes look identical from outside — an ordinary opaque window.

Consequences worth knowing:

- **The material chooses the blur.** You cannot dial `blur(52px)
  saturate(160%)` on the shell — you pick from Apple's materials. The prototype's
  exact shell numbers are therefore *not* portable to the window layer. They
  remain correct for floating surfaces, which blur Koi's own chrome and so are
  ordinary CSS.
- **Default material is 1 (HUD window).** `UnderWindowBackground` (7) is
  Apple's most restrained material and is close to invisible on its own —
  defaulting to it looks exactly like a broken patch. Numbering matches Zen's
  so their notes transfer.
- `koi.widget.macos.window-vibrancy` (bool) toggles it live;
  `koi.widget.macos.window-material` (uint32) picks the material. Both update
  live via `Preferences::RegisterCallback`, so materials can be compared in
  about:config without rebuilding — the only practical way to choose one.
- State is pinned to `NSVisualEffectStateActive` rather than
  `FollowsWindowActiveState`, so the wallpaper does not dim when the window
  loses focus.
- `SetWindowClass` is the hook where a widget learns it is `navigator:browser`
  rather than a popup or dialog. It is a virtual on `nsIWidget`, called from
  `AppWindow.cpp` with the `windowtype` attribute off `browser.xhtml`.
- Firefox forces `mWindow.opaque = YES` for non-popup windows ("Non-popup
  windows are always opaque"). AppKit still composites the effect view — but on
  macOS 26 the titlebar backdrop "matches the window background" and is drawn
  across the top strip *between* the effect view and the DOM, so an opaque
  window paints that strip solid and no CSS can reach it. The patch therefore
  calls `SetTransparencyMode(Transparent)` when vibrancy is on. Verified by a
  native view-tree dump: `NSTitlebarContainerView` spans the strip above
  `KoiWindowMaterialView`. (An earlier note here said the call was unnecessary;
  that was pre-macOS-26.)

### Debugging chrome, the cheap way first

Two changes here were made on plausible reasoning and neither worked, because
the actual unknown was never tested: *does this stylesheet reach the chrome at
all?* A throwaway build painting `#navigator-toolbox` red answered it in twelve
seconds and eliminated an entire branch. Serving a file over `chrome://` proves
it is **registered**, not that it is **applied** — different claims.

When following a reference implementation, take the whole thing. Zen's C++ was
read closely three times while their CSS and their pref defaults went unread,
and both omissions cost a full debugging cycle each.

### StaticPrefs plumbing

C++-mirrored prefs need three things, not one:

1. an entry in `modules/libpref/init/StaticPrefList.yaml`, in the alphabetically
   correct `# Prefs starting with "koi."` section
2. `"koi"` added to `pref_groups` in `modules/libpref/moz.build`
3. `#include "mozilla/StaticPrefs_koi.h"` at the use site

Miss (2) and the generated header never exists, which surfaces as a confusing
missing-include error rather than anything about prefs.

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
- `surfer import` applies each patch as `git apply -R` (revert, errors
  swallowed) then `git apply`. If it dies with "patch does not apply", diff
  the engine file against its `src/` patch before suspecting the baseline: a
  session that edited `engine/` without running `npm run export` leaves the
  tree matching *neither* state, so both applies fail. The tree is ahead —
  export the file, then import. (This happened with `nsCocoaWindow.mm`'s
  macOS 26 `SetTransparencyMode` fix.)
- `surfer license-check` scans `ENGINE_DIR/src` relative to the cwd, which
  does not exist in Koi's layout — it errors before checking anything. Put
  MPL headers on new files by hand (every file in `src/` has one to copy).
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

After `npm run import`, the engine's working tree shows one modification per
patch plus the generated-file edits below. The count tracks the patch count, so
check the list rather than a number — today it is 18 modifications and one
untracked directory, all attributable:

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

**Runtime verified.** The browser launches and
`chrome://browser/content/koi-styles/koi-theme.css` serves from the running
build, so the four-hop chain works at runtime, not just at build time.

**Design tokens are in.** `src/koi/common/styles/koi-theme.css` carries the full
`--koi-*` set transcribed from the shell spec: 4px scale, chrome metrics, radii,
ink, surfaces, the two glass recipes, scrims, shadows and the two motion speeds,
plus a `prefers-reduced-motion` override. Tokens only — no rules yet, so Koi
still looks exactly like Firefox.

**Vibrancy works.** Confirmed at runtime: the desktop wallpaper shows through
the chrome, and switching `koi.widget.macos.window-material` in about:config
changes it live without a restart. 9 patches, all re-applying cleanly. The
cocoa files pass `mach lint -l clang-format` with no changes.

**The page card works.** `src/koi/common/styles/koi-shell.css` insets the page
by the gutter, rounds it to `--koi-radius-page` and drops `--koi-shadow-page`
under it, so the wallpaper frames the page on all four sides. 10 patches.

**Audited against Zen** (multi-agent review, 14 verified findings). Fixed:
- `.browserContainer` sits between the card and the browser and Firefox paints
  `--tabpanel-background-color` on it — `#f9f9fb`, or a **purple gradient in
  private windows** — exposed whenever `browser:is([blank],[pendingpaint])`
  drops to `opacity: 0`. Koi now paints it, keyed off
  `-moz-content-prefers-color-scheme` rather than `light-dark()`, because the
  element inherits the *chrome's* scheme but must match the *page*.
- `:not([inFullscreen])` added — a macOS fullscreen space has no wallpaper to
  frame the card with. The attribute is set both valued and bare; match bare.
- `#navigator-toolbox`'s unconditional `border-bottom: 0.01px` rounded up to a
  device pixel and drew a hard line across the wallpaper gutter.
- `!important` narrowed to `body` alone, where `:-moz-window-inactive`
  out-specifies it. Elsewhere it was suppressing Firefox's deliberately-opaque
  fullscreen toolbox. `background-color`, not the shorthand.
- `body`'s `will-change: background-color` is a dead compositor hint once the
  colour is pinned; set to `auto`.

**Tokens: 48.** Added accent (the CSS `AccentColor` system keyword — the
user's macOS accent, live from System Settings; Koi imposes no colour of its
own — plus two `color-mix` variants), the mono
stack, an 8-size type scale, and the three glass **tints** — the blur values
collapse to one recipe without loss, the tints do not. Deleted
`--koi-radius-window` and `--koi-shadow-window`: AppKit draws both.

**Load-bearing for the palette and menus:** there is **no CSS blur anywhere in
Koi's chrome**. `backdrop-filter` is a no-op over the chrome band (the chrome
paints nothing, so there is no backdrop to sample) **and** over the page card —
page content renders out-of-process and chrome CSS cannot sample a remote
browser's pixels. An earlier note claimed blur bites over the card; floating
the palette over a real page disproved it. The tints carry every floating
surface (which is why menus and the palette share the near-opaque .90 recipe),
and the only real blur is the window's own vibrancy behind an empty tab.

**The two-row chrome is in (Koi Shell v4).** `src/koi/chrome/` is one
stylesheet plus one small script (`koi-chrome.js`, CustomizableUI widget
placements — the furniture CSS cannot move), zero new Firefox patches:

- Firefox already ships both rows, tabs above nav; the whole v4 layout is a
  flex `order` swap on `#navigator-toolbox`. The traffic lights come along
  because **nav-bar ships its own buttonbox and titlebar spacers** (normally
  CSS-hidden unless `[tabs-hidden]`); Koi shows nav-bar's and hides
  TabsToolbar's. (v5's one-line chrome needed JS to merge the rows into one —
  that script and its `[koi-onerow]` gate were deleted with the pivot, which
  is much of why v4 won.)
- The address pill centers between Firefox's own toolbar springs, capped at
  `--koi-field-max`. An ordinary editable field in Koi's clothes: wash at
  rest, active on hover, the near-opaque menu tint while focused or open, no
  go-button, no search-engine chip.
- Style through Firefox's **variable API** (`--tab-min-height`,
  `--tab-max-width`, `--urlbar-background-*`, `--toolbarbutton-*`) rather than
  its structure, and grep the 154 tree before writing a name — several
  memorable ones are gone: `--toolbarbutton-inner-padding` is now
  `--toolbarbutton-padding-inner`, hover is
  `--toolbarbutton-background-color-hover`.
- The urlbar input is `.urlbar-input` (a class; `#urlbar-input` no longer
  exists), the pill is `.urlbar-background` and is painted entirely by
  variables, and focus state is `#urlbar[focused]`.
- `close-12.svg` draws the whole × through `context-fill-opacity`, so
  `fill-opacity: 0` deletes the glyph — it is not the hover circle.
- Two prefs carry the rest (`prefs/firefox/chrome-ui.yaml`): bookmarks toolbar
  `never`, `browser.tabs.tabMinWidth` 100 — the spec's tab floor, which
  Firefox plumbs into layout itself.
- The spacing system is documented at the top of `koi-chrome.css`. One pill
  height (`--koi-pill-height`, 28 — judged by eye at 24/28/32/36; 28 is
  Helium's control height, one breath of air above their total) drives every
  row as pill + 2×4px air; **row heights are declared, never accumulated
  from content** (a content-derived row grows by whatever Firefox puts in
  it — TabsToolbar did). The page card owns all four of its edges
  (`margin: var(--koi-gutter)`, koi-shell.css); no row carries batting for a
  neighbour. Glyph geometry stays Firefox's 16px-in-32px boxes, and **every
  small control glyph is 13px in a 20px radius-4 box, quiet ink, wash on
  hover, 4px from its neighbours** — tab ×, tab speaker, card ×, card
  speaker. The tab audio control is `.tab-audio-button`, a moz-button styled
  through its variable API and `::part(button)`; `.tab-icon-overlay` is the
  *pinned* tab's corner badge, a different element.
- Back/forward/reload live in the tab row (they act on the page), moved by
  `koi-chrome.js` via CustomizableUI. Two traps cost a day: the import URI is
  `moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs`
  (`resource:///modules/` fails to load — watch the terminal for the red
  import error), and back/forward ship `removable="false"`, which makes
  window build **silently evict** their placements — flip the attribute at
  DOMContentLoaded, before toolbars build.
- The stock all-tabs chevron is hidden; Koi's board button (`koi-board.js`)
  sits in its seat. The strip's pre-tabs separator is killed at its token
  (`--tabstrip-inner-border: none`) — an element-scoped rule provably could
  not reach it; when a rule mysteriously misses, suspect the strip's
  internal DOM and kill via the variable instead.
- Deliberate deviations from the spec: the hairline dividers are omitted;
  spacing carries the grouping.

**The empty state is in (v5's noTabs card).** `src/koi/newtab/` — a chrome
overlay, not a content page, because the design shows the wallpaper *through*
an empty tab and a web page can't do that:

- `koi-newtab.js` builds `#koi-empty-state` inside `#tabbrowser-tabbox` and
  stamps `[koi-empty]` on `:root` while the selected tab shows nothing
  (TabSelect + TabAttrModified + location changes — busy flips always
  dispatch TabAttrModified, which matters because a settled about:blank
  emits no further progress events). "Shows nothing" is Firefox's
  `tab.isEmpty` **minus its no-session-history clause**: that getter answers
  "safe to close", so a tab *navigated* to a blank URL — typing about:newtab,
  or the Home command — failed it and sat there featureless. Firefox draws
  the same distinction itself in browser.js's `onLocationChange`.
  `checkEmptyPageOrigin` stays and is the guard: a page that navigates itself
  to about:blank inherits the site principal and fails it, so content can
  never summon the pins. about:home is excluded — it is in Firefox's blank
  list but is not blank here (see the seam below), and the card needs a
  transparent browser to show wallpaper, which a real document is not. Pins are the toolbar folder's
  bookmarks — the folder the star saves to — capped at 24, wrapping to
  centered rows; favicons via `page-icon:`, and a site with no stored
  favicon gets a letter tile (its initial on one of six mock colours,
  hashed from the host). Refetched on each reveal, staleness-guarded.
- The overlay is `pointer-events: none` (pins opt back in): chrome sharing
  the card's space — the findbar at its bottom edge — must stay clickable
  through it.
- The wallpaper path: `browser.tabs.allow_transparent_browser` makes blank
  browsers paint nothing (koi-shell.css's content-backdrop rule already
  excluded `[transparent="true"]`), and under `[koi-empty]` koi-newtab.css
  lifts `.browserContainer`'s paint and the card's shadow. Ordinary pages are
  untouched — they sit on `.browserContainer`, which still paints.
- Startup lands on about:blank too (`browser.startup.homepage`), which
  resolves the "what is the startup page" gap: the empty state is.
- `koiRise`, `koiDrop` and `koiFade` live in koi-theme.css with the motion
  tokens; `koiPop` joins when something needs the spec's transform-centered
  drop.

**The palette (v5's cmdOpen surface) was built, shipped, and shelved for
now** — the pill is a plain editable field again, and search may return as a
floating surface later. The full implementation is one `git show` away —
`src/koi/palette/` as of commit `ceefef2` ("update tab and search UI") — and
the mechanism is small and known:

- The urlbar in 154 is a manual popover in the top layer (`[breakout]`,
  `position: absolute`), sized by stylesheet rules over JS-measured
  `--urlbar-width/height` variables — a floating palette is a *restyle* of
  that popover, not a rebuild. UrlbarInput pins `style.top` inline on every
  focus (and its flush-less measurement can report stale positions), so a
  restyle must pin `top` itself with `!important`.
- `gURLBar.view.autoOpen({event})` opens the suggestion rows without typed
  input (it wants a `mousedown`/`command`-shaped event); the scrim is the
  popover's own `::backdrop`; the results view restyles via its
  `--urlbarview-*` token API plus `color-scheme: dark`.
- The Zen new-tab flow (⌘T/+ open the palette over the current page, commit
  creates the tab) is: intercept ⌘T/+ in capture phase, plus Firefox's own
  `browser.urlbar.openintab` pref — `_whereToOpen` turns plain commits into
  "tab", reuses `tab.isEmpty` tabs, keeps ⌥↩ as navigate-in-place.

What remains today: the open dropdown gets the near-opaque menu tint via
`--urlbar-background-color-focus` and `color-scheme: dark` (koi-chrome.css) —
a translucent film over out-of-process page content is unreadable, see the
glass doctrine in koi-theme.css.

**The panel sweep is in.** `src/koi/panels/` dresses every arrow panel (app
menu, downloads, identity, extensions, bookmark editor, tab preview,
confirmation hints) through the `--panel-*` token API — one rule, near-opaque
MENU tint, `color-scheme: dark`. Menupopups and plain panels stay native
(macOS renders them with real vibrancy). The findbar gets the same tint; its
field wears the address field's clothes, and its yellow open-blink is off by
pref (`accessibility.typeaheadfind.flashBar`, chrome-ui.yaml).

**Tab overflow is in.** No scroll arrows, no stock smudge: the outermost
pills fade via a `mask-image` on the scrollbox (the only way to dissolve a
pill into wallpaper the chrome doesn't paint), keyed on the arrowscrollbox's
own `overflowing`/`scrolledtostart`/`scrolledtoend` attributes, stop lengths
`@property`-registered so the fade's appearance fades.

**The boards are in (⌘E peek, ⇧⌘E board).** `src/koi/board/` — one surface,
two densities: peek is a row of tab cards over the float scrim, board the
full grid over the board scrim; a `mode` attribute switches the layout.
Cards = MENU-tint header (favicon, title, audio badge, ×) over a live
thumbnail via `PageThumbs.captureTabPreviewThumbnail` (Firefox's own
tab-hover capture; pending/blank tabs keep glass). Cards rebuild fresh per
open; tab listeners bind only while shown. ⌘E deliberately reclaims
find-selection; keys are capture-phase for now (impolite to pages — see the
keyboard-citizenship item below). The board button (`#koi-board-button`,
2×2-squares glyph at gecko's 1.5px ink) replaces the stock all-tabs chevron;
`skipintoolbarset` keeps CUI from evicting it. A bookmarks mode shipped and
was withdrawn — a flat grid loses folders; it can return designed.

**The about: pages are handled.** `about:about` lists every registered about
module without `HIDE_FROM_ABOUTABOUT`, drawn from three registries:
`docshell/base/nsAboutRedirector.cpp`, `browser/components/about/AboutRedirector.cpp`,
and components registering `about;1?what=` (cache, compat, debugging,
sync-log, home/newtab). Koi's list is Zen's minus `about:studies` — that
entry is `#ifdef MOZ_NORMANDY`, so switching Normandy off deleted the page
rather than hiding it, exactly as `#ifdef MOZ_CRASHREPORTER` did for
`about:crashes`. Hiding a page that *does* exist means editing a C++ flag,
which is why nothing is hidden.

- **`about:rights` is Koi's own page** (`src/koi/about/`; 11 patches). 154
  turned that entry into a redirect to Mozilla's Firefox Terms of Use — terms
  that do not govern Koi, and the only page in the build making a false
  statement. No local rights page survives in the tree to point at, so Koi
  ships one: static HTML + CSS as whole files, plus a 2-line patch
  retargeting the map entry. Flags copy `about:robots` (the static-chrome-page
  precedent two entries below) minus `ALLOW_SCRIPT` — the page has no script
  and is granted none; `URI_MUST_LOAD_IN_CHILD` left with the remote URL.
- It can reach its own stylesheet because `browser/base/jar.mn` declares
  `content browser` as `contentaccessible=yes`. That is the mechanism for any
  future Koi content page: chrome:// assets under `content/browser/koi-*`,
  plus the page's own `default-src chrome:` CSP.
- The page is a **chrome document**, like every about: page —
  `browser.theme.toolbar-theme` flips its scheme, `browser.theme.content-theme`
  does not, so `light-dark()` there resolves off the chrome scheme. koi-theme.css
  is still deliberately not loaded: its ink is white at three opacities, right
  over wallpaper and wrong on a white card. Its background mirrors
  `.browserContainer`'s underpaint, which keys off the *content* scheme instead
  — so Website Appearance set opposite the system yields one frame of the wrong
  ground while loading, as it does on Firefox's own in-content pages.
- `prefs/firefox/about-pages.yaml` switches off every upsell that reaches a
  Koi about page: `browser.vpn_promo.enabled` (two surfaces —
  about:privatebrowsing's promo and about:protections' VPN card),
  `browser.promo.focus.enabled`, and AMO's two recommendation feeds in
  about:addons.

**Deliberately left alone:** `about:credits` still points at mozilla.org —
Gecko is Mozilla's work and crediting them is honest; Zen redirects theirs
for brand reasons Koi does not have. `about:home` still loads the activity
stream: `AboutNewTabRedirector.sys.mjs` gates only `about:newtab` on
`browser.newtabpage.enabled` and takes `defaultURL` unconditionally for
`about:home`. Typed-only (Koi's chrome has no Home button), so it does not
earn a patch to a Mozilla module. Restyling preferences/addons/reader, and
hiding firefoxview or telemetry from the list, are cosmetic and want a
design first.

**Not yet done:** spaces, the field-as-progress-bar tint, hold-a-tab to
peek, keyboard citizenship (migrate ⌘E/⇧⌘E from capture-phase interception
to dynamically-added XUL keys so pages get first refusal), a bookmarks
surface with folders, the ⌘B/sidebar decision, and the palette's return.
`src/koi/moz.build` still has an empty `DIRS` until a feature ships JS
modules (Koi scripts load via jar + browser.xhtml, not EXTRA_JS_MODULES).
`prefs/koi/` does not exist yet.

**Startup errors — resolved and known.** The old `BrowserGlue.sys.mjs:447`
`getIntPref` throw was a missing branding pref
(`app.update.checkInstallTime.days`) aborting `_onFirstWindowLoaded`, which
silently killed the whole `browser-first-window-ready` category — PageActions
(the star/⌘D popup), AboutNewTab (the other startup error), TabCrashHandler
and more. Fixed by `app.update.checkInstallTime: false` (misc.yaml); if a
startup regression ever looks like "several unrelated things broke at once",
suspect an early throw in that sequence first.

**Known benign seam:** `TelemetryUtils.sys.mjs` throws
`TypeError: date is undefined` (truncateToHours) when EventPing assembles a
ping from a TelemetrySession that never initialised. Recording-off prefs do
not reach it, reporting is compiled out so nothing can ever be sent, and
patching Firefox for a console line fails the patch-budget test. It prints
red in `npm start`'s filtered log (scripts/koi-log.mjs); leave it.


`identity-icons-brand.svg` sits unused in `../koi-design/branding/`; it lives in
`browser/themes/shared`, not in branding, so it needs a different mechanism.

Deliberately deferred (Zen has it, Koi does not need it yet): crowdin and
multi-locale, GitHub release workflows, MAR signing, PGO, flatpak,
`configs/dumps/`, `src/external-patches/`, the marionette test harness, and a
`.python-version` pin.
