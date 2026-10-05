/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser-window globals (koi/ is outside eslint.config.mjs's browser-window
 * paths). */
/* global gBrowser, openTrustedLinkIn, PrivateBrowsingUtils,
   isBlankPageURL, BrowserUIUtils */

/* The empty state: chrome, not a page, shown
 * over the page card while the selected tab shows nothing. The wallpaper
 * shows through because this script makes that tab's browser transparent
 * and koi-newtab.css clears the page ground while [koi-empty] is set. Only
 * the empty tab is transparent, as in Zen: the
 * browser.tabs.allow_transparent_browser pref would make every tab so, and a
 * page with no background of its own would lose its white canvas.
 *
 * Owns [koi-empty] on :root and the #koi-empty-state subtree; the look is
 * koi-newtab.css. */

(() => {
  addEventListener(
    "DOMContentLoaded",
    () => {
      // None in chromeless windows, nor in private ones: their new tabs are
      // about:privatebrowsing, Koi's private page (src/koi/about/).
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

      // The card: mark, the ⌘L line, pins, and a label showing the hovered
      // pin's host.
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
          return (new URL(uri).host || uri).replace(/^www\./, "");
        } catch {
          return uri;
        }
      };

      // A stable colour per site: the www-less host hashed into the tile
      // palette (koi-newtab.css).
      const tileOf = uri => {
        let hash = 0;
        for (const ch of hostOf(uri)) {
          hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
        }
        return "koi-tile-" + (hash % 6);
      };

      const pins = el("div", "koi-empty-pins");
      const pinLabel = el("div", "koi-empty-pin-label");

      card.append(mark, line, pins, pinLabel);
      tabbox.append(card);

      // Pins are the bookmarks toolbar folder's direct children (where the
      // star saves), capped; the rest is ⌘L's. fetch({ parentGuid }) is one
      // query over direct children (Bookmarks.sys.mjs), where
      // promiseBookmarksTree would walk every subfolder on every new tab.
      // Refetched on every reveal. A site with no favicon in Places gets a
      // letter tile.
      let revealGeneration = 0;
      async function refreshPins() {
        const generation = ++revealGeneration;
        let items = [];
        try {
          // fetch resolves to its first match; the callback sees them all.
          const children = [];
          await PlacesUtils.bookmarks.fetch(
            { parentGuid: PlacesUtils.bookmarks.toolbarGuid },
            child => children.push(child)
          );
          items = children
            // Folders and separators have no url; place: queries are not sites.
            .filter(child => child.url && child.url.protocol !== "place:")
            .slice(0, 24)
            .map(child => ({ uri: child.url.href, title: child.title }));
        } catch {
          // Places not ready (first run): an empty row is fine.
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
            // No favicon: the site's initial on its hashed colour.
            const name = (item.title || "").trim() || hostOf(item.uri);
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
          // The label follows the hovered or focused pin; leaving clears it
          // only if it is still this pin's.
          const host = hostOf(item.uri);
          const show = () => {
            pinLabel.textContent = host;
          };
          const clear = () => {
            if (pinLabel.textContent === host) {
              pinLabel.textContent = "";
            }
          };
          pin.addEventListener("mouseenter", show);
          pin.addEventListener("focus", show);
          pin.addEventListener("mouseleave", clear);
          pin.addEventListener("blur", clear);
          pins.append(pin);
        });
      }

      // Not tab.isEmpty, which also requires no session history, so a tab
      // navigated to about:newtab would show no card. This is the narrower
      // "shows nothing", the test browser.js uses in onLocationChange for the
      // Reload button. checkEmptyPageOrigin stops a page that navigates itself
      // to about:blank (it keeps the site's principal) from summoning the
      // pins. about:home is excluded: it loads the activity stream
      // (AboutNewTabRedirector).
      const showsNothing = tab => {
        const browser = tab.linkedBrowser;
        const url = browser.currentURI.spec;
        return (
          !tab.hasAttribute("busy") &&
          isBlankPageURL(url) &&
          url !== "about:home" &&
          BrowserUIUtils.checkEmptyPageOrigin(browser)
        );
      };

      const update = () => {
        const tab = gBrowser.selectedTab;
        const empty = showsNothing(tab);
        const was = document.documentElement.hasAttribute("koi-empty");
        document.documentElement.toggleAttribute("koi-empty", empty);
        // Read live (XULFrameElement). Tabbrowser resets it on every
        // navigation, before it calls the progress listener below, so this
        // runs last.
        tab.linkedBrowser.toggleAttribute("transparent", empty);
        if (empty && !was) {
          refreshPins();
        }
      };

      gBrowser.tabContainer.addEventListener("TabSelect", update);
      // A settled about:blank sends no more progress events, but every busy
      // change dispatches TabAttrModified.
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
