/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser-window globals (koi/ is outside eslint.config.mjs's browser-window
 * paths). */
/* global gBrowser, openTrustedLinkIn, PrivateBrowsingUtils,
   isBlankPageURL, BrowserUIUtils */

/* The empty state: chrome, not a page, shown over the page card while the
 * selected tab shows nothing.
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

      // The card: mark, the ⌘L line and the pins.
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

      const pins = el("div", "koi-empty-pins");

      card.append(mark, line, pins);
      tabbox.append(card);

      // Pins are the bookmarks toolbar folder's direct children (where the
      // star saves), capped; the rest is ⌘L's. fetch({ parentGuid }) is one
      // query over direct children (Bookmarks.sys.mjs), where
      // promiseBookmarksTree would walk every subfolder on every new tab.
      // Refetched on every reveal. A pin is a chip: the favicon and the
      // bookmark's name, or the host for one saved without a name. page-icon:
      // serves Firefox's globe for a site with no favicon in Places.
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

        if (generation !== revealGeneration) {
          // A newer reveal is already rebuilding the rows.
          return;
        }

        pins.replaceChildren(
          ...items.map(item => {
            const pin = el("button", "koi-empty-pin");
            const name = item.title?.trim() || hostOf(item.uri);
            // The name may be cut short; the tooltip has it whole, and the
            // address.
            pin.setAttribute("tooltiptext", `${name}\n${item.uri}`);
            const icon = el("img", "koi-empty-pin-icon");
            icon.src = "page-icon:" + item.uri;
            icon.alt = "";
            const label = el("span", "koi-empty-pin-name");
            label.textContent = name;
            pin.append(icon, label);
            pin.addEventListener("click", event => {
              openTrustedLinkIn(
                item.uri,
                event.metaKey || event.ctrlKey ? "tab" : "current"
              );
            });
            return pin;
          })
        );
        // Now that they are laid out: which names are cut short, for the
        // fade (koi-newtab.css). A chip's width does not follow the window,
        // so once is enough.
        for (const label of pins.querySelectorAll(".koi-empty-pin-name")) {
          label.toggleAttribute(
            "textoverflow",
            label.scrollWidth > label.clientWidth
          );
        }
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
