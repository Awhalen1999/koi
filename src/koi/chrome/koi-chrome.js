/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Chrome layout that CSS cannot do alone: CustomizableUI placements, and
 * keeping the address pill centred on the window.
 *
 * Placements persist in the profile, so they are enforced in every window:
 * back, forward and reload lead the tab row, and + follows the tabs. The
 * moves are global and checked first, so later windows change nothing.
 * Customize mode is locked out (koi-chrome.css hides its entry points, this
 * disables the command), so the layout changes only with a Koi build. */

/* Browser-window global (koi/ is outside eslint.config.mjs's browser-window
 * paths). */
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

      // Every customize-mode entry point runs or observes this command, and
      // nothing in Firefox re-enables it.
      document
        .getElementById("cmd_CustomizeToolbars")
        ?.setAttribute("disabled", "true");

      // Back and forward ship removable="false", and CustomizableUI evicts a
      // non-removable widget from any area its markup does not place it in
      // (to the end of nav-bar). It reads the live attribute, so the flip
      // must land before this window's toolbars are built. Since 157 Firefox
      // builds them in its own window DOMContentLoaded listener
      // (browser-main.js), added before this one, hence the capture phase: a
      // window capture listener runs before any bubble listener.
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

      // The + sits inside the strip only while new-tab-button is the
      // placement right after tabbrowser-tabs (tabs.js
      // _updateNewTabVisibility); anything between them sends it to the
      // toolbar's end. Pinned relative to the tabs, so a migration inserting
      // into the area cannot shift it.
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

      // Once seated, the flip is reversed: eviction only applies outside the
      // area, and non-removable disables "Remove from Toolbar" for them
      // (ToolbarContextMenu.sys.mjs).
      const pin = () => {
        for (const id of fixed) {
          document.getElementById(id)?.setAttribute("removable", "false");
        }
      };
      if (document.getElementById("back-button")?.closest("#TabsToolbar")) {
        pin(); // Already built, and seated by the move above.
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

  // Centres the address pill on the window, not between the clusters: the
  // narrower side's spring starts as wide as the difference
  // (--koi-nav-lead / --koi-nav-trail, applied in koi-chrome.css) and the
  // springs split the rest. Out of room, the springs shrink first and the
  // pill keeps Firefox's floor (--urlbar-container-min-width). Bubble phase,
  // after Firefox's own listener has built the springs.
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
