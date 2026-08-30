/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Loaded into browser.xhtml, so the browser-window globals are real; the
 * koi/ tree sits outside eslint.config.mjs's browser-window path list, so
 * they are declared here instead. */
/* global gBrowser, PageThumbs, openTrustedLinkIn */

/* The board (⇧⌘E), peek (⌘E), and the bookmarks board — cards for
 * everything.
 *
 * One surface, three modes: peek is a single row of tab cards over a light
 * scrim, the board is the full tab grid over the heavy one, and bookmarks
 * is the same grid fed from Places instead of gBrowser (opened by the
 * top-bar bookmarks button). The mode attribute carries layout AND source;
 * the cards are the shared component. ⌘E reclaims Firefox's find-selection
 * binding, by design.
 *
 * Like the empty state, this is chrome in #tabbrowser-tabbox: one subtree,
 * one attribute, no DOM moves, no patches. Cards are rebuilt fresh on every
 * open and the tab listeners exist only while the surface shows — there is
 * no cache to go stale. Thumbnails ride Firefox's own tab-preview capture
 * (PageThumbs.captureTabPreviewThumbnail); a tab with nothing to show —
 * pending, blank, or capture-refused — keeps the quiet glass fallback. */

(() => {
  addEventListener(
    "DOMContentLoaded",
    () => {
      // Popups and other chromeless windows have no board.
      if (!window.toolbar.visible || !window.gBrowser) {
        return;
      }

      const tabbox = document.getElementById("tabbrowser-tabbox");
      if (!tabbox) {
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

      const surface = el("div");
      surface.id = "koi-board";
      const grid = el("div", "koi-board-grid");
      surface.append(grid);
      tabbox.append(surface);

      // null when closed, else "peek" | "board" | "bookmarks". Peek and
      // board show tabs; bookmarks shows Places. The mode is both layout
      // and source; sourceOf names the half that decides what cards hold.
      let openMode = null;
      const sourceOf = mode => (mode === "bookmarks" ? "bookmarks" : "tabs");

      // The thumbnail backing store matches the largest card the CSS draws,
      // so board cards stay sharp and peek cards downscale.
      const THUMB_W = 320;
      const THUMB_H = 200;

      const cardFor = tab => {
        const card = el("div", "koi-card");
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        card.koiTab = tab;
        if (tab.selected) {
          card.classList.add("koi-card-current");
        }

        const header = el("div", "koi-card-header");
        const icon = el("img", "koi-card-icon");
        icon.src =
          tab.image || "chrome://browser/content/koi-common/koi-mark.svg";
        icon.alt = "";
        const label = el("span", "koi-card-label");
        label.textContent = tab.label;
        const close = el("button", "koi-card-close");
        close.setAttribute("aria-label", "Close tab");
        header.append(icon, label, close);

        const thumb = el("div", "koi-card-thumb");
        card.append(header, thumb);

        const browser = tab.linkedBrowser;
        if (
          !tab.hasAttribute("pending") &&
          !tab.isEmpty &&
          browser?.browsingContext?.currentWindowGlobal
        ) {
          const canvas = el("canvas");
          canvas.width = THUMB_W * devicePixelRatio;
          canvas.height = THUMB_H * devicePixelRatio;
          PageThumbs.captureTabPreviewThumbnail(browser, canvas).then(
            () => thumb.append(canvas),
            () => {} // The glass fallback is already showing.
          );
        }

        card.addEventListener("click", event => {
          if (event.target === close) {
            gBrowser.removeTab(tab, { animate: false });
            return; // onTabClose removes the card.
          }
          gBrowser.selectedTab = tab;
          // Idempotent with the TabSelect close — selecting the
          // already-current card fires no TabSelect at all.
          closeSurface();
        });
        return card;
      };

      // A bookmark card: no live browser behind it, so the thumbnail is
      // Firefox's cached page screenshot when one exists (visited sites
      // have one; the rest keep the glass fallback) — and no ×: removal
      // belongs to the star, not a hover on a grid.
      const bookmarkCardFor = item => {
        const card = el("div", "koi-card");
        card.setAttribute("role", "button");
        card.tabIndex = 0;

        const header = el("div", "koi-card-header");
        const icon = el("img", "koi-card-icon");
        icon.src = "page-icon:" + item.uri;
        icon.alt = "";
        const label = el("span", "koi-card-label");
        label.textContent = item.title || item.uri;
        header.append(icon, label);

        const thumb = el("div", "koi-card-thumb");
        const shot = el("img", "koi-card-shot");
        shot.alt = "";
        shot.addEventListener("error", () => shot.remove());
        shot.src = PageThumbs.getThumbnailURL(item.uri);
        thumb.append(shot);
        card.append(header, thumb);

        card.addEventListener("click", event => {
          openTrustedLinkIn(item.uri, event.metaKey ? "tab" : "current");
          closeSurface();
        });
        return card;
      };

      // Every bookmark, flattened depth-first from the three roots the
      // star can reach, capped so the grid stays a grid.
      const fillBookmarkCards = async () => {
        const items = [];
        try {
          const roots = await Promise.all(
            [
              PlacesUtils.bookmarks.toolbarGuid,
              PlacesUtils.bookmarks.menuGuid,
              PlacesUtils.bookmarks.unfiledGuid,
            ].map(guid => PlacesUtils.promiseBookmarksTree(guid))
          );
          const walk = node => {
            for (const child of node.children ?? []) {
              if (child.uri && !child.uri.startsWith("place:")) {
                items.push(child);
              } else if (child.children) {
                walk(child);
              }
            }
          };
          roots.forEach(walk);
        } catch {
          // No Places yet: an empty board is fine.
        }
        if (sourceOf(openMode) !== "bookmarks") {
          return; // The surface moved on while we fetched.
        }
        grid.replaceChildren(...items.slice(0, 60).map(bookmarkCardFor));
        grid.firstChild?.focus();
      };

      const onTabClose = event => {
        for (const card of grid.children) {
          if (card.koiTab === event.target) {
            const neighbour =
              card.nextElementSibling ?? card.previousElementSibling;
            card.remove();
            neighbour?.focus();
            break;
          }
        }
        if (!grid.childElementCount) {
          closeSurface();
        }
      };

      // Any tab switch — a card click, ⌘1, an external caller — is a
      // navigate intent, and navigating dismisses the surface.
      const onTabSelect = () => closeSurface();

      const openSurface = mode => {
        if (openMode === mode) {
          closeSurface();
          return;
        }
        // Peek and board share their cards; a source change rebuilds them.
        const rebuild = sourceOf(openMode) !== sourceOf(mode) || !openMode;
        if (!openMode) {
          gBrowser.tabContainer.addEventListener("TabClose", onTabClose);
          gBrowser.tabContainer.addEventListener("TabSelect", onTabSelect);
        }
        openMode = mode;
        surface.setAttribute("mode", mode);
        if (rebuild) {
          if (sourceOf(mode) === "tabs") {
            grid.replaceChildren(...gBrowser.visibleTabs.map(cardFor));
          } else {
            grid.replaceChildren();
            fillBookmarkCards();
          }
        }
        (grid.querySelector(".koi-card-current") ?? grid.firstChild)?.focus();
      };

      const closeSurface = () => {
        if (!openMode) {
          return;
        }
        openMode = null;
        surface.removeAttribute("mode");
        grid.replaceChildren();
        gBrowser.tabContainer.removeEventListener("TabClose", onTabClose);
        gBrowser.tabContainer.removeEventListener("TabSelect", onTabSelect);
        gBrowser.selectedBrowser?.focus();
      };

      // A click on the scrim (not on a card) dismisses.
      surface.addEventListener("click", event => {
        if (event.target === surface || event.target === grid) {
          closeSurface();
        }
      });

      // Cards are role=button divs, so Enter/Space activate by hand; arrows
      // walk the cards — Left/Right linearly, Up/Down by rendered row.
      surface.addEventListener("keydown", event => {
        const cards = [...grid.children];
        const index = cards.indexOf(document.activeElement);
        if (index < 0) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          cards[index].click();
          return;
        }
        const columns =
          cards.filter(c => c.offsetTop === cards[0].offsetTop).length || 1;
        const step = {
          ArrowRight: 1,
          ArrowLeft: -1,
          ArrowDown: columns,
          ArrowUp: -columns,
        }[event.key];
        if (step) {
          event.preventDefault();
          cards[Math.min(cards.length - 1, Math.max(0, index + step))].focus();
        }
      });

      // ⌘E peek, ⇧⌘E board, Esc dismiss. Capture phase, ahead of Firefox's
      // key handling — ⌘E is find-selection upstream, reclaimed by design.
      window.addEventListener(
        "keydown",
        event => {
          if (
            event.metaKey &&
            !event.ctrlKey &&
            !event.altKey &&
            event.code === "KeyE"
          ) {
            event.preventDefault();
            event.stopPropagation();
            openSurface(event.shiftKey ? "board" : "peek");
            return;
          }
          if (openMode && event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeSurface();
          }
        },
        true
      );

      // The bookmarks button: the top bar's one bookmarks affordance,
      // opening the board fed with bookmarks. Injected beside the app-menu
      // button — outside CustomizableUI's managed placements, so customize
      // mode cannot orphan it.
      const panelUIButton = document.getElementById("PanelUI-button");
      if (panelUIButton) {
        const button = document.createXULElement("toolbarbutton");
        button.id = "koi-bookmarks-button";
        button.className = "toolbarbutton-1 chromeclass-toolbar-additional";
        button.setAttribute(
          "image",
          "chrome://browser/skin/bookmark-hollow.svg"
        );
        button.setAttribute("tooltiptext", "Bookmarks");
        button.addEventListener("command", () => openSurface("bookmarks"));
        panelUIButton.before(button);
      }

      // The strip's all-tabs chevron keeps its stock panel for now; a Koi
      // board button replaces it in a coming pass. (Intercepting its command
      // event was tried and lost — the panel opens on an earlier path.)
    },
    { once: true }
  );
})();
