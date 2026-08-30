/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Loaded into browser.xhtml, so the browser-window globals are real; the
 * koi/ tree sits outside eslint.config.mjs's browser-window path list, so
 * they are declared here instead. */
/* global gBrowser, PageThumbs */

/* The board (⇧⌘E) and peek (⌘E) — every tab as a card.
 *
 * One surface, two densities: peek is a single row of cards over a light
 * scrim, the board is the full grid over the heavy one. Same cards, same
 * keys, same data — the mode attribute only changes the layout
 * (koi-board.css). ⌘E reclaims Firefox's find-selection binding, by design.
 * (A bookmarks mode existed briefly and was withdrawn: a flat grid loses
 * bookmark folders, and a surface that hides structure is worse than none.
 * It can return once folders have a design.)
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

      // null when closed, else "peek" | "board".
      let openMode = null;

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

        // The audio badge: shown while the tab plays or is muted, click
        // toggles — the tab strip's speaker, carried onto the card.
        const audio = el("button", "koi-card-audio");
        const syncAudio = () => {
          audio.classList.toggle("playing", tab.hasAttribute("soundplaying"));
          audio.classList.toggle("muted", tab.hasAttribute("muted"));
          audio.setAttribute(
            "aria-label",
            tab.hasAttribute("muted") ? "Unmute tab" : "Mute tab"
          );
        };
        syncAudio();
        card.koiSyncAudio = syncAudio;
        audio.addEventListener("click", () => tab.toggleMuteAudio());
        header.append(icon, label, audio, close);

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
          if (event.target === audio) {
            return; // The badge's own listener toggles mute.
          }
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

      // Audio starting, stopping or muting while the surface shows.
      const onTabAttrModified = event => {
        const changed = event.detail.changed;
        if (!changed.includes("soundplaying") && !changed.includes("muted")) {
          return;
        }
        for (const card of grid.children) {
          if (card.koiTab === event.target) {
            card.koiSyncAudio?.();
            break;
          }
        }
      };

      const openSurface = mode => {
        if (openMode === mode) {
          closeSurface();
          return;
        }
        if (!openMode) {
          grid.replaceChildren(...gBrowser.visibleTabs.map(cardFor));
          gBrowser.tabContainer.addEventListener("TabClose", onTabClose);
          gBrowser.tabContainer.addEventListener("TabSelect", onTabSelect);
          gBrowser.tabContainer.addEventListener(
            "TabAttrModified",
            onTabAttrModified
          );
        }
        openMode = mode;
        surface.setAttribute("mode", mode);
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
        gBrowser.tabContainer.removeEventListener(
          "TabAttrModified",
          onTabAttrModified
        );
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

      // The board button: the strip's leading control, the mock's 2×2
      // squares, opening exactly what ⇧⌘E opens. skipintoolbarset keeps
      // CustomizableUI's area rebuilds off a node it does not manage;
      // koi-chrome.css seats it and hides the stock all-tabs chevron it
      // replaces.
      const boardButton = document.createXULElement("toolbarbutton");
      boardButton.id = "koi-board-button";
      boardButton.className = "toolbarbutton-1 chromeclass-toolbar-additional";
      boardButton.setAttribute("skipintoolbarset", "true");
      boardButton.setAttribute(
        "image",
        "chrome://browser/content/koi-common/koi-board.svg"
      );
      boardButton.setAttribute("tooltiptext", "Board (⇧⌘E)");
      boardButton.addEventListener("command", () => openSurface("board"));
      gBrowser.tabContainer.before(boardButton);
    },
    { once: true }
  );
})();
