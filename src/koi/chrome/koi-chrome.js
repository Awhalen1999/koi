/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Chrome furniture that CSS cannot do alone: CustomizableUI placements, and
 * the measurement that keeps the address pill centred on the window.
 *
 * Back, forward and reload live in the page's row, leading it (their order
 * is koi-chrome.css's). Placements persist in the profile, so this is
 * enforcement, not decoration: Koi's layout is opinionated, and customize
 * mode is not a surface — koi-chrome.css hides every way in and this file
 * disables the command behind them, so the layout changes with the next
 * Koi build and nothing else. Runs per window; the moves are global and
 * checked first, so every window after the first is a no-op. */

/* RTL_UI is a browser-window global (browser.js); the koi/ tree sits outside
 * eslint.config.mjs's browser-window path list. */
/* global RTL_UI */

(() => {
  addEventListener(
    "DOMContentLoaded",
    () => {
      if (!window.toolbar.visible) {
        return;
      }
      const { CustomizableUI } = ChromeUtils.importESModule(
        "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs"
      );

      // Every entry to customize mode — the app menu, View ▸ Toolbars, the
      // toolbar and panel context menus, the overflow panel — runs or
      // observes this one command. Nothing in Firefox re-enables it.
      document
        .getElementById("cmd_CustomizeToolbars")
        ?.setAttribute("disabled", "true");

      // Back and forward ship removable="false", and CustomizableUI's
      // window build evicts a non-removable widget from any area its markup
      // does not put it in — a placement alone gets silently reverted, and
      // the widget lands at the end of nav-bar. Removability is read from
      // the live attribute, so flip it before this window builds its
      // toolbars. Since 157 Firefox builds them from its own DOMContentLoaded
      // handler on the window (browser-main.js), registered ahead of this
      // script's, which is why this listener runs in the capture phase: a
      // window capture listener fires before any bubble listener on the
      // window, whatever order they were added. Per window, deliberately.
      const fixed = ["back-button", "forward-button"];
      for (const id of fixed) {
        document.getElementById(id)?.setAttribute("removable", "true");
      }

      ["back-button", "forward-button", "stop-reload-button"].forEach(
        (id, position) => {
          const placement = CustomizableUI.getPlacementOfWidget(id);
          if (
            placement?.area !== "TabsToolbar" ||
            placement.position !== position
          ) {
            CustomizableUI.addWidgetToArea(id, "TabsToolbar", position);
          }
        }
      );

      // The + rides inside the strip only while new-tab-button is the next
      // placement after tabbrowser-tabs (tabs.js _updateNewTabVisibility);
      // anything between them — a migration's insert, a stray move — sends
      // it to the toolbar's far end. Pinned relative to the tabs, not to an
      // index, so a migration prepending to the area cannot shift it.
      const tabs = CustomizableUI.getPlacementOfWidget("tabbrowser-tabs");
      const plus = CustomizableUI.getPlacementOfWidget("new-tab-button");
      if (
        tabs?.area === "TabsToolbar" &&
        (plus?.area !== "TabsToolbar" || plus.position !== tabs.position + 1)
      ) {
        CustomizableUI.addWidgetToArea(
          "new-tab-button",
          "TabsToolbar",
          tabs.position + 1
        );
      }

      // Once the two are seated in this window's tab row, the flip is
      // reversed. The eviction only ever fires on a non-removable widget
      // whose node is *outside* its area, so in place they are as fixed as
      // Firefox ships them — and the toolbar context menu's "Remove from
      // Toolbar" disables itself for them (ToolbarContextMenu.sys.mjs),
      // where a widget left removable could have been pulled off the row.
      const pin = () => {
        for (const id of fixed) {
          document.getElementById(id)?.setAttribute("removable", "false");
        }
      };
      if (document.getElementById("back-button")?.closest("#TabsToolbar")) {
        pin(); // The row was already built; the move above seated them.
      } else {
        const listener = {
          onAreaNodeRegistered(area, node) {
            if (area === "TabsToolbar" && node.ownerGlobal === window) {
              CustomizableUI.removeListener(listener);
              pin();
            }
          },
        };
        CustomizableUI.addListener(listener);
      }
    },
    { once: true, capture: true }
  );

  // Row one centres the address pill on the window, not on the space the
  // clusters leave it: Firefox's two springs split that space evenly, so a
  // right side wider than the lights pushed the pill left. The narrower
  // side's spring starts out as wide as the difference, and the evenly split
  // remainder then centres the pill (koi-chrome.css applies the two
  // values). CSS cannot balance groups it cannot measure. When room runs
  // out the springs shrink first, the pill keeps Firefox's own floor
  // (--urlbar-container-min-width), and Firefox's overflow takes over.
  // Listening after Firefox's own DOMContentLoaded handler, which builds the
  // springs.
  addEventListener(
    "DOMContentLoaded",
    () => {
      if (!window.toolbar.visible) {
        return;
      }
      const navBar = document.getElementById("nav-bar");
      const start = rect => (RTL_UI ? -rect.right : rect.left);
      const end = rect => (RTL_UI ? -rect.left : rect.right);
      const set = (name, px) => {
        const value = `${Math.max(Math.round(px), 0)}px`;
        if (navBar.style.getPropertyValue(name) != value) {
          navBar.style.setProperty(name, value);
        }
      };

      const balance = new ResizeObserver(() => {
        const lead = navBar.querySelector(
          "toolbarspring:not(#vertical-spacer)"
        );
        const trail = navBar.querySelector("#urlbar-container ~ toolbarspring");
        if (!lead || !trail) {
          return;
        }
        // Either spring resizes whenever a side gains or loses a button.
        balance.observe(lead);
        balance.observe(trail);
        const bar = navBar.getBoundingClientRect();
        const before = start(lead.getBoundingClientRect()) - start(bar);
        const after = end(bar) - end(trail.getBoundingClientRect());
        set("--koi-nav-lead", after - before);
        set("--koi-nav-trail", before - after);
      });
      balance.observe(navBar);
    },
    { once: true }
  );
})();
