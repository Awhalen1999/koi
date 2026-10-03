/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Developer mode — the app's half. koi-devmode.js is each window's.
 *
 * Off by default; the ☰ menu's Developer Mode switch sets koi.devmode.enabled
 * (prefs/koi/devmode.yaml). A tab is in dev mode while that is on, while it
 * shows a page served from this machine (localhost, as Arc does it), and
 * while it has a switch set. Everything here is Firefox's own machinery,
 * reached from one place:
 *
 *   - Full URLs. Dev mode shifts the default of browser.urlbar.trimURLs, so
 *     protocol, port and path stay visible. A value the user set still wins,
 *     and nothing is written to their profile.
 *   - Page errors. A window actor (KoiPageErrorsChild.sys.mjs) reports every
 *     uncaught error and unhandled rejection in a tab's top document. The
 *     main process cannot attribute errors on its own: content errors reach
 *     it re-logged without their window (ContentParent::RecvScriptError).
 *     console.error() counts too, as Chromium's and Firefox's consoles count
 *     it. While the error count is on, the actor is registered for every tab
 *     with dev mode on, and for local pages with it off.
 *   - Per-tab switches — cache, JavaScript, styles, offline, page appearance —
 *     set on the tab's top browsing context, as the devtools and View ▸ Page
 *     Style set them. Their state lives here, keyed by browserId:
 *     a navigation that swaps the browsing context carries only some of
 *     those fields over (CanonicalBrowsingContext::ReplacedBy), so they are
 *     re-applied as the new one attaches, before the page's scripts run.
 *     Turning dev mode off clears every switch in every window.
 *
 * Windows hear about changes through two observer topics: "koi-devmode"
 * (a pref or a switch changed) and "koi-page-error" (subject: the browser). */

const ENABLED_PREF = "koi.devmode.enabled";
const ERROR_COUNT_PREF = "koi.devmode.error-badge";
const TRIM_URLS_PREF = "browser.urlbar.trimURLs";
const ACTOR = "KoiPageErrors";
const MODULES = "chrome://browser/content/koi-devmode/";

const DEFAULTS = Object.freeze({
  cache: true,
  javascript: true,
  styles: true,
  offline: false,
  appearance: "none",
});

// Pages served from this machine, in dev mode whatever the switch says.
// `*.localhost` matches localhost itself.
const LOCAL_PAGES = ["*://*.localhost/*", "*://127.0.0.1/*", "*://[::1]/*"];
const localPages = new MatchPatternSet(LOCAL_PAGES);

const defaultBranch = Services.prefs.getDefaultBranch("");
const TRIM_URLS_DEFAULT = defaultBranch.getBoolPref(TRIM_URLS_PREF);

// Errors per top-level document. A navigation brings a new WindowGlobal, so
// a page's count starts at zero without any bookkeeping.
const errorCounts = new WeakMap();

// browserId → the tab's switches, held only while one differs from DEFAULTS.
const overrides = new Map();

// Where the error count's actor is registered: null, "all" or "local".
let actorScope = null;

/**
 * Counts the errors KoiPageErrorsChild reports against the page's
 * WindowGlobal, and tells the windows which browser they came from.
 */
export class KoiPageErrorsParent extends JSWindowActorParent {
  receiveMessage({ data: errors }) {
    if (!Number.isSafeInteger(errors) || errors < 1) {
      return;
    }
    errorCounts.set(
      this.manager,
      (errorCounts.get(this.manager) ?? 0) + errors
    );
    const browser = this.browsingContext.top.embedderElement;
    if (browser) {
      Services.obs.notifyObservers(browser, "koi-page-error");
    }
  }
}

function apply(browsingContext, state) {
  if (!browsingContext || browsingContext.isDiscarded) {
    return;
  }
  browsingContext.defaultLoadFlags = state.cache
    ? Ci.nsIRequest.LOAD_NORMAL
    : Ci.nsIRequest.LOAD_BYPASS_CACHE;
  browsingContext.allowJavascript = state.javascript;
  browsingContext.forceOffline = state.offline;
  browsingContext.prefersColorSchemeOverride = state.appearance;

  // The field only reaches documents yet to load (Document.cpp); those
  // showing are told through their PageStyle actors, as View ▸ Page Style
  // tells them (gPageStyleMenu).
  const unstyled = !state.styles;
  if (browsingContext.authorStyleDisabledDefault != unstyled) {
    browsingContext.authorStyleDisabledDefault = unstyled;
    for (const context of browsingContext.getAllBrowsingContextsInSubtree()) {
      context.currentWindowGlobal
        ?.getActor("PageStyle")
        .sendAsyncMessage(unstyled ? "PageStyle:Disable" : "PageStyle:Switch", {
          title: null,
        });
    }
  }
}

function sync(_subject, _topic, pref) {
  const enabled = Services.prefs.getBoolPref(ENABLED_PREF, false);
  defaultBranch.setBoolPref(
    TRIM_URLS_PREF,
    enabled ? false : TRIM_URLS_DEFAULT
  );

  let scope = null;
  if (Services.prefs.getBoolPref(ERROR_COUNT_PREF, true)) {
    scope = enabled ? "all" : "local";
  }
  if (scope != actorScope) {
    if (actorScope) {
      ChromeUtils.unregisterWindowActor(ACTOR);
    }
    if (scope) {
      ChromeUtils.registerWindowActor(ACTOR, {
        parent: { esModuleURI: MODULES + "KoiDevMode.sys.mjs" },
        child: {
          esModuleURI: MODULES + "KoiPageErrorsChild.sys.mjs",
          events: {
            // Brings the actor to life before the page's scripts run, so it
            // hears their console from the start.
            DOMDocElementInserted: {},
            // Neither bubbles, so they are caught on the way down.
            error: { capture: true },
            unhandledrejection: { capture: true },
          },
        },
        matches: scope == "local" ? LOCAL_PAGES : undefined,
        messageManagerGroups: ["browsers"],
        // Web pages run in untrusted processes, which only admit actors that
        // say so (JSActorService.cpp). This one is: its message is a
        // count, checked on arrival, and a lying process can only inflate
        // its own page's badge.
        safeForUntrustedWebProcess: true,
      });
    }
    actorScope = scope;
  }

  // Only the switch going off clears them: the error count's switch, flipped
  // on a local page, must leave its tab alone.
  if (pref == ENABLED_PREF && !enabled) {
    for (const browserId of overrides.keys()) {
      apply(BrowsingContext.getCurrentTopByBrowserId(browserId), DEFAULTS);
    }
    overrides.clear();
  }

  Services.obs.notifyObservers(null, "koi-devmode");
}

function onBrowsingContext(browsingContext, topic) {
  if (browsingContext.parent || !overrides.has(browsingContext.browserId)) {
    return;
  }
  if (topic == "browsing-context-attached") {
    apply(browsingContext, overrides.get(browsingContext.browserId));
  } else if (
    !BrowsingContext.getCurrentTopByBrowserId(browsingContext.browserId)
  ) {
    // The tab closed; a context merely replaced has a successor by now.
    overrides.delete(browsingContext.browserId);
  }
}

export const KoiDevMode = {
  get enabled() {
    return Services.prefs.getBoolPref(ENABLED_PREF, false);
  },

  set enabled(value) {
    Services.prefs.setBoolPref(ENABLED_PREF, value);
  },

  get errorCountEnabled() {
    return Services.prefs.getBoolPref(ERROR_COUNT_PREF, true);
  },

  set errorCountEnabled(value) {
    Services.prefs.setBoolPref(ERROR_COUNT_PREF, value);
  },

  /**
   * Whether the tab is in dev mode: the switch is on, the tab shows a local
   * page, or it has a switch set (so an altered tab never looks normal).
   *
   * @param {MozBrowser} browser
   */
  isActive(browser) {
    return (
      this.enabled ||
      overrides.has(browser.browserId) ||
      localPages.matches(browser.currentURI)
    );
  },

  errorCount(browser) {
    const page = browser.browsingContext?.currentWindowGlobal;
    return (page && errorCounts.get(page)) || 0;
  },

  /**
   * The tab's switches: { cache, javascript, styles, offline, appearance }.
   *
   * @param {MozBrowser} browser
   */
  switches(browser) {
    return { ...DEFAULTS, ...overrides.get(browser.browserId) };
  },

  hasSwitches(browser) {
    return overrides.has(browser.browserId);
  },

  setSwitch(browser, name, value) {
    const state = { ...this.switches(browser), [name]: value };
    apply(browser.browsingContext, state);
    if (Object.keys(DEFAULTS).every(key => state[key] === DEFAULTS[key])) {
      overrides.delete(browser.browserId);
    } else {
      overrides.set(browser.browserId, state);
    }
    Services.obs.notifyObservers(null, "koi-devmode");
  },

  /**
   * Re-applies the tab's switches after a navigation (bfcache swaps the
   * browsing context without attaching a new one).
   *
   * @param {MozBrowser} browser
   */
  reapply(browser) {
    const state = overrides.get(browser.browserId);
    if (state) {
      apply(browser.browsingContext, state);
    }
  },
};

Services.prefs.addObserver("koi.devmode.", sync);
Services.obs.addObserver(onBrowsingContext, "browsing-context-attached");
Services.obs.addObserver(onBrowsingContext, "browsing-context-discarded");
sync();
