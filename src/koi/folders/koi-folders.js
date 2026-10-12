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
 *     session restore and a move to another window.
 *   - The hover list over a closed folder is Firefox's, drawn by Firefox
 *     rather than as a native popover: a popover under the pointer takes
 *     the hover with it, so the list would flicker open and shut.
 *   - Words: Firefox says "group"; the items Koi touches say "folder". The
 *     editor's are relabelled once, their Fluent ids dropped. The tab menu's
 *     get their ids back from Firefox on every open (tab-context-menu.js
 *     updateContextMenu), so they are relabelled on every open and again as
 *     Fluent's deferred translation lands. Copy Links keeps Firefox's
 *     wording: Firefox re-sets it with a count each time.
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

  // The icon store ---------------------------------------------------------

  const readIcons = () => {
    try {
      return JSON.parse(Services.prefs.getStringPref(ICON_PREF, "{}"));
    } catch {
      return {};
    }
  };
  const writeIcons = icons =>
    Services.prefs.setStringPref(ICON_PREF, JSON.stringify(icons));

  const glyph = icon =>
    `url("chrome://browser/content/koi-folders/icons/${icon}.svg")`;

  // The picked glyph rides on the group as --koi-folder-glyph, which
  // koi-folders.css draws; with none set it draws the plain folder.
  const applyIcon = group => {
    const icon = readIcons()[group.id];
    if (icon) {
      group.style.setProperty("--koi-folder-glyph", glyph(icon));
    } else {
      group.style.removeProperty("--koi-folder-glyph");
    }
  };

  const setIcon = (group, icon) => {
    const icons = readIcons();
    if (icon == "folder") {
      delete icons[group.id];
    } else {
      icons[group.id] = icon;
    }
    writeIcons(icons);
    applyIcon(group);
  };

  // The pile ---------------------------------------------------------------

  const favicon = tab => {
    const src = tab.getAttribute("image");
    if (!src) {
      return DEFAULT_FAVICON;
    }
    return src == NEWTAB_FAVICON ? MARK : src;
  };

  const pileOf = group => {
    let pile = group.querySelector(".koi-folder-pile");
    if (!pile) {
      pile = document.createElementNS(XHTML, "span");
      pile.className = "koi-folder-pile";
      group.querySelector(".tab-group-label-hover-highlight").append(pile);
    }
    return pile;
  };

  // Selection is read off the tabs, not [hasactivetab]: on TabSelect this
  // runs before Firefox's own listener updates the attribute. The pile's
  // width is measured here rather than by a ResizeObserver: the strip's
  // arrowscrollbox decides it is overflowing in a ResizeObserver of its own
  // and applies the answer a frame later, dropping a second size change in
  // between, which left the strip overflowing with no "+" and no scrolling.
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
    group.toggleAttribute("koi-pile", width > 0);
    group.style.setProperty("--koi-pile-width", `${width}px`);
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
    const check = icon => {
      for (const button of icons.children) {
        button.setAttribute("aria-checked", button.value == icon);
      }
    };
    for (const icon of ICONS) {
      const button = document.createElementNS(XHTML, "button");
      button.value = icon;
      button.title = icon[0].toUpperCase() + icon.slice(1);
      button.setAttribute("role", "radio");
      button.style.setProperty("--koi-folder-glyph", glyph(icon));
      button.addEventListener("click", () => {
        setIcon(editor.activeGroup, icon);
        check(icon);
      });
      icons.append(button);
    }
    editor.querySelector(".tab-group-editor-name").append(icons);

    // The panel takes the group's colour for the icon ring, and follows a
    // change made in its swatches.
    const colour = group =>
      panel.style.setProperty(
        "--tab-group-color",
        `var(--tab-group-${group.color})`
      );
    panel.addEventListener("popupshowing", event => {
      const group = editor.activeGroup;
      if (event.target != panel || !group) {
        return;
      }
      colour(group);
      check(readIcons()[group.id] ?? "folder");
      // Firefox re-decides both on every open.
      document.getElementById("tabGroupEditor_saveAndCloseGroup").hidden = true;
      document.getElementById("tabGroupEditor_shareTabGroup").hidden = true;
    });
    gBrowser.tabContainer.addEventListener("TabGroupUpdate", event => {
      if (event.target == editor.activeGroup && panel.state == "open") {
        colour(event.target);
      }
    });
  };

  const buildTabMenu = () => {
    const menu = document.getElementById("tabContextMenu");
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

    const adopt = group => {
      group.saveOnWindowClose = false;
      applyIcon(group);
      paint(group);
    };
    strip.addEventListener("TabGroupCreate", event => adopt(event.target));
    // A folder on its way to another window keeps its icon.
    strip.addEventListener("TabGroupRemoved", event => {
      const icons = readIcons();
      if (!event.target.removedByAdoption && event.target.id in icons) {
        delete icons[event.target.id];
        writeIcons(icons);
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
    gBrowser.getAllTabGroups().forEach(adopt);

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
