/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Loaded into browser.xhtml, so the browser-window globals are real; the
 * koi/ tree sits outside eslint.config.mjs's browser-window path list, so
 * they are declared here instead. */
/* global gBrowser, openTrustedLinkIn, PrivateBrowsingUtils */

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
      // Popups and other chromeless windows have no empty state. Neither
      // do private windows: their blank tab is about:privatebrowsing, a
      // page that paints its own UI (the overlay double-exposed over it),
      // and a private window is no place for the bookmark grid anyway.
      // Owning the private empty state is a designed round, deferred.
      if (
        !window.toolbar.visible ||
        window.PrivateBrowsingUtils?.isWindowPrivate(window)
      ) {
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
      chip.textContent = "⌘L";
      const before = el("span");
      before.textContent = "Press";
      const after = el("span");
      after.textContent = "to go anywhere";
      line.append(before, chip, after);

      const hostOf = uri => {
        try {
          return new URL(uri).host || uri;
        } catch {
          return uri;
        }
      };

      // Stable per-site colour: hash the www-less host into the small tile
      // palette (koi-newtab.css), so a site keeps its colour forever.
      const tileOf = uri => {
        const host = hostOf(uri).replace(/^www\./, "");
        let hash = 0;
        for (const ch of host) {
          hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
        }
        return "koi-tile-" + (hash % 6);
      };

      const pins = el("div", "koi-empty-pins");
      const pinLabel = el("div", "koi-empty-pin-label");

      card.append(mark, line, pins, pinLabel);
      tabbox.append(card);

      // The pins are the toolbar folder's bookmarks — the folder the star
      // saves to, and the set the user curated to see — capped so the card
      // never becomes a wall; the long tail belongs to ⌘L. Favicons via
      // page-icon: when Places has one; a site without one becomes the
      // spec's letter tile. Refetched on every reveal.
      let revealGeneration = 0;
      async function refreshPins() {
        const generation = ++revealGeneration;
        let items = [];
        try {
          const tree = await PlacesUtils.promiseBookmarksTree(
            PlacesUtils.bookmarks.toolbarGuid
          );
          items = (tree.children ?? [])
            .filter(child => child.uri && !child.uri.startsWith("place:"))
            .slice(0, 24);
        } catch {
          // No Places yet (first run mid-init): an empty row is fine.
        }

        const icons = await Promise.all(
          items.map(item =>
            PlacesUtils.favicons
              .getFaviconForPage(Services.io.newURI(item.uri))
              .catch(() => null)
          )
        );
        if (generation !== revealGeneration) {
          // A newer reveal is already rebuilding the row.
          return;
        }

        pins.replaceChildren();
        pinLabel.textContent = "";
        items.forEach((item, i) => {
          const pin = el("button", "koi-empty-pin");
          pin.setAttribute("aria-label", item.title || item.uri);
          if (icons[i]) {
            const icon = el("img", "koi-empty-pin-icon");
            icon.src = "page-icon:" + item.uri;
            icon.alt = "";
            pin.append(icon);
          } else {
            // No favicon: the letter tile — the site's initial on its
            // hashed colour.
            const host = hostOf(item.uri).replace(/^www\./, "");
            const name = (item.title || "").trim() || host;
            pin.classList.add(tileOf(item.uri));
            const letter = el("span", "koi-empty-pin-letter");
            letter.textContent = name ? name[0].toUpperCase() : "•";
            pin.append(letter);
          }
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
        });
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
