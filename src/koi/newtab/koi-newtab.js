/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The empty state — Koi Shell v5's noTabs card.
 *
 * An empty tab is not a page, it is the absence of one, so this is chrome,
 * not content: a glass card floating on the wallpaper, built here and shown
 * whenever the selected tab has nothing to say. The wallpaper reaches it
 * because browser.tabs.allow_transparent_browser makes blank browsers paint
 * nothing and koi-newtab.css lifts the shell's backdrop while [koi-empty] is
 * set — ordinary pages never notice, they sit on .browserContainer's paint.
 *
 * This script owns one attribute, [koi-empty] on :root, and one subtree,
 * #koi-empty-state. Everything visual lives in koi-newtab.css. */

(() => {
  addEventListener(
    "DOMContentLoaded",
    () => {
      // Popups and other chromeless windows have no empty state.
      if (!window.toolbar.visible) {
        return;
      }

      const tabbox = document.getElementById("tabbrowser-tabbox");
      if (!tabbox || !window.gBrowser) {
        return;
      }

      const { PlacesUtils } = ChromeUtils.importESModule(
        "resource://gre/modules/PlacesUtils.sys.mjs"
      );

      const XHTML = "http://www.w3.org/1999/xhtml";
      const el = (tag, className) => {
        const node = document.createElementNS(XHTML, tag);
        if (className) {
          node.className = className;
        }
        return node;
      };

      // The card. Spec structure: mark, the ⌘-line, pins, then a one-line
      // label that echoes the hovered pin's host.
      const card = el("div");
      card.id = "koi-empty-state";

      const mark = el("img", "koi-empty-mark");
      mark.src = "chrome://browser/content/koi-common/koi-mark.svg";
      mark.alt = "";

      const line = el("div", "koi-empty-line");
      const chip = el("kbd", "koi-empty-key");
      chip.textContent = "⌘K";
      const before = el("span");
      before.textContent = "Press";
      const after = el("span");
      after.textContent = "to go anywhere";
      line.append(before, chip, after);

      const pins = el("div", "koi-empty-pins");
      const pinLabel = el("div", "koi-empty-pin-label");

      card.append(mark, line, pins, pinLabel);
      tabbox.append(card);

      const hostOf = uri => {
        try {
          return new URL(uri).host || uri;
        } catch {
          return uri;
        }
      };

      // The pins are the first six bookmarks on the toolbar folder, favicons
      // via page-icon: so they are real sites, not tiles pretending to be.
      // Refetched on every reveal — six bookmarks is too cheap to cache.
      async function refreshPins() {
        let items = [];
        try {
          const tree = await PlacesUtils.promiseBookmarksTree(
            PlacesUtils.bookmarks.toolbarGuid
          );
          items = (tree.children ?? [])
            .filter(child => child.uri && !child.uri.startsWith("place:"))
            .slice(0, 6);
        } catch {
          // No Places yet (first run mid-init): an empty row is fine.
        }

        pins.replaceChildren();
        pinLabel.textContent = "";
        for (const item of items) {
          const pin = el("button", "koi-empty-pin");
          pin.title = item.title || item.uri;
          const icon = el("img", "koi-empty-pin-icon");
          icon.src = "page-icon:" + item.uri;
          icon.alt = "";
          pin.append(icon);
          pin.addEventListener("click", event => {
            openTrustedLinkIn(
              item.uri,
              event.metaKey || event.ctrlKey ? "tab" : "current"
            );
          });
          pin.addEventListener("mouseenter", () => {
            pinLabel.textContent = hostOf(item.uri);
            pinLabel.classList.add("shown");
          });
          pin.addEventListener("mouseleave", () => {
            pinLabel.classList.remove("shown");
          });
          pins.append(pin);
        }
      }

      // tab.isEmpty is Firefox's own emptiness: a blank page, a clean
      // origin, and not [busy] — the busy check matters because a settled
      // about:blank emits no further progress events, while every busy flip
      // dispatches TabAttrModified, so emptiness always comes with a wake-up
      // call.
      const update = () => {
        const empty = gBrowser.selectedTab.isEmpty;
        const was = document.documentElement.hasAttribute("koi-empty");
        document.documentElement.toggleAttribute("koi-empty", empty);
        if (empty && !was) {
          refreshPins();
        }
      };

      gBrowser.tabContainer.addEventListener("TabSelect", update);
      gBrowser.tabContainer.addEventListener("TabAttrModified", event => {
        if (event.target === gBrowser.selectedTab) {
          update();
        }
      });
      gBrowser.addTabsProgressListener({
        onLocationChange(browser) {
          if (browser === gBrowser.selectedBrowser) {
            update();
          }
        },
      });
      update();
    },
    { once: true }
  );
})();
