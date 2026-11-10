/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Chrome layout that CSS cannot do alone: CustomizableUI placements, the
 * menu button's row, and keeping the address pill centred on the window.
 *
 * Placements persist in the profile, so they are enforced in every window:
 * back, forward and reload lead the toolbar, + follows the tabs and
 * downloads ends the tab row. The moves are global and checked first, so
 * later windows change nothing. Customize mode is locked out (koi-chrome.css
 * hides its entry points, this disables the command), so the layout changes
 * only with a Koi build. */

/* Browser-window global (koi/ is outside eslint.config.mjs's browser-window
 * paths). */
/* global RTL_UI, gURLBar, delayedStartupPromise */

(() => {
  // Bubble phase, after Firefox's own listener has built the toolbars
  // (browser-main.js). By then a profile from Koi 0.1.0, which kept back and
  // forward in the tab row, has them in the toolbar again: CustomizableUI
  // returns a non-removable widget to the toolbar its markup places it in.
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

      ["back-button", "forward-button", "stop-reload-button"].forEach(
        (id, position) => {
          const placement = CustomizableUI.getPlacementOfWidget(id);
          if (
            placement?.area !== "nav-bar" ||
            placement.position !== position
          ) {
            CustomizableUI.addWidgetToArea(id, "nav-bar", position);
          }
        }
      );

      // Downloads belong to the window, so the button ends the tab row.
      if (
        CustomizableUI.getPlacementOfWidget("downloads-button")?.area !==
        "TabsToolbar"
      ) {
        CustomizableUI.addWidgetToArea("downloads-button", "TabsToolbar");
      }

      // So does the menu. It is markup in nav-bar, not a widget, so its
      // container moves whole, to after the row's widgets.
      document
        .getElementById("TabsToolbar-customization-target")
        .after(document.getElementById("PanelUI-button"));

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
    },
    { once: true }
  );

  // Centres the address pill on the window, not between the clusters: the
  // narrower side's spring starts as wide as the difference
  // (--koi-nav-lead / --koi-nav-trail, applied in koi-chrome.css) and the
  // springs split the rest. Out of room, the springs shrink first and the
  // pill keeps Firefox's floor (--urlbar-container-min-width).
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

  // Two manners, once the window is up.
  addEventListener(
    "DOMContentLoaded",
    () => {
      if (!window.toolbar.visible) {
        return;
      }
      delayedStartupPromise.then(() => {
        // A load that turns into a download leaves its address in the field
        // (Firefox shows the address it set out for, and the page on screen
        // never changes), so the page stands under another address. The
        // field reverts to the page's as a download starts, unless the user
        // is typing in it. addView replays the downloads already listed,
        // which are not starting; the view goes with the window.
        const { Downloads } = ChromeUtils.importESModule(
          "resource://gre/modules/Downloads.sys.mjs"
        );
        let listening = false;
        const view = {
          onDownloadAdded() {
            if (listening && !gURLBar.focused) {
              gURLBar.handleRevert();
            }
          },
        };
        Downloads.getList(Downloads.ALL).then(list => {
          list.addView(view);
          listening = true;
          addEventListener("unload", () => list.removeView(view), {
            once: true,
          });
        });

        // The tab menu loses what needs sync or containers, and the
        // housekeeping items. Firefox resets some of these on every open, in
        // its own popupshowing handler, which runs first.
        const menu = document.getElementById("tabContextMenu");
        menu.addEventListener("popupshowing", event => {
          if (event.target != menu) {
            return;
          }
          for (const id of [
            "context_sendTabToDevice",
            "context_sendTabToDeviceSeparator",
            "context_reopenInContainer",
            "context_unloadTab",
            "context_selectAllTabs",
          ]) {
            document.getElementById(id).hidden = true;
          }
        });
      });
    },
    { once: true }
  );
})();
