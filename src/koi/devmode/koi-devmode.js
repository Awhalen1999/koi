/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser-window globals (koi/ is outside eslint.config.mjs's browser-window
 * paths). */
/* global gBrowser, ConfirmationHint, PanelMultiView, ShortcutUtils,
   SiteDataManager, delayedStartupPromise */

/* Developer mode, each window's half (KoiDevMode.sys.mjs is the app's).
 * While the selected tab is in dev mode (KoiDevMode.isActive), [koi-devmode]
 * on :root shows two buttons before the extensions button:
 *   Developer Tools — fires Firefox's ⌥⌘I key, so it toggles the toolbox
 *     exactly as the shortcut does; badged with the page's error count.
 *   ⚒ — the error count switch, the tab's switches, responsive design mode,
 *     view source, copy URL, reload without cache, clear site data. Checked
 *     while the tab has a switch set.
 * Both are disabled on anything but a web page. Built after delayed startup,
 * once the devtools have registered their keys. */

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
    // menu's template; the node keeps its listener when the template is
    // moved into the document on first open.
    const toggle = document.createElementNS(XHTML, "moz-toggle");
    toggle.id = "koi-appmenu-devmode";
    toggle.setAttribute("label", "Developer Mode");
    // Switch at the row's end, where the menu keeps its other controls.
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

    // The URL as loaded, query and all: no tracker stripping here.
    const copyURL = () => {
      Cc["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Ci.nsIClipboardHelper)
        .copyString(gBrowser.currentURI.spec);
      ConfirmationHint.show(menuButton, "confirmation-hint-link-copied");
    };

    // The identity panel's Clear Cookies and Site Data, prompt and all
    // (gIdentityHandler.clearSiteData, which waits on its own panel).
    const clearSiteDataItem = element(
      "menuitem",
      { label: "Clear Site Data…" },
      () => {
        const baseDomain = SiteDataManager.getBaseDomainFromHost(
          gBrowser.currentURI.host
        );
        if (SiteDataManager.promptSiteDataRemoval(window, [baseDomain])) {
          SiteDataManager.remove(baseDomain);
        }
      }
    );

    const devMenu = element("menupopup");
    devMenu.append(
      errorCountItem,
      element("menuseparator"),
      tabSwitch("Disable Cache", "cache", true),
      javascriptItem,
      tabSwitch("Disable Styles", "styles", true),
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
        label: "View Source",
        key: "key_viewSource",
        command: "View:PageSource",
      }),
      element("menuitem", { label: "Copy URL" }, copyURL),
      element("menuseparator"),
      element("menuitem", {
        label: "Reload Without Cache",
        key: "key_reload_skip_cache",
        command: "Browser:ReloadSkipCache",
      }),
      clearSiteDataItem
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
      const { scheme } = gBrowser.currentURI;
      clearSiteDataItem.toggleAttribute(
        "disabled",
        scheme != "http" && scheme != "https"
      );
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
      document.documentElement.toggleAttribute(
        "koi-devmode",
        KoiDevMode.isActive(browser)
      );
      const errors = KoiDevMode.errorCountEnabled
        ? KoiDevMode.errorCount(browser)
        : 0;
      if (errors) {
        toolsButton.setAttribute("badge", errors > 99 ? "99+" : errors);
      } else {
        toolsButton.removeAttribute("badge");
      }
      menuButton.toggleAttribute("checked", KoiDevMode.hasSwitches(browser));
      // Only a web page has anything to inspect; Koi's empty state is chrome.
      const { scheme } = browser.currentURI;
      const inert = scheme != "http" && scheme != "https" && scheme != "file";
      toolsButton.toggleAttribute("disabled", inert);
      menuButton.toggleAttribute("disabled", inert);
    };

    const render = () => {
      toggle.toggleAttribute("pressed", KoiDevMode.enabled);
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
      // None in chromeless windows.
      if (window.toolbar.visible) {
        delayedStartupPromise.then(build);
      }
    },
    { once: true }
  );
})();
