/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The one-line chrome: tabs and the address share one 40px row.
 *
 * Firefox already knows how to run nav-bar as the titlebar — it carries its
 * own traffic-light buttonbox and spacers, normally shown only when vertical
 * tabs hide the tab strip (#navigator-toolbox[tabs-hidden]). And the tab strip
 * is built to be relocated: vertical-tabs mode reparents #tabbrowser-tabs into
 * the sidebar via CustomizableUI and everything keeps working, because
 * gBrowser.tabContainer is a reference to the element, not to its address.
 *
 * So the entire JS cost of the v5 shell is the two moves below. Everything
 * else — hiding TabsToolbar, revealing nav-bar's buttonbox, the 40px row —
 * is koi-chrome.css, keyed off the [koi-onerow] attribute this script sets,
 * so a window where the move did not happen keeps stock layout instead of
 * losing its tabs.
 *
 * Not CustomizableUI.addWidgetToArea: placements persist into the profile and
 * TabsToolbar's placement-repair logic fights a saved state that has no
 * tabbrowser-tabs in it. A plain DOM move owns nothing and survives updates.
 */

(() => {
  addEventListener(
    "DOMContentLoaded",
    () => {
      // Popups and other chromeless windows keep Firefox's layout.
      if (!window.toolbar.visible) {
        return;
      }

      const urlbarContainer = document.getElementById("urlbar-container");
      const tabs = document.getElementById("tabbrowser-tabs");
      const newTabButton = document.getElementById("new-tab-button");
      if (!urlbarContainer || !tabs) {
        return;
      }

      urlbarContainer.after(tabs);
      if (newTabButton) {
        tabs.after(newTabButton);
        // tabs.js computes this from siblings on customization events only;
        // the move above is invisible to it, so state the truth directly.
        // (Adjacent + not overflowing = the + button rides inside the strip,
        // right after the last tab, which is exactly the v5 placement.)
        tabs.toggleAttribute("hasadjacentnewtabbutton", true);
      }

      document.documentElement.toggleAttribute("koi-onerow", true);
    },
    { once: true }
  );
})();
