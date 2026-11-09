/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Chrome layout that CSS cannot do alone: CustomizableUI placements,
 * keeping the address pill centred on the window, and reading the colour
 * the selected tab wears off its page.
 *
 * Placements persist in the profile, so they are enforced in every window:
 * back, forward and reload lead the tab row, and + follows the tabs. The
 * moves are global and checked first, so later windows change nothing.
 * Customize mode is locked out (koi-chrome.css hides its entry points, this
 * disables the command), so the layout changes only with a Koi build. */

/* Browser-window global (koi/ is outside eslint.config.mjs's browser-window
 * paths). */
/* global RTL_UI, gURLBar, gBrowser, isBlankPageURL, delayedStartupPromise */

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
      // builds them in its own window DOMContentLoaded listener (browser-main.js),
      // added before this one, hence the capture phase: a window capture
      // listener runs before any bubble listener.
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

  // Three manners, once the window is up.
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

        // The selected tab wears its page's colour (koi-chrome.css, The
        // selected tab): the average of the page's top edge under the tab,
        // where the two join, read from a one-pixel snapshot. A blank page,
        // or one that paints nothing there, leaves the tab on the page
        // ground. Read whenever the tab or the page under it may have
        // changed, and again as the page settles.
        // ponytail: a page that repaints its top edge later than that keeps
        // the old colour until the next read; a paint listener in the page
        // if it shows.
        const wear = async tab => {
          const browser = tab.linkedBrowser;
          const page = browser.browsingContext?.currentWindowGlobal;
          const over = tab.getBoundingClientRect();
          const under = browser.getBoundingClientRect();
          const left = Math.max(over.left - under.left, 0);
          const width = Math.round(
            Math.min(over.right - under.left, under.width) - left
          );
          let rgb = null;
          if (page && width > 0 && !isBlankPageURL(browser.currentURI.spec)) {
            try {
              const strip = await page.drawSnapshot(
                new DOMRect(left, 0, width, 1),
                1,
                "transparent"
              );
              const context = new OffscreenCanvas(width, 1).getContext("2d");
              context.drawImage(strip, 0, 0);
              strip.close();
              const { data } = context.getImageData(0, 0, width, 1);
              const sum = [0, 0, 0];
              let painted = 0;
              for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] == 255) {
                  painted++;
                  sum[0] += data[i];
                  sum[1] += data[i + 1];
                  sum[2] += data[i + 2];
                }
              }
              rgb = painted && sum.map(part => Math.round(part / painted));
            } catch {
              // The page went away mid-read; the next read has the new one.
              return;
            }
          }
          if (!rgb) {
            tab.style.removeProperty("--koi-tab-color");
            tab.style.removeProperty("--koi-tab-ink");
            return;
          }
          // Perceived brightness (Rec. 601) picks the ink.
          const light = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] > 150;
          tab.style.setProperty("--koi-tab-color", `rgb(${rgb})`);
          tab.style.setProperty(
            "--koi-tab-ink",
            light ? "var(--koi-solid)" : "var(--koi-solid-light)"
          );
        };
        let reads = [];
        const settle = () => {
          reads.forEach(clearTimeout);
          reads = [0, 300, 1000, 3000].map(ms =>
            setTimeout(() => wear(gBrowser.selectedTab), ms)
          );
        };
        for (const moved of ["TabSelect", "TabMove", "TabOpen", "TabClose"]) {
          gBrowser.tabContainer.addEventListener(moved, settle);
        }
        addEventListener("resize", settle);
        gBrowser.addProgressListener({
          onLocationChange: settle,
          onStateChange(progress, request, flags) {
            if (flags & Ci.nsIWebProgressListener.STATE_STOP) {
              settle();
            }
          },
        });
        settle();

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
