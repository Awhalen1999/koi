/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser-window globals (koi/ is outside eslint.config.mjs's browser-window
 * paths). */
/* global gBrowser, PageThumbs, ShortcutUtils */

/* The board (⇧⌘E): every tab as a card, in a modal over the page card. Peek
 * is the same cards in one row over a lighter scrim (the mode attribute only
 * changes layout, koi-board.css); its trigger, hold-a-tab, is not built.
 *
 * Cards are built on open, kept in step with the strip while it shows, and
 * torn down on close; the tab listeners exist only while it shows.
 * Thumbnails come from Firefox's tab preview capture
 * (PageThumbs.captureTabPreviewThumbnail); a pending, blank or refused tab
 * keeps the glass fallback. Chrome inside #tabbrowser-tabbox, like the empty
 * state: no DOM moves, no patches. */

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

      const MARK = "chrome://browser/content/koi-common/koi-mark.svg";

      const surface = el("div");
      surface.id = "koi-board";
      // A modal: focus stays inside while it shows (the key and focus
      // handlers below).
      surface.setAttribute("role", "dialog");
      surface.setAttribute("aria-modal", "true");
      surface.setAttribute("aria-label", "Board");
      const grid = el("div", "koi-board-grid");
      surface.append(grid);
      tabbox.append(surface);

      // null when closed, else "peek" | "board".
      let openMode = null;

      // Thumbnails --------------------------------------------------------
      // Sized for the largest card the CSS draws (board cards stay sharp,
      // peek cards downscale), as Firefox's hover preview is
      // (tab-hover-preview.mjs).
      const THUMB_W = 320;
      const THUMB_H = 200;

      // Each capture is a paint request to a content process, so they run a
      // few at a time. Closing empties the queue, a tab closed while queued
      // is skipped, and a card dropped mid-capture is checked on resolve.
      // Not before capturing: cardFor() queues the capture before the card
      // is in the grid, so the thumb is never connected yet.
      const CAPTURES_AT_ONCE = 4;
      const captureQueue = [];
      let capturesRunning = 0;

      const pumpCaptures = () => {
        while (capturesRunning < CAPTURES_AT_ONCE && captureQueue.length) {
          const { tab, thumb } = captureQueue.shift();
          const browser = tab.linkedBrowser;
          if (!browser?.browsingContext?.currentWindowGlobal) {
            continue;
          }
          const canvas = el("canvas");
          canvas.width = THUMB_W * devicePixelRatio;
          canvas.height = THUMB_H * devicePixelRatio;
          capturesRunning++;
          PageThumbs.captureTabPreviewThumbnail(browser, canvas)
            .then(
              () => thumb.isConnected && thumb.append(canvas),
              // The glass fallback stays; log why.
              error =>
                console.warn("koi-board: thumbnail capture failed", error)
            )
            .finally(() => {
              capturesRunning--;
              pumpCaptures();
            });
        }
      };

      const requestThumbnail = (tab, thumb) => {
        if (tab.hasAttribute("pending") || tab.isEmpty) {
          return; // Nothing to capture; the glass fallback stays.
        }
        captureQueue.push({ tab, thumb });
        pumpCaptures();
      };

      // Cards -------------------------------------------------------------

      const cardFor = tab => {
        const card = el("div", "koi-card");
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        card.koiTab = tab;
        card.classList.toggle("koi-card-current", tab.selected);

        const header = el("div", "koi-card-header");
        const icon = el("img", "koi-card-icon");
        icon.alt = "";
        const label = el("span", "koi-card-label");
        const close = el("button", "koi-card-close");
        close.setAttribute("aria-label", "Close tab");

        // Shown while the tab plays or is muted; a click toggles mute, as
        // the strip's speaker does.
        const audio = el("button", "koi-card-audio");
        audio.addEventListener("click", () => tab.toggleMuteAudio());
        header.append(icon, label, audio, close);

        // Redrawn when the tab's title, favicon or audio state changes
        // (onTabAttrModified).
        const redraw = () => {
          const image = tab.image || MARK;
          if (icon.src !== image) {
            icon.src = image; // Re-setting a data: src would re-decode it.
          }
          label.textContent = tab.label;
          const muted = tab.hasAttribute("muted");
          audio.classList.toggle("playing", tab.hasAttribute("soundplaying"));
          audio.classList.toggle("muted", muted);
          audio.setAttribute("aria-label", muted ? "Unmute tab" : "Mute tab");
        };
        redraw();
        card.koiRedraw = redraw;

        const thumb = el("div", "koi-card-thumb");
        card.append(header, thumb);
        requestThumbnail(tab, thumb);

        card.addEventListener("click", event => {
          if (event.target === audio) {
            return; // The badge's own listener toggles mute.
          }
          if (event.target === close) {
            gBrowser.removeTab(tab, { animate: false });
            return; // TabClose reconciles the grid.
          }
          gBrowser.selectedTab = tab;
          // Selecting the current tab fires no TabSelect, so close here too;
          // closing twice is harmless.
          closeSurface();
        });
        return card;
      };

      const cardOf = tab =>
        [...grid.children].find(card => card.koiTab === tab);

      // The strip changed shape (a tab opened, closed, moved, hidden or
      // shown): surviving cards keep their thumbnails, new ones are built,
      // and the strip's order applies. Firefox refreshes visibleTabs before
      // dispatching each of these events.
      const reconcile = () => {
        const cards = new Map(
          [...grid.children].map(card => [card.koiTab, card])
        );
        const next = gBrowser.visibleTabs.map(
          tab => cards.get(tab) ?? cardFor(tab)
        );
        if (!next.length) {
          closeSurface();
          return;
        }
        if (
          next.length === grid.childElementCount &&
          next.every((card, i) => card === grid.children[i])
        ) {
          return;
        }
        // Re-inserting nodes drops focus: restore it, or move it to a
        // neighbour if the focused card went.
        const active = document.activeElement;
        const focusedCard = active?.closest(".koi-card");
        let neighbour = null;
        if (focusedCard && !next.includes(focusedCard)) {
          const index = [...grid.children].indexOf(focusedCard);
          neighbour = grid.children[index + 1] ?? grid.children[index - 1];
        }
        grid.replaceChildren(...next);
        if (neighbour?.isConnected) {
          neighbour.focus();
        } else if (surface.contains(active)) {
          active.focus();
        }
      };

      // Selection changes close the surface, so only these need redrawing.
      const REDRAWN = ["label", "image", "soundplaying", "muted"];
      const onTabAttrModified = event => {
        if (event.detail.changed.some(attr => REDRAWN.includes(attr))) {
          cardOf(event.target)?.koiRedraw();
        }
      };

      // Any tab switch (a card, ⌘1, another caller) dismisses the surface.
      const onTabSelect = () => closeSurface();

      // Bound only while the surface shows.
      const tabListeners = [
        ["TabOpen", reconcile],
        ["TabClose", reconcile],
        ["TabMove", reconcile],
        ["TabHide", reconcile],
        ["TabShow", reconcile],
        ["TabSelect", onTabSelect],
        ["TabAttrModified", onTabAttrModified],
      ];

      const openSurface = mode => {
        if (openMode === mode) {
          closeSurface();
          return;
        }
        if (!openMode) {
          grid.replaceChildren(...gBrowser.visibleTabs.map(cardFor));
          for (const [type, listener] of tabListeners) {
            gBrowser.tabContainer.addEventListener(type, listener);
          }
        }
        openMode = mode;
        surface.setAttribute("mode", mode);
        (
          grid.querySelector(".koi-card-current") ?? grid.firstElementChild
        )?.focus();
      };

      // Focus returns to the page on close, unless the user moved it
      // elsewhere (the focusout handler).
      const closeSurface = ({ restoreFocus = true } = {}) => {
        if (!openMode) {
          return;
        }
        openMode = null;
        surface.removeAttribute("mode");
        grid.replaceChildren();
        captureQueue.length = 0;
        for (const [type, listener] of tabListeners) {
          gBrowser.tabContainer.removeEventListener(type, listener);
        }
        if (restoreFocus) {
          gBrowser.selectedBrowser?.focus();
        }
      };

      // A click on the scrim (not on a card) dismisses.
      surface.addEventListener("click", event => {
        if (event.target === surface || event.target === grid) {
          closeSurface();
        }
      });

      // Focus moving somewhere real (the address field, the findbar)
      // dismisses and stays there. XUL chrome is -moz-user-focus: ignore, so
      // clicking a toolbar button never blurs a card, and a window blur has
      // no relatedTarget.
      surface.addEventListener("focusout", event => {
        if (
          openMode &&
          event.relatedTarget &&
          !surface.contains(event.relatedTarget)
        ) {
          closeSurface({ restoreFocus: false });
        }
      });

      // Cards are role=button divs, so Enter and Space activate them by hand.
      // Arrows move between cards (up and down by rendered row), Tab cycles
      // within the surface, Escape closes. Handled here, not on the window,
      // because focus is always inside while it is open.
      surface.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeSurface();
          return;
        }
        if (event.key === "Tab") {
          // Wrap at either end; Firefox handles the steps between.
          const stops = [
            ...surface.querySelectorAll(".koi-card, .koi-card button"),
          ].filter(node => node.offsetParent);
          const active = document.activeElement;
          if (event.shiftKey && active === stops[0]) {
            event.preventDefault();
            stops.at(-1).focus();
          } else if (!event.shiftKey && active === stops.at(-1)) {
            event.preventDefault();
            stops[0].focus();
          }
          return;
        }
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

      // A XUL <key> in Koi's own keyset, as WebExtensions add theirs
      // (ExtensionShortcuts.sys.mjs), leaving Firefox's mainKeyset alone. Not
      // `reserved`: the page sees the keystroke first unless the user denied
      // the site shortcut overrides. ⇧⌘E is free in Firefox and macOS, and a
      // letter on purpose: on macOS Firefox maps ⌘{ and ⌘} to tab switching
      // by charCode (ShortcutUtils.getSystemActionForEvent), and ⇧⌘ with
      // punctuation varies by keyboard layout (⇧⌘\ was taken as previous-tab).
      const key = document.createXULElement("key");
      key.id = "key_koiBoard";
      key.setAttribute("key", "E");
      key.setAttribute("modifiers", "accel,shift");
      key.addEventListener("command", () => openSurface("board"));
      const keyset = document.createXULElement("keyset");
      keyset.append(key);
      document.documentElement.append(keyset);

      // The tab row's leading button. skipintoolbarset keeps CustomizableUI
      // from managing it; koi-chrome.css places it.
      const boardButton = document.createXULElement("toolbarbutton");
      boardButton.id = "koi-board-button";
      boardButton.className = "toolbarbutton-1 chromeclass-toolbar-additional";
      boardButton.setAttribute("skipintoolbarset", "true");
      boardButton.setAttribute(
        "image",
        "chrome://browser/content/koi-common/koi-board.svg"
      );
      boardButton.setAttribute(
        "tooltiptext",
        `Board (${ShortcutUtils.prettifyShortcut(key)})`
      );
      boardButton.addEventListener("command", () => openSurface("board"));
      gBrowser.tabContainer.before(boardButton);
    },
    { once: true }
  );
})();
