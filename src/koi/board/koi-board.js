/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Loaded into browser.xhtml, so the browser-window globals are real; the
 * koi/ tree sits outside eslint.config.mjs's browser-window path list, so
 * they are declared here instead. */
/* global gBrowser, PageThumbs, ShortcutUtils */

/* The board (⇧⌘E) and peek — every tab as a card.
 *
 * One surface, two densities: peek is a single row of cards over a light
 * scrim, the board is the full grid over the heavy one. Same cards, same
 * data — the mode attribute only changes the layout (koi-board.css). The
 * board's key is ⇧⌘E: free in Firefox's keyset and in its macOS system
 * actions, with no platform meaning of its own. Peek has no key: one
 * surface, one shortcut — its trigger is the
 * hold-a-tab gesture, not yet built, so today only the board opens. (A
 * bookmarks mode existed briefly and was withdrawn: a flat grid loses
 * bookmark folders, and a surface that hides structure is worse than none.
 * It can return once folders have a design.)
 *
 * Like the empty state, this is chrome in #tabbrowser-tabbox: one subtree,
 * one attribute, no DOM moves, no patches. The surface is a modal: cards
 * are built when it opens, kept in step with the strip while it shows — a
 * tab opened, closed, moved, renamed or gone quiet is reflected as it
 * happens — and torn down when it closes, so nothing is left to go stale.
 * The tab listeners exist only while the surface shows. Thumbnails ride
 * Firefox's own tab-preview capture (PageThumbs.captureTabPreviewThumbnail),
 * a few at a time; a tab with nothing to show — pending, blank, or
 * capture-refused — keeps the quiet glass fallback. */

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
      // A modal, and said so: the keyboard stays inside while it shows (the
      // focus handling below).
      surface.setAttribute("role", "dialog");
      surface.setAttribute("aria-modal", "true");
      surface.setAttribute("aria-label", "Board");
      const grid = el("div", "koi-board-grid");
      surface.append(grid);
      tabbox.append(surface);

      // null when closed, else "peek" | "board".
      let openMode = null;

      // Thumbnails --------------------------------------------------------
      // The backing store matches the largest card the CSS draws, so board
      // cards stay sharp and peek cards downscale — the shape Firefox's own
      // hover preview uses (tab-hover-preview.mjs).
      const THUMB_W = 320;
      const THUMB_H = 200;

      // Every capture is a paint request to a content process, and a window
      // with forty tabs must not fire forty at once: they run through this
      // queue a few at a time. A card that has gone by the time its turn
      // comes — the surface closed, the tab shut — is skipped, not painted.
      const CAPTURES_AT_ONCE = 4;
      const captureQueue = [];
      let capturesRunning = 0;

      const pumpCaptures = () => {
        while (capturesRunning < CAPTURES_AT_ONCE && captureQueue.length) {
          const { tab, thumb } = captureQueue.shift();
          const browser = tab.linkedBrowser;
          if (
            !thumb.isConnected ||
            !browser?.browsingContext?.currentWindowGlobal
          ) {
            continue;
          }
          const canvas = el("canvas");
          canvas.width = THUMB_W * devicePixelRatio;
          canvas.height = THUMB_H * devicePixelRatio;
          capturesRunning++;
          PageThumbs.captureTabPreviewThumbnail(browser, canvas)
            .then(
              () => thumb.isConnected && thumb.append(canvas),
              () => {} // The glass fallback is already showing.
            )
            .finally(() => {
              capturesRunning--;
              pumpCaptures();
            });
        }
      };

      const requestThumbnail = (tab, thumb) => {
        if (tab.hasAttribute("pending") || tab.isEmpty) {
          return; // Nothing to show; the glass fallback stands.
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

        // The audio badge: shown while the tab plays or is muted, click
        // toggles — the tab strip's speaker, carried onto the card.
        const audio = el("button", "koi-card-audio");
        audio.addEventListener("click", () => tab.toggleMuteAudio());
        header.append(icon, label, audio, close);

        // The header is the tab's: title, favicon and audio state, redrawn
        // whenever those change under it (onTabAttrModified).
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
          // Idempotent with the TabSelect close — selecting the
          // already-current card fires no TabSelect at all.
          closeSurface();
        });
        return card;
      };

      const cardOf = tab =>
        [...grid.children].find(card => card.koiTab === tab);

      // The strip's shape changed — a tab opened, closed, moved, hidden or
      // shown (pinning moves) — so the grid follows: cards whose tabs remain
      // are kept, thumbnail and all, newcomers are built, the rest drop, and
      // the order is the strip's. Firefox invalidates visibleTabs before it
      // dispatches each of these events, so the read is fresh.
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
        // Re-inserting nodes drops their focus. Put it back where it was —
        // or, when the focused card is the one that went, on its neighbour.
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

      // Title, favicon or audio changing under a card while the surface
      // shows. (Selection changes close it, so the current mark never moves.)
      const REDRAWN = ["label", "image", "soundplaying", "muted"];
      const onTabAttrModified = event => {
        if (event.detail.changed.some(attr => REDRAWN.includes(attr))) {
          cardOf(event.target)?.koiRedraw();
        }
      };

      // Any tab switch — a card click, ⌘1, an external caller — is a
      // navigate intent, and navigating dismisses the surface.
      const onTabSelect = () => closeSurface();

      // Bound while the surface shows, and not otherwise.
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

      // The page takes the keyboard back on close — unless the user has
      // already handed it to something else (the focusout below).
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

      // Focus that leaves for somewhere real — the address field, the
      // findbar — is a navigate intent: dismiss, and leave the keyboard where
      // the user put it. Those are the only ways out: XUL chrome is
      // -moz-user-focus: ignore, so clicking a toolbar button or the strip
      // never blurs a card, and a window blur arrives with no relatedTarget
      // and changes nothing.
      surface.addEventListener("focusout", event => {
        if (
          openMode &&
          event.relatedTarget &&
          !surface.contains(event.relatedTarget)
        ) {
          closeSurface({ restoreFocus: false });
        }
      });

      // Cards are role=button divs, so Enter/Space activate by hand; arrows
      // walk the cards — Left/Right linearly, Up/Down by rendered row. Tab
      // cycles within the surface, as a modal's does. Esc dismisses, handled
      // here rather than on the window: focus lives on the surface whenever
      // it is open.
      surface.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeSurface();
          return;
        }
        if (event.key === "Tab") {
          // The cards and their visible buttons, in tab order: wrap at
          // either end and leave the steps in between to Firefox.
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

      // The shortcut is a XUL <key> in a keyset of Koi's own, appended to the
      // document the way every WebExtension's is (ExtensionShortcuts.sys.mjs):
      // Firefox's mainKeyset is untouched, and a bare <key> fires `command` on
      // itself. `reserved` is left unset, so Firefox arbitrates it as it does
      // its own keys — the page sees the keystroke first unless the user has
      // denied that site shortcut overrides. A letter, deliberately: Firefox
      // on macOS turns ⌘{ and ⌘} into previous/next tab by keypress charCode
      // (ShortcutUtils.getSystemActionForEvent, from tabbrowser's on_keypress)
      // and Cmd+Shift+punctuation charCodes are layout-dependent — ⇧⌘\ was
      // consumed as previous-tab before this key ever saw it.
      const key = document.createXULElement("key");
      key.id = "key_koiBoard";
      key.setAttribute("key", "E");
      key.setAttribute("modifiers", "accel,shift");
      key.addEventListener("command", () => openSurface("board"));
      const keyset = document.createXULElement("keyset");
      keyset.append(key);
      document.documentElement.append(keyset);

      // The board button: the strip's leading control, the mock's 2×2
      // squares, opening exactly what the key opens. skipintoolbarset keeps
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
