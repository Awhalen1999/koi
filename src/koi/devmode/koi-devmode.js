/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Loaded into browser.xhtml, so the browser-window globals are real; the
 * koi/ tree sits outside eslint.config.mjs's browser-window path list, so
 * they are declared here instead. */
/* global gBrowser, PanelMultiView, ShortcutUtils, delayedStartupPromise */

/* Developer mode — each window's half. KoiDevMode.sys.mjs is the app's.
 *
 * One switch in the ☰ menu turns it on, and [koi-devmode] on :root then shows
 * two buttons at the head of row one's right side:
 *
 *   Developer Tools  fires Firefox's own ⌥⌘I, so it opens and closes the
 *                    devtools exactly as the shortcut does; every panel is a
 *                    tab inside. Badged with the page's error count while
 *                    that is on.
 *   ⚒                the error count's switch, then the current tab's
 *                    switches (cache, JavaScript, offline, appearance),
 *                    responsive design mode and a reload past the cache.
 *                    Checked while the tab has any switch set, so an altered
 *                    tab never looks normal.
 *
 * Built after delayed startup, when the devtools register their keys. */

(() => {
  const XHTML = "http://www.w3.org/1999/xhtml";

  function build() {
    const { KoiDevMode } = ChromeUtils.importESModule(
      "chrome://browser/content/koi-devmode/KoiDevMode.sys.mjs"
    );

    const element = (tag, attributes = {}, onCommand) => {
      const node = document.createXULElement(tag);
      for (const [name, value] of Object.entries(attributes)) {
        node.setAttribute(name, value);
      }
      if (onCommand) {
        node.addEventListener("command", onCommand);
      }
      return node;
    };

    // ☰ ▸ Developer Mode, after More Tools. The view may still be in the
    // app menu's template; a node placed there keeps its listener when the
    // menu first opens and moves it into the document.
    const toggle = document.createElementNS(XHTML, "moz-toggle");
    toggle.id = "koi-appmenu-devmode";
    toggle.setAttribute("label", "Developer Mode");
    // Label first, switch at the row's end, where the menu keeps its
    // controls (the zoom row's buttons, every shortcut).
    toggle.setAttribute("inputlayout", "inline-end");
    toggle.addEventListener("toggle", () => {
      KoiDevMode.enabled = toggle.pressed;
    });
    PanelMultiView.getViewNode(document, "appMenu-more-button2").after(toggle);

    // The two buttons.
    const cluster = element("toolbaritem", {
      id: "koi-devtools",
      skipintoolbarset: "true",
    });

    const toolboxKey = document.getElementById("key_toggleToolbox");
    const toolsButton = element(
      "toolbarbutton",
      {
        class: "toolbarbutton-1",
        badged: "true",
        image: "chrome://devtools/skin/images/tool-inspector.svg",
        tooltiptext: `Developer Tools (${ShortcutUtils.prettifyShortcut(toolboxKey)})`,
      },
      () => toolboxKey.doCommand()
    );
    cluster.append(toolsButton);

    // ⚒ — every switch is per tab and applies to the selected one. A
    // "Disable" item is checked while its switch is off.
    const switchItems = [];
    const tabSwitch = (label, name, inverted = false) => {
      const item = element("menuitem", { label, type: "checkbox" }, () =>
        KoiDevMode.setSwitch(
          gBrowser.selectedBrowser,
          name,
          item.hasAttribute("checked") != inverted
        )
      );
      switchItems.push({ item, name, inverted });
      return item;
    };

    const errorCountItem = element(
      "menuitem",
      { label: "Show Error Count", type: "checkbox" },
      () => {
        KoiDevMode.errorCountEnabled = errorCountItem.hasAttribute("checked");
      }
    );
    const javascriptItem = tabSwitch("Disable JavaScript", "javascript", true);
    // Scripts already running keep running until the page loads again.
    javascriptItem.addEventListener("command", () =>
      gBrowser.selectedBrowser.reload()
    );

    const appearancePopup = element("menupopup");
    const appearanceItems = [
      ["Automatic", "none"],
      ["Light", "light"],
      ["Dark", "dark"],
    ].map(([label, value]) => {
      const item = element(
        "menuitem",
        { label, type: "radio", name: "koi-appearance", value },
        () =>
          KoiDevMode.setSwitch(gBrowser.selectedBrowser, "appearance", value)
      );
      appearancePopup.append(item);
      return item;
    });
    const appearanceMenu = element("menu", { label: "Page Appearance" });
    appearanceMenu.append(appearancePopup);

    const devMenu = element("menupopup");
    devMenu.append(
      errorCountItem,
      element("menuseparator"),
      tabSwitch("Disable Cache", "cache", true),
      javascriptItem,
      tabSwitch("Offline", "offline"),
      appearanceMenu,
      element("menuseparator"),
      element(
        "menuitem",
        {
          label: "Responsive Design Mode",
          key: "key_responsiveDesignMode",
        },
        () => document.getElementById("key_responsiveDesignMode")?.doCommand()
      ),
      element("menuitem", {
        label: "Reload Without Cache",
        key: "key_reload_skip_cache",
        command: "Browser:ReloadSkipCache",
      })
    );
    devMenu.addEventListener("popupshowing", event => {
      if (event.target != devMenu) {
        return;
      }
      const state = KoiDevMode.switches(gBrowser.selectedBrowser);
      errorCountItem.toggleAttribute("checked", KoiDevMode.errorCountEnabled);
      for (const { item, name, inverted } of switchItems) {
        item.toggleAttribute("checked", state[name] != inverted);
      }
      for (const item of appearanceItems) {
        item.toggleAttribute("checked", item.value == state.appearance);
      }
    });

    const menuButton = element("toolbarbutton", {
      class: "toolbarbutton-1",
      type: "menu",
      image: "chrome://global/skin/icons/developer.svg",
      tooltiptext: "Developer Settings",
    });
    menuButton.append(devMenu);
    cluster.append(menuButton);

    document.getElementById("unified-extensions-button").before(cluster);

    // Rendering. The window follows the module's state; it holds none.
    const renderTab = () => {
      const browser = gBrowser.selectedBrowser;
      const errors = KoiDevMode.errorCountEnabled
        ? KoiDevMode.errorCount(browser)
        : 0;
      if (errors) {
        toolsButton.setAttribute("badge", errors > 99 ? "99+" : errors);
      } else {
        toolsButton.removeAttribute("badge");
      }
      menuButton.toggleAttribute("checked", KoiDevMode.hasSwitches(browser));
    };

    const render = () => {
      const enabled = KoiDevMode.enabled;
      document.documentElement.toggleAttribute("koi-devmode", enabled);
      toggle.toggleAttribute("pressed", enabled);
      renderTab();
    };

    const observer = {
      observe(subject, topic) {
        if (topic == "koi-devmode") {
          render();
        } else if (subject == gBrowser.selectedBrowser) {
          renderTab();
        }
      },
    };
    Services.obs.addObserver(observer, "koi-devmode");
    Services.obs.addObserver(observer, "koi-page-error");
    addEventListener(
      "unload",
      () => {
        Services.obs.removeObserver(observer, "koi-devmode");
        Services.obs.removeObserver(observer, "koi-page-error");
      },
      { once: true }
    );

    gBrowser.tabContainer.addEventListener("TabSelect", renderTab);
    gBrowser.addTabsProgressListener({
      onLocationChange(browser, webProgress) {
        if (!webProgress.isTopLevel) {
          return;
        }
        KoiDevMode.reapply(browser);
        if (browser == gBrowser.selectedBrowser) {
          renderTab();
        }
      },
    });

    render();
  }

  addEventListener(
    "DOMContentLoaded",
    () => {
      // Popups and other chromeless windows have no developer tools row.
      if (window.toolbar.visible) {
        delayedStartupPromise.then(build);
      }
    },
    { once: true }
  );
})();
