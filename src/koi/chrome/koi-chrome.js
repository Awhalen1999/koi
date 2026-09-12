/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Chrome furniture that CSS cannot move — CustomizableUI placements.
 *
 * Back, forward and reload live in the page's row, leading it (their order
 * is koi-chrome.css's). Placements persist in the profile, so this is
 * enforcement, not decoration: Koi's layout is opinionated, and customize
 * mode is not a surface — koi-chrome.css hides every way in and this file
 * disables the command behind them, so the layout changes with the next
 * Koi build and nothing else. Runs per window; the moves are global and
 * checked first, so every window after the first is a no-op. */

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
      // does not put it in — a placement alone gets silently reverted.
      // Removability is read from the live attribute, so flip it before
      // this window builds its toolbars (DOMContentLoaded runs ahead of
      // gBrowserInit). Per window, deliberately.
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
    { once: true }
  );
})();
