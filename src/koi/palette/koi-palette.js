/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The palette — the floating search everything routes through.
 *
 * The palette is Firefox's own urlbar — input, providers, results view,
 * keyboard handling — repositioned by koi-palette.css. Koi does not
 * reimplement search; it re-hangs Firefox's. This script is the routing:
 *
 *   ⌘T and the + button   open the MIDDLE MENU over the current page. No tab
 *                         is created; committing creates it. That half of
 *                         the contract is Firefox's own
 *                         browser.urlbar.openintab pref (see
 *                         prefs/firefox/chrome-ui.yaml): commits open in a
 *                         new tab, an already-empty tab is reused, and ⌥↩
 *                         still navigates in place.
 *   ⌘K                    the middle menu, wherever you are.
 *   Landing on an empty   the middle menu, already open — startup, or a
 *   tab                   stray about:blank.
 *   Clicking the pill,    the IN-PLACE EDITOR, anchored at the field with
 *   or ⌘L                 the URL selected. Always — clicks never center.
 *
 * Which posture the palette takes is the [koi-summon] attribute this script
 * stamps on #urlbar; koi-palette.css branches on it. Escape and blur put the
 * pill back — stock Firefox, end to end. */

(() => {
  addEventListener(
    "DOMContentLoaded",
    () => {
      // Popups and other chromeless windows keep the stock field.
      if (!window.toolbar.visible) {
        return;
      }

      if (!window.gURLBar?.inputField || !window.gBrowser) {
        return;
      }

      // The view's own gate for opening without typed input. It expects the
      // gesture to look like a click ("mousedown"/"command"), so a summons
      // that arrives by keyboard borrows the shape.
      const openView = event => {
        if (!gURLBar.view.isOpen) {
          gURLBar.view.autoOpen({ event: event ?? new MouseEvent("mousedown") });
        }
      };

      // `summoning` marks focus events summon() itself causes, so the focus
      // listener below only picks a posture for focus that arrives from
      // outside (⌘L's Open Location command, a blank window's autofocus).
      let summoning = false;
      const summon = (mode, event) => {
        gURLBar.setAttribute("koi-summon", mode);
        summoning = true;
        try {
          gURLBar.focus();
        } finally {
          summoning = false;
        }
        gURLBar.select();
        openView(event);
      };

      // However focus arrives, the palette opens showing suggestions, never
      // as a bare input. tab.isEmpty is Firefox's own emptiness — the same
      // predicate _whereToOpen uses to reuse the tab on commit, so posture
      // and destination always agree.
      gURLBar.inputField.addEventListener("focus", () => {
        if (!summoning) {
          gURLBar.setAttribute(
            "koi-summon",
            gBrowser.selectedTab.isEmpty ? "center" : "anchor"
          );
        }
        openView();
      });

      // The pill's text area is a display, not an editor: a click is a
      // summons. The identity lock and page actions (star, zoom, reader)
      // keep their own click jobs — this deliberately does not cover them.
      gURLBar.inputField.closest(".urlbar-input-box")?.addEventListener(
        "mousedown",
        event => {
          if (event.button !== 0 || gURLBar.focused) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          summon("anchor", event);
        },
        { capture: true }
      );

      // ⌘T and ⌘K: the middle menu. Intercepted before Firefox's own
      // bindings (new tab, search-mode focus), so ⌘T stops creating tabs.
      addEventListener(
        "keydown",
        event => {
          if (
            !event.metaKey ||
            event.ctrlKey ||
            event.altKey ||
            event.shiftKey
          ) {
            return;
          }
          const key = event.key.toLowerCase();
          if (key !== "t" && key !== "k") {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          summon("center");
        },
        { capture: true }
      );

      // The + button is ⌘T with a mouse. preventDefault stops the XUL
      // command dispatch, so no tab is created here either.
      addEventListener(
        "click",
        event => {
          if (
            event.button !== 0 ||
            !event.target.closest?.("#tabs-newtab-button, #new-tab-button")
          ) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          summon("center");
        },
        { capture: true }
      );

      // Landing on an empty tab greets you with the menu already open.
      gBrowser.tabContainer.addEventListener("TabSelect", () => {
        if (gBrowser.selectedTab.isEmpty) {
          summon("center");
        }
      });
    },
    { once: true }
  );
})();
