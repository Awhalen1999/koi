/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Koi's words in Firefox's panels and menus (koi.ftl), with no patch.
 * Firefox's strings stay as they are; an element Koi rewords is pointed at
 * Koi's message instead, named koi-<Firefox's id> with the same arguments,
 * so Fluent writes Koi's words however often Firefox sets the id back (the
 * tab menu and the folder editor do on every open). Redefining Firefox's
 * ids was tried and dropped: a message defined twice in one bundle is an
 * error in the console, and the order resources join a bundle is a hash
 * set's; a second copy of a Firefox file in a source of higher priority
 * left every other message in that file unresolved.
 *
 * koi.ftl reaches Fluent through a file source of Koi's own in the
 * registry, one per process, and as a resource of this window's document.
 * Elements are repointed as a popup or panel view opens, which is when
 * Firefox sets theirs, and again once a popup is shown, for an id Firefox
 * sets after opening (the folder editor's Copy Links); a view holds its
 * showing until the translation lands (PanelMultiView's blocker), so no
 * Firefox word shows first. The app menu's
 * sign-in row has no id (browser-sync.js writes its text), so its text is
 * written here. */

(() => {
  const DIR = "chrome://browser/content/koi-strings/";
  // Firefox's ids that koi.ftl rewords.
  const REWORDED = new Set([
    "appmenuitem-fullscreen",
    "appmenuitem-help-and-report",
    "appmenu-help-and-report-header",
    "appmenu-recently-closed-tabs",
    "appmenu-recently-closed-windows",
    "appmenu-search-history",
    "appmenu-restore-session",
    "appmenu-clear-history",
    "appmenu-recent-history-subheader",
    "appmenu-manage-history",
    "bookmarks-subview-bookmark-tab",
    "bookmarks-search",
    "bookmarks-tools-toolbar-visibility-panel",
    "bookmarks-recent-bookmarks-panel-subheader",
    "bookmarks-manage-bookmarks",
    "appmenu-developer-tools-subheader",
    "appmenu-developer-tools-extensions",
    "appmenu-get-help",
    "appmenu-help-more-troubleshooting-info",
    "appmenu-help-share-ideas",
    "appmenu-help-switch-device",
    "appmenu-help-report-deceptive-site",
    "appmenu-help-not-deceptive",
    "appmenu-help-exit-troubleshoot-mode",
    "identity-site-information",
    "identity-header-security-with-host",
    "identity-clear-site-data",
    "identity-more-info-link-text",
    "bookmarks-add-bookmark",
    "bookmarks-edit-bookmark",
    "bookmark-panel-cancel",
    "bookmark-panel-remove",
    "bookmark-panel-save-button",
    "bookmark-panel-show-editor-checkbox",
    "bookmark-overlay-location-2",
    "tab-group-editor-title-create",
    "tab-group-editor-title-edit",
    "tab-group-editor-name-field",
    "tab-group-editor-color-selector",
    "tab-group-editor-action-new-tab",
    "tab-group-editor-action-new-window",
    "tab-group-editor-action-copy-links",
    "tab-group-editor-action-ungroup",
    "tab-group-editor-action-delete",
    "tab-context-move-tab-to-new-group",
    "tab-context-move-tab-to-group",
    "tab-context-new-group",
    "tab-context-ungroup-tab",
    "tab-context-unnamed-group",
    "downloads-history",
    "unified-extensions-manage-extensions",
    "unified-extensions-item-message-manage",
    "origin-controls-state-always-on",
    "origin-controls-state-when-clicked",
    "origin-controls-state-no-access",
  ]);

  const registry = L10nRegistry.getInstance();
  if (!registry.hasSource("koi")) {
    registry.registerSources([
      new L10nFileSource(
        "koi",
        "app",
        Services.locale.appLocalesAsBCP47,
        DIR,
        {},
        [DIR + "koi.ftl"]
      ),
    ]);
  }
  document.l10n.addResourceIds([{ path: "koi.ftl", optional: true }]);
  const strings = new Localization([{ path: "koi.ftl", optional: true }], true);

  const reword = root => {
    for (const element of root.querySelectorAll(
      "[data-l10n-id], [data-lazy-l10n-id]"
    )) {
      const id =
        element.getAttribute("data-l10n-id") ??
        element.getAttribute("data-lazy-l10n-id");
      if (REWORDED.has(id)) {
        element.removeAttribute("data-lazy-l10n-id");
        const args = element.getAttribute("data-l10n-args");
        document.l10n.setAttributes(
          element,
          `koi-${id}`,
          args ? JSON.parse(args) : undefined
        );
      }
    }
  };

  for (const type of ["popupshowing", "popupshown"]) {
    document.addEventListener(type, event => reword(event.target));
  }
  document.addEventListener("ViewShowing", event => {
    const view = event.target;
    reword(view);
    if (
      view.id == "appMenu-mainView" &&
      !view.querySelector("#appMenu-fxa-status2").hasAttribute("fxastatus")
    ) {
      view.querySelector("#appMenu-header-description").value =
        strings.formatValueSync("koi-appmenu-sign-in");
    }
    event.detail.addBlocker(document.l10n.translateFragment(view));
  });
})();
