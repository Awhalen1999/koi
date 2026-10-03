/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Developer mode — the app's half. koi-devmode.js is each window's.
 *
 * Off by default; the ☰ menu's Developer Mode switch sets koi.devmode.enabled
 * (prefs/koi/devmode.yaml). Everything here is Firefox's own machinery,
 * reached from one place:
 *
 *   - Full URLs. Dev mode shifts the default of browser.urlbar.trimURLs, so
 *     protocol, port and path stay visible. A value the user set still wins,
 *     and nothing is written to their profile.
 *   - Page errors. A window actor (KoiPageErrorsChild.sys.mjs) reports every
 *     uncaught error and unhandled rejection in a tab's top document. The
 *     main process cannot attribute errors on its own: content errors reach
 *     it re-logged without their window (ContentParent::RecvScriptError).
 *     The actor is registered only while dev mode and its error count are on.
 *   - Per-tab switches — cache, JavaScript, offline, page appearance — set on
 *     the tab's top browsing context, as the devtools set them
 *     (target-configuration.js). Their state lives here, keyed by browserId:
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
  offline: false,
  appearance: "none",
});

const defaultBranch = Services.prefs.getDefaultBranch("");
const TRIM_URLS_DEFAULT = defaultBranch.getBoolPref(TRIM_URLS_PREF);

// Errors per top-level document. A navigation brings a new WindowGlobal, so
// a page's count starts at zero without any bookkeeping.
const errorCounts = new WeakMap();

// browserId → the tab's switches, held only while one differs from DEFAULTS.
const overrides = new Map();

let actorRegistered = false;

/**
 * Counts the errors KoiPageErrorsChild reports against the page's
 * WindowGlobal, and tells the windows which browser they came from.
 */
export class KoiPageErrorsParent extends JSWindowActorParent {
  receiveMessage() {
    errorCounts.set(this.manager, (errorCounts.get(this.manager) ?? 0) + 1);
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
}

function sync() {
  const enabled = Services.prefs.getBoolPref(ENABLED_PREF, false);
  defaultBranch.setBoolPref(
    TRIM_URLS_PREF,
    enabled ? false : TRIM_URLS_DEFAULT
  );

  const countErrors =
    enabled && Services.prefs.getBoolPref(ERROR_COUNT_PREF, true);
  if (countErrors && !actorRegistered) {
    ChromeUtils.registerWindowActor(ACTOR, {
      parent: { esModuleURI: MODULES + "KoiDevMode.sys.mjs" },
      child: {
        esModuleURI: MODULES + "KoiPageErrorsChild.sys.mjs",
        // Neither event bubbles, so they are caught on the way down.
        events: {
          error: { capture: true },
          unhandledrejection: { capture: true },
        },
      },
      messageManagerGroups: ["browsers"],
      // Web pages run in untrusted processes, which only admit actors that
      // say so (JSActorService.cpp). This one is: its message has no payload
      // and the parent trusts nothing but its arrival.
      safeForUntrustedWebProcess: true,
    });
  } else if (!countErrors && actorRegistered) {
    ChromeUtils.unregisterWindowActor(ACTOR);
  }
  actorRegistered = countErrors;

  if (!enabled) {
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

  errorCount(browser) {
    const page = browser.browsingContext?.currentWindowGlobal;
    return (page && errorCounts.get(page)) || 0;
  },

  /**
   * The tab's switches: { cache, javascript, offline, appearance }.
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
