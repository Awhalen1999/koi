/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Chrome furniture that CSS cannot move — CustomizableUI placements.
 *
 * Back, forward and reload live in the page's row, leading it (their order
 * is koi-chrome.css's). Placements persist in the profile, so this is
 * enforcement, not decoration: Koi's layout is opinionated and customize
 * mode is not a supported surface. Runs per window; the moves are global
 * and checked first, so every window after the first is a no-op. */

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

      // Back and forward ship removable="false", and CustomizableUI's
      // window build evicts a non-removable widget from any area its markup
      // does not put it in — a placement alone gets silently reverted.
      // Removability is read from the live attribute, so flip it before
      // this window builds its toolbars (DOMContentLoaded runs ahead of
      // gBrowserInit). Per window, deliberately.
      for (const id of ["back-button", "forward-button"]) {
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
    },
    { once: true }
  );
})();
