/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The agent's folder: the tabs an agent works in, and the rule that its work
 * never changes what the user sees.
 *
 * The agent's tabs live in a folder of their own (a Firefox tab group,
 * src/koi/folders/, carrying the `koi-agent` attribute), one per window,
 * made at the end of the strip and moved like any folder: every tab the
 * agent opens, tabs those open (Firefox puts a related tab in its opener's
 * group), and any tab the user shares. Taking a tab back ungroups it, which
 * sets it down right after the folder. The folder is never made in a
 * private window; with Allow agents off it is released into an ordinary
 * folder. The attribute is not persisted, so after a restart a folder from
 * the last session is an ordinary one too.
 *
 * Firefox's remote code reaches tabs through a few exported objects, which
 * Koi bends here with no patch:
 *   - TabManager.allTabs (TabManager.sys.mjs) is what the agent lists
 *     (WebDriver:GetWindowHandles, browsingContext.getTree) and what BiDi
 *     events are gathered from, so it holds the folder's tabs only.
 *   - browser.Context.switchToTab (marionette/browser.sys.mjs) with no index
 *     is how a new session takes "the current tab"; it takes an agent tab
 *     instead, opening one if the window has none.
 *   - Selecting a tab (TabManager.selectTab) and raising a window
 *     (browser.Context.focusWindow) do nothing: the agent works in the
 *     background. geckodriver asks for focus on every switch (marionette.rs
 *     sends no focus flag), which is what flipped the strip through every
 *     tab on each listing.
 *   - New tabs (browser.Context.openTab, TabManager.addTab) open in the
 *     background, in the folder.
 * A workspace, not a lock: a tab's handle still reaches it.
 *
 * Installed by KoiAgents.sys.mjs, never when Koi was launched for
 * automation. koi-agents.js draws the folder's chip, menu and live dot. */

import { BrowserWindowTracker } from "resource:///modules/BrowserWindowTracker.sys.mjs";
import { PrivateBrowsingUtils } from "resource://gre/modules/PrivateBrowsingUtils.sys.mjs";
import { TabManager } from "chrome://remote/content/shared/TabManager.sys.mjs";
import { windowManager } from "chrome://remote/content/shared/WindowManager.sys.mjs";
import { browser } from "chrome://remote/content/marionette/browser.sys.mjs";

const ATTR = "koi-agent";

export const KoiAgentTabs = {
  /**
   * The window's agent folder, if it has one.
   *
   * @param {ChromeWindow} win
   * @returns {MozTabbrowserTabGroup|undefined}
   */
  group(win) {
    return win.gBrowser?.getAllTabGroups().find(g => g.hasAttribute(ATTR));
  },

  /** @param {MozTabbrowserTab} [tab] */
  is(tab) {
    return !!tab?.group?.hasAttribute(ATTR);
  },

  /**
   * Shares a tab with the agent (moves it into the folder, making the folder
   * if the window has none), or takes it back.
   *
   * @param {MozTabbrowserTab} tab
   * @param {boolean} [on]
   */
  share(tab, on = true) {
    const { gBrowser } = tab.documentGlobal;
    const group = this.group(tab.documentGlobal);
    if (on) {
      // A pinned tab cannot be grouped (Tabbrowser.sys.mjs).
      if (tab.pinned) {
        gBrowser.unpinTab(tab);
      }
      if (group) {
        gBrowser.moveTabToExistingGroup(tab, group);
      } else {
        gBrowser
          .addTabGroup([tab], { label: "Agent", color: "blue" })
          .setAttribute(ATTR, "");
      }
    } else if (this.is(tab)) {
      gBrowser.ungroupTab(tab);
    }
  },

  /** The agent's tabs, across windows; one being closed is already gone. */
  get all() {
    return windowManager.windows.flatMap(
      win => this.group(win)?.tabs.filter(tab => !tab.closing) ?? []
    );
  },

  /**
   * Opens an agent tab in a window's folder, in the background. Never in a
   * private window: the frontmost normal one takes it.
   *
   * @param {ChromeWindow} win
   */
  open(win) {
    if (PrivateBrowsingUtils.isWindowPrivate(win)) {
      win = BrowserWindowTracker.getTopWindow({ private: false });
      if (!win) {
        throw new Error("No window to open an agent tab in");
      }
    }
    const tab = win.gBrowser.addTab("about:blank", {
      skipAnimation: true,
      relatedToCurrent: false,
      tabGroup: this.group(win),
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    if (!tab.group) {
      this.share(tab);
    }
    return tab;
  },

  closeAll() {
    return Promise.all(this.all.map(tab => TabManager.removeTab(tab)));
  },

  /** Lets every agent folder go: an ordinary folder from here on. */
  release() {
    for (const win of windowManager.windows) {
      const group = this.group(win);
      group?.removeAttribute(ATTR);
      group?.removeAttribute("koi-live");
    }
  },

  install() {
    Object.defineProperty(TabManager, "allTabs", { get: () => this.all });

    const { addTab } = TabManager;
    TabManager.addTab = async function (options) {
      const tab = await addTab.call(this, options);
      if (!KoiAgentTabs.is(tab)) {
        KoiAgentTabs.share(tab);
      }
      return tab;
    };
    TabManager.selectTab = async () => {};

    const { prototype } = browser.Context;
    const { switchToTab } = prototype;
    prototype.switchToTab = function (index, window = this.window) {
      if (index === undefined && TabManager.getTabBrowser(window)?.tabs) {
        const tab =
          KoiAgentTabs.group(window)?.tabs[0] ?? KoiAgentTabs.open(window);
        window = tab.documentGlobal;
        index = TabManager.getTabsForWindow(window).indexOf(tab);
      }
      return switchToTab.call(this, index, window, false);
    };
    prototype.openTab = async function () {
      return KoiAgentTabs.open(this.window);
    };
    prototype.focusWindow = async () => {};
  },
};
