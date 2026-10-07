/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser-window globals (koi/ is outside eslint.config.mjs's browser-window
 * paths). */
/* global gBrowser, MozXULElement, PrivateBrowsingUtils, SessionStore,
   BROWSER_NEW_TAB_URL */

/* Spaces: named sets of tabs, one active per window, Zen's model
 * (ZenSpaceManager.mjs) on Firefox's own machinery and no patch:
 *   - A tab's space is a SessionStore custom value (koiSpace), mirrored to a
 *     koi-space attribute for lookups, so a restored or reopened tab comes
 *     back in its space. A new tab takes the window's active space; so does
 *     a tab dragged in from another window.
 *   - The other spaces' tabs are hidden with gBrowser.hideTab, so the strip,
 *     the board, ⌃Tab, ⌘1–9 and "Close Other Tabs" all see one space.
 *     Pinned tabs show in every space, Zen's essentials (hideTab refuses
 *     them anyway); unpinning joins the active space.
 *   - Selecting a tab from another space (a ⌘L result, undo close) switches
 *     to that space, as in Zen.
 *   - The list (name, icon) and the last-used space are one JSON pref,
 *     koi.spaces, as CustomizableUI keeps its placements. Every window
 *     observes it, so a rename or a deletion reaches all of them; a new
 *     window opens in the last-used space.
 * Closing a space's last tab leaves an empty tab in it, because
 * browser.tabs.closeWindowWithLastTab is off (chrome-ui.yaml): Firefox counts
 * only visible tabs as "the last tab" and would otherwise close the window
 * with the hidden spaces in it.
 *
 * The pill after the traffic lights shows the active space and opens a
 * native menu: the spaces with ⌃1–⌃9, New Space and Edit "…". New and edit
 * share one arrow panel: a name and sixteen icons, no colour. Edits apply as
 * they are made; a new space is switched to on creation. A private window
 * has none of this: its tabs are one private space. */

(() => {
  const PREF = "koi.spaces";
  const TAB_KEY = "koiSpace";
  const ICONS = "chrome://browser/content/koi-spaces/icons/";
  // The panel's grid in order; the first stands in for an unknown name.
  const ICON_NAMES = [
    "house",
    "briefcase",
    "book-open",
    "code",
    "message-square",
    "music",
    "square-play",
    "shopping-cart",
    "send",
    "heart",
    "star",
    "flask-conical",
    "camera",
    "pencil",
    "folder",
    "globe",
  ];
  const KEYS = 9;

  const iconURL = name =>
    `${ICONS}${ICON_NAMES.includes(name) ? name : ICON_NAMES[0]}.svg`;

  // {active, spaces: [{id, name, icon}]}. A value that will not parse goes
  // back to the default branch's.
  const read = () => {
    try {
      const store = JSON.parse(Services.prefs.getStringPref(PREF));
      if (store.spaces?.length) {
        return store;
      }
    } catch {}
    return JSON.parse(Services.prefs.getDefaultBranch("").getStringPref(PREF));
  };

  addEventListener(
    "DOMContentLoaded",
    () => {
      if (
        !window.toolbar.visible ||
        !window.gBrowser ||
        PrivateBrowsingUtils.isWindowPrivate(window)
      ) {
        return;
      }

      let store = read();
      const known = id => store.spaces.some(space => space.id === id);
      let activeId = known(store.active) ? store.active : store.spaces[0].id;
      const active = () =>
        store.spaces.find(space => space.id === activeId) ?? store.spaces[0];
      const spaceOf = tab => tab.getAttribute("koi-space");

      // This window's writes render here directly; the observer below is for
      // the other windows' writes.
      let writing = false;
      const save = () => {
        writing = true;
        try {
          Services.prefs.setStringPref(PREF, JSON.stringify(store));
        } finally {
          writing = false;
        }
        render();
      };

      const tag = (tab, id) => {
        if (spaceOf(tab) !== id) {
          tab.setAttribute("koi-space", id);
        }
        if (SessionStore.getCustomTabValue(tab, TAB_KEY) !== id) {
          SessionStore.setCustomTabValue(tab, TAB_KEY, id);
        }
      };

      // The stored space is the truth and the attribute its mirror: a
      // restored tab's stored value arrives after TabOpen tagged it, and
      // before SSTabRestoring. A space deleted while the tab was closed
      // becomes the active one.
      const sync = tab => {
        const stored = SessionStore.getCustomTabValue(tab, TAB_KEY);
        const id = known(stored) ? stored : spaceOf(tab);
        tag(tab, known(id) ? id : activeId);
      };

      // The window follows its selected tab into that tab's space (a ⌘L
      // result, undo close, which selects before the stored space lands),
      // then shows the active space's tabs and hides the rest. hideTab
      // refuses the selected tab, so a switch selects first.
      const apply = () => {
        const selected = gBrowser.selectedTab;
        sync(selected);
        if (!selected.pinned && spaceOf(selected) !== activeId) {
          switchTo(spaceOf(selected), selected);
          return;
        }
        for (const tab of gBrowser.tabs) {
          sync(tab);
          if (tab.pinned || spaceOf(tab) === activeId) {
            gBrowser.showTab(tab);
          } else {
            gBrowser.hideTab(tab);
          }
        }
      };

      // Lands on the space's most recently used tab, or a new empty one.
      const switchTo = (id, tab) => {
        activeId = id;
        store.active = id;
        save();
        const tabs = gBrowser.tabs.filter(t => !t.pinned && spaceOf(t) === id);
        gBrowser.selectedTab =
          tab ??
          tabs.reduce(
            (best, t) => (t.lastAccessed > best.lastAccessed ? t : best),
            tabs[0]
          ) ??
          gBrowser.addTrustedTab(BROWSER_NEW_TAB_URL, { skipAnimation: true });
        apply();
      };

      // After the list changed anywhere: leave a deleted space, then close
      // its tabs. Pinned tabs stay; their next unpin retags them.
      const settle = () => {
        const gone = gBrowser.tabs.filter(
          tab => !tab.pinned && !known(spaceOf(tab))
        );
        if (!known(activeId)) {
          switchTo(known(store.active) ? store.active : store.spaces[0].id);
        }
        if (gone.length) {
          gBrowser.removeTabs(gone, { animate: false });
        }
      };

      const remove = id => {
        store.spaces = store.spaces.filter(space => space.id !== id);
        if (!known(store.active)) {
          store.active = store.spaces[0].id;
        }
        save();
        settle();
      };

      // The chrome ------------------------------------------------------

      const xul = (tagName, attributes, onCommand) => {
        const node = document.createXULElement(tagName);
        for (const [name, value] of Object.entries(attributes)) {
          node.setAttribute(name, value);
        }
        if (onCommand) {
          node.addEventListener("command", onCommand);
        }
        return node;
      };

      const fragment = MozXULElement.parseXULToFragment(`
        <toolbarbutton id="koi-space-button" type="menu">
          <menupopup id="koi-space-menu"/>
        </toolbarbutton>
        <keyset id="koi-space-keys"/>
        <panel id="koi-space-panel" type="arrow" orient="vertical" class="panel-no-padding" aria-label="Space">
          <html:div class="koi-space-form">
            <html:label class="koi-space-field">
              <html:img class="koi-space-field-icon" alt=""/>
              <html:input class="koi-space-name" type="text" placeholder="Space name" maxlength="40" autocomplete="off"/>
            </html:label>
            <html:div class="koi-space-icons" role="radiogroup" aria-label="Icon"/>
            <html:div class="koi-space-actions">
              <html:button class="koi-space-cancel">Cancel</html:button>
              <html:button class="koi-space-delete">Delete Space…</html:button>
              <html:button class="koi-space-create">Create</html:button>
            </html:div>
          </html:div>
        </panel>
      `);
      const pill = fragment.getElementById("koi-space-button");
      const menu = fragment.getElementById("koi-space-menu");
      const keyset = fragment.getElementById("koi-space-keys");
      const panel = fragment.getElementById("koi-space-panel");

      const render = () => {
        pill.setAttribute("label", active().name);
        pill.setAttribute("image", iconURL(active().icon));
      };

      // The pill crops its label to its width; a native menu crops nothing,
      // so its names are cut here.
      const crop = name =>
        name.length > 24 ? `${name.slice(0, 23).trimEnd()}…` : name;

      // The menu is rebuilt each time it opens: the list is short and may
      // have changed in another window. No icons: Cocoa gives a checkbox or
      // radio item no image (nsMenuItemX::SetupIcon), and the check mark is
      // the macOS mark for "current"; the pill shows the icon.
      menu.addEventListener("popupshowing", () => {
        const items = store.spaces.map((space, i) => {
          const item = xul(
            "menuitem",
            { type: "radio", name: "koi-space", label: crop(space.name) },
            () => switchTo(space.id)
          );
          if (space.id === activeId) {
            item.setAttribute("checked", "true");
          }
          if (i < KEYS) {
            item.setAttribute("key", `key_koiSpace${i + 1}`);
          }
          return item;
        });
        menu.replaceChildren(
          ...items,
          xul("menuseparator", {}),
          xul("menuitem", { label: "New Space" }, () => openPanel()),
          xul("menuitem", { label: `Edit “${crop(active().name)}”` }, () =>
            openPanel(active())
          )
        );
      });

      // ⌃1–⌃9, Arc's chord and the design's. Free in Firefox on macOS (tabs
      // take ⌘1–9) but taken by macOS itself once Mission Control has two
      // or more desktops (Switch to Desktop N).
      for (let i = 1; i <= KEYS; i++) {
        keyset.append(
          xul(
            "key",
            { id: `key_koiSpace${i}`, key: String(i), modifiers: "control" },
            () => {
              const space = store.spaces[i - 1];
              if (space) {
                switchTo(space.id);
              }
            }
          )
        );
      }

      // The panel ---------------------------------------------------------
      // One panel for both jobs: `editing` is the space being edited (its
      // store entry, written through as it changes) or null while `draft` is
      // a space to create. [mode] is new, edit or confirm (Delete asked
      // once, in the panel: Firefox's prompt is a card pinned to the top of
      // the page, not a sheet).

      const nameInput = panel.querySelector(".koi-space-name");
      const fieldIcon = panel.querySelector(".koi-space-field-icon");
      const grid = panel.querySelector(".koi-space-icons");
      const cancelButton = panel.querySelector(".koi-space-cancel");
      const createButton = panel.querySelector(".koi-space-create");
      const deleteButton = panel.querySelector(".koi-space-delete");
      let editing = null;
      let draft = null;

      const paint = () => {
        fieldIcon.src = iconURL(draft.icon);
        for (const button of grid.children) {
          button.setAttribute(
            "aria-checked",
            button.dataset.icon === draft.icon
          );
        }
        createButton.disabled = !draft.name;
        deleteButton.disabled = store.spaces.length < 2;
      };

      for (const name of ICON_NAMES) {
        const button = document.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "button"
        );
        button.className = "koi-space-icon";
        button.dataset.icon = name;
        button.setAttribute("role", "radio");
        button.setAttribute("aria-label", name.replace("-", " "));
        const image = document.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "img"
        );
        image.src = iconURL(name);
        image.alt = "";
        button.append(image);
        button.addEventListener("click", () => {
          draft.icon = name;
          if (editing) {
            save();
          }
          paint();
        });
        grid.append(button);
      }

      const setMode = mode => {
        panel.setAttribute("mode", mode);
        deleteButton.textContent =
          mode === "confirm" ? "Delete and Close Tabs" : "Delete Space…";
      };

      const openPanel = space => {
        editing = space ?? null;
        draft = space ?? { name: "", icon: ICON_NAMES[0] };
        setMode(space ? "edit" : "new");
        nameInput.value = draft.name;
        paint();
        panel.openPopup(pill, "bottomleft topleft");
      };

      panel.addEventListener("popupshown", () => {
        nameInput.focus();
        nameInput.select();
      });

      // An edit's name is kept until a new one is typed; a draft's gates
      // Create.
      nameInput.addEventListener("input", () => {
        const name = nameInput.value.trim();
        if (!editing) {
          draft.name = name;
          paint();
        } else if (name) {
          editing.name = name;
          save();
        }
      });

      nameInput.addEventListener("keydown", event => {
        if (event.key !== "Enter") {
          return;
        }
        event.preventDefault();
        if (editing) {
          panel.hidePopup();
        } else if (!createButton.disabled) {
          createButton.click();
        }
      });

      createButton.addEventListener("click", () => {
        const space = { id: crypto.randomUUID(), ...draft };
        store.spaces.push(space);
        save();
        panel.hidePopup();
        switchTo(space.id);
      });

      cancelButton.addEventListener("click", () => {
        if (panel.getAttribute("mode") === "confirm") {
          setMode("edit");
        } else {
          panel.hidePopup();
        }
      });

      deleteButton.addEventListener("click", () => {
        if (panel.getAttribute("mode") === "edit") {
          setMode("confirm");
          return;
        }
        panel.hidePopup();
        remove(editing.id);
      });

      // Wiring --------------------------------------------------------------

      document
        .querySelector("#nav-bar > .titlebar-buttonbox-container")
        .after(pill);
      document.documentElement.append(keyset);
      document.getElementById("mainPopupSet").append(panel);

      for (const tab of gBrowser.tabs) {
        tag(tab, activeId);
      }
      render();

      const tabs = gBrowser.tabContainer;
      tabs.addEventListener("TabOpen", event => tag(event.target, activeId));
      tabs.addEventListener("TabUnpinned", event =>
        tag(event.target, activeId)
      );
      tabs.addEventListener("TabSelect", apply);
      // A tab restored on its own (undo close, a lazy tab loading), and a
      // whole window, whose selected tab says which space it was in.
      tabs.addEventListener("SSTabRestoring", apply);
      addEventListener("SSWindowRestored", apply);

      const observer = () => {
        if (!writing) {
          store = read();
          settle();
          render();
        }
      };
      Services.prefs.addObserver(PREF, observer);
      addEventListener(
        "unload",
        () => Services.prefs.removeObserver(PREF, observer),
        { once: true }
      );
    },
    { once: true }
  );
})();
