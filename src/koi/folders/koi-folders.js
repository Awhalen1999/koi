/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Folders: what Koi adds to Firefox's tab groups beyond CSS (koi-folders.css
 * has the drawing and the DOM).
 *   - The pile: a closed folder's first three favicons, and "+N" for the
 *     rest, redrawn on the group events Firefox fires. Closed with its
 *     selected tab showing, Firefox's own "+N" counts the others instead.
 *   - The icon: a glyph per folder, picked in the editor. Firefox persists
 *     a group's id, name, colour and collapsed state only (TabGroupState),
 *     so the pick lives in a JSON pref keyed by group id; ids survive
 *     session restore.
 *   - The hover list over a closed folder is Firefox's, drawn by Firefox
 *     rather than as a native popover: a popover under the pointer takes the
 *     hover with it, and the list flickered open and shut.
 *   - Words: Firefox says "group"; the few items Koi touches say "folder".
 *     The editor's are relabelled once, their Fluent ids dropped. The tab
 *     menu's get their ids back from Firefox on every open (tab-context-menu.js
 *     updateContextMenu), so they are relabelled there, after it, before
 *     Fluent's deferred translation looks for the id. Copy Links keeps
 *     Firefox's wording: it is re-set with a count on every open.
 *   - Firefox's Save and Close and Share Group stay hidden: a folder lives
 *     in the strip or not at all, and "share" is the agent's word. Groups
 *     are not saved when a window closes either (saveOnWindowClose), so
 *     Firefox's saved-groups surfaces stay empty. */

/* global gBrowser, delayedStartupPromise, TabContextMenu */

(() => {
  const ICON_PREF = "koi.folders.icons";
  const ICONS = [
    "folder",
    "briefcase",
    "book",
    "pen",
    "flask",
    "code",
    "home",
    "star",
  ];
  const XHTML = "http://www.w3.org/1999/xhtml";
  const MARK = "chrome://browser/content/koi-common/koi-mark.svg";
  const DEFAULT_FAVICON = "chrome://global/skin/icons/defaultFavicon.svg";
  // The branding raster Firefox gives about:newtab tabs; the strip shows the
  // mark instead (koi-chrome.css).
  const NEWTAB_FAVICON = "chrome://branding/content/icon32.png";

  const readIcons = () => {
    try {
      return JSON.parse(Services.prefs.getStringPref(ICON_PREF, "{}"));
    } catch {
      return {};
    }
  };
  const setIcon = (group, icon) => {
    const icons = readIcons();
    if (icon && icon != "folder") {
      icons[group.id] = icon;
      group.setAttribute("koi-icon", icon);
    } else {
      delete icons[group.id];
      group.removeAttribute("koi-icon");
    }
    Services.prefs.setStringPref(ICON_PREF, JSON.stringify(icons));
  };

  const favicon = tab => {
    const src = tab.getAttribute("image");
    if (!src) {
      return DEFAULT_FAVICON;
    }
    return src == NEWTAB_FAVICON ? MARK : src;
  };

  // The pile ---------------------------------------------------------------

  const pileOf = group => {
    let pile = group.querySelector(".koi-folder-pile");
    if (!pile) {
      pile = document.createElementNS(XHTML, "span");
      pile.className = "koi-folder-pile";
      group.querySelector(".tab-group-label-hover-highlight").append(pile);
    }
    return pile;
  };

  // Read off the tabs, not [hasactivetab]: on TabSelect this runs before
  // Firefox's own listener updates the attribute. The label's trailing
  // padding is set from the pile's measured width here, synchronously, not
  // from a ResizeObserver: the strip's arrowscrollbox decides it is
  // overflowing in a ResizeObserver of its own and applies the answer a
  // frame later, ignoring a second size change in between, so a chip that
  // shrank (the collapse) and grew (the pile) within one frame left the strip
  // overflowing with no "+" and no scrolling.
  const paint = group => {
    const pile = pileOf(group);
    pile.textContent = "";
    const { tabs } = group;
    if (group.collapsed && !tabs.some(tab => tab.selected)) {
      const favs = document.createElementNS(XHTML, "span");
      favs.className = "koi-folder-favs";
      for (const tab of tabs.slice(0, 3)) {
        const img = document.createElementNS(XHTML, "img");
        img.src = favicon(tab);
        img.alt = "";
        favs.append(img);
      }
      pile.append(favs);
      if (tabs.length > 3) {
        const more = document.createElementNS(XHTML, "span");
        more.className = "koi-folder-more";
        more.textContent = `+${tabs.length - 3}`;
        pile.append(more);
      }
    }
    const width = pile.getBoundingClientRect().width;
    group.style.setProperty(
      "--koi-pile-width",
      width ? `${width + 6}px` : "0px"
    );
  };

  // The editor and the tab menu -------------------------------------------

  const word = (id, label) => {
    const item = document.getElementById(id);
    item.removeAttribute("data-lazy-l10n-id");
    item.removeAttribute("data-l10n-id");
    item.setAttribute("label", label);
  };

  const buildEditor = () => {
    const editor = document.getElementById("tab-group-editor");
    const panel = editor.querySelector("panel");
    const name = editor.querySelector(".tab-group-editor-name");
    for (const [id, text] of [
      ["tab-group-editor-title-create", "New Folder"],
      ["tab-group-editor-title-edit", "Edit Folder"],
    ]) {
      const heading = document.getElementById(id);
      heading.removeAttribute("data-l10n-id");
      heading.textContent = text;
    }
    word("tabGroupEditor_addNewTabInGroup", "New Tab in Folder");
    word("tabGroupEditor_moveGroupToNewWindow", "Move Folder to New Window");
    word("tabGroupEditor_ungroupTabs", "Ungroup");
    word("tabGroupEditor_deleteGroup", "Delete Folder");

    const icons = document.createElementNS(XHTML, "div");
    icons.className = "koi-folder-icons";
    icons.setAttribute("role", "radiogroup");
    for (const icon of ICONS) {
      const button = document.createElementNS(XHTML, "button");
      button.value = icon;
      button.title = icon[0].toUpperCase() + icon.slice(1);
      button.setAttribute("role", "radio");
      button.style.setProperty(
        "--koi-folder-glyph",
        `url("chrome://browser/content/koi-folders/icons/${icon}.svg")`
      );
      button.addEventListener("click", () => {
        setIcon(editor.activeGroup, icon);
        check(icon);
      });
      icons.append(button);
    }
    name.append(icons);
    const check = icon => {
      for (const button of icons.children) {
        button.setAttribute("aria-checked", button.value == icon);
      }
    };

    panel.addEventListener("popupshowing", event => {
      if (event.target != panel) {
        return;
      }
      const group = editor.activeGroup;
      panel.style.setProperty(
        "--tab-group-color",
        `var(--tab-group-${group.color})`
      );
      check(group.getAttribute("koi-icon") ?? "folder");
      // Firefox re-decides both on every open.
      document.getElementById("tabGroupEditor_saveAndCloseGroup").hidden = true;
      document.getElementById("tabGroupEditor_shareTabGroup").hidden = true;
    });
    panel.addEventListener("TabGroupUpdate", event => {
      if (event.target == editor.activeGroup) {
        panel.style.setProperty(
          "--tab-group-color",
          `var(--tab-group-${event.target.color})`
        );
      }
    });
  };

  const buildTabMenu = () => {
    const menu = document.getElementById("tabContextMenu");
    // Firefox's own popupshowing handler may run after this one and give the
    // items their Fluent ids back, so Fluent's deferred translation is
    // answered as it lands.
    const words = {};
    const apply = () => {
      for (const [id, label] of Object.entries(words)) {
        if (document.getElementById(id).getAttribute("label") != label) {
          word(id, label);
        }
      }
    };
    new MutationObserver(apply).observe(menu, {
      attributes: true,
      attributeFilter: ["label"],
      subtree: true,
    });
    menu.addEventListener("popupshowing", event => {
      if (event.target != menu) {
        return;
      }
      const tabs = TabContextMenu.contextTabs.length > 1 ? "Tabs" : "Tab";
      words.context_moveTabToNewGroup = `Add ${tabs} to New Folder`;
      words.context_moveTabToGroup = `Add ${tabs} to Folder`;
      words.context_moveTabToGroupNewGroup = "New Folder…";
      words.context_ungroupTab = "Remove from Folder";
      apply();
    });
  };

  // Wiring -----------------------------------------------------------------

  const build = () => {
    const strip = gBrowser.tabContainer;
    const icons = readIcons();

    strip.addEventListener("TabGroupCreate", event => {
      const group = event.target;
      group.saveOnWindowClose = false;
      if (icons[group.id]) {
        group.setAttribute("koi-icon", icons[group.id]);
      }
      paint(group);
    });
    strip.addEventListener("TabGroupRemoved", event => {
      const stored = readIcons();
      if (event.target.id in stored) {
        delete stored[event.target.id];
        Services.prefs.setStringPref(ICON_PREF, JSON.stringify(stored));
      }
    });
    for (const type of ["TabGroupCollapse", "TabGroupExpand"]) {
      strip.addEventListener(type, event => paint(event.target));
    }
    // Membership (TabUngrouped names the tab, not the group it left), then
    // order, selection and favicons by group.
    const paintAll = () => gBrowser.getAllTabGroups().forEach(paint);
    for (const type of ["TabGrouped", "TabUngrouped"]) {
      strip.addEventListener(type, paintAll);
    }
    strip.addEventListener("TabMove", event => {
      if (event.target.group) {
        paint(event.target.group);
      }
    });
    strip.addEventListener("TabSelect", event => {
      for (const group of new Set([
        event.target.group,
        event.detail.previousTab?.group,
      ])) {
        if (group) {
          paint(group);
        }
      }
    });
    strip.addEventListener("TabAttrModified", event => {
      if (event.detail.changed.includes("image") && event.target.group) {
        paint(event.target.group);
      }
    });
    for (const group of gBrowser.getAllTabGroups()) {
      group.saveOnWindowClose = false;
      if (icons[group.id]) {
        group.setAttribute("koi-icon", icons[group.id]);
      }
      paint(group);
    }

    document
      .getElementById("tabgroup-preview-panel")
      .setAttribute("nonnative", "");
    buildEditor();
    buildTabMenu();
  };

  addEventListener(
    "DOMContentLoaded",
    () => {
      if (window.toolbar.visible) {
        delayedStartupPromise.then(build);
      }
    },
    { once: true }
  );
})();
