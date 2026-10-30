# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Koi's words for Firefox's panels and menus. A message stands in for the
# Firefox message it is named after (koi- in front), with the same arguments
# and attributes; koi-strings.js points the element at it. Actions and
# titles are in Title Case, as macOS writes menus; descriptions, status
# lines and checkbox labels in sentence case. "Folder" is Koi's word for a
# tab group. Two messages are Koi's own: koi-appmenu-sign-in and
# koi-folder-closes-tabs.

## App menu (browser/appmenu.ftl, browser/browser.ftl)

koi-appmenuitem-fullscreen =
    .label = Full Screen
koi-appmenuitem-help-and-report =
    .label = Help
koi-appmenu-help-and-report-header =
    .title = Help
koi-appmenu-sign-in = Sign In to Sync
koi-appmenu-recently-closed-tabs =
    .label = Recently Closed Tabs
koi-appmenu-recently-closed-windows =
    .label = Recently Closed Windows
koi-appmenu-search-history =
    .label = Search History
koi-appmenu-restore-session =
    .label = Restore Previous Session
koi-appmenu-clear-history =
    .label = Clear Recent History…
koi-appmenu-recent-history-subheader = Recent History
koi-appmenu-manage-history =
    .label = Manage History
koi-bookmarks-subview-bookmark-tab =
    .label = Bookmark This Tab…
koi-bookmarks-search =
    .label = Search Bookmarks
koi-bookmarks-tools-toolbar-visibility-panel =
    .label =
        { $isVisible ->
            [true] Hide Bookmarks Toolbar
           *[other] Show Bookmarks Toolbar
        }
koi-bookmarks-recent-bookmarks-panel-subheader = Recent Bookmarks
koi-bookmarks-manage-bookmarks =
    .label = Manage Bookmarks
koi-appmenu-developer-tools-subheader = Browser Tools
koi-appmenu-developer-tools-extensions =
    .label = Extensions for Developers
koi-appmenu-get-help =
    .label = Get Help
    .accesskey = h
koi-appmenu-help-more-troubleshooting-info =
    .label = More Troubleshooting Information
    .accesskey = t
koi-appmenu-help-share-ideas =
    .label = Share Ideas and Feedback…
    .accesskey = S
koi-appmenu-help-switch-device =
    .label = Switching to a New Device
koi-appmenu-help-report-deceptive-site =
    .label = Report Deceptive Site…
    .accesskey = d
koi-appmenu-help-not-deceptive =
    .label = This Isn’t a Deceptive Site…
    .accesskey = d
koi-appmenu-help-exit-troubleshoot-mode =
    .label = Turn Troubleshoot Mode Off
    .accesskey = M

## Site information (browser/browser.ftl)

koi-identity-site-information = { $host }
koi-identity-header-security-with-host =
    .title = Connection Security for { $host }
koi-identity-clear-site-data =
    .label = Clear Cookies and Site Data…
koi-identity-more-info-link-text =
    .label = More Information

## Bookmark editor (browser/browser.ftl, browser/editBookmarkOverlay.ftl)

koi-bookmarks-add-bookmark = Bookmark Added
koi-bookmarks-edit-bookmark = Edit Bookmark
koi-bookmark-panel-cancel =
    .label = Remove
    .accesskey = R
koi-bookmark-panel-remove =
    .label =
        { $count ->
            [1] Remove
           *[other] Remove { $count } Bookmarks
        }
    .accesskey = R
koi-bookmark-panel-save-button =
    .label = Done
koi-bookmark-panel-show-editor-checkbox =
    .label = Show this editor when saving
    .accesskey = S
koi-bookmark-overlay-location-2 =
    .value = Folder
    .accesskey = F

## Folders (browser/tabbrowser.ftl, browser/tabContextMenu.ftl)

koi-tab-group-editor-title-create = New Folder
koi-tab-group-editor-title-edit = Edit Folder
koi-tab-group-editor-name-field =
    .placeholder = Name
koi-tab-group-editor-color-selector =
    .aria-label = Folder color
koi-tab-group-editor-action-new-tab =
    .label = New Tab in Folder
koi-tab-group-editor-action-new-window =
    .label = Move Folder to New Window
koi-tab-group-editor-action-copy-links =
    .label =
        { $linkCount ->
            [1] Copy Link
           *[other] Copy { $linkCount } Links
        }
koi-tab-group-editor-action-ungroup =
    .label = Ungroup Tabs
koi-tab-group-editor-action-delete =
    .label = Delete Folder
koi-folder-closes-tabs =
    { $tabCount ->
        [1] Closes 1 tab
       *[other] Closes { $tabCount } tabs
    }
koi-tab-context-move-tab-to-new-group =
    .label =
        { $tabCount ->
            [1] Add Tab to New Folder
           *[other] Add Tabs to New Folder
        }
    .accesskey = F
koi-tab-context-move-tab-to-group =
    .label =
        { $tabCount ->
            [1] Add Tab to Folder
           *[other] Add Tabs to Folder
        }
    .accesskey = F
koi-tab-context-new-group =
    .label = New Folder…
    .accesskey = N
koi-tab-context-ungroup-tab =
    .label =
        { $groupCount ->
            [1] Remove from Folder
           *[other] Remove from Folders
        }
    .accesskey = R
koi-tab-context-unnamed-group =
    .label = Unnamed Folder

## Downloads and extensions (browser/downloads.ftl, browser/unifiedExtensions.ftl, browser/originControls.ftl)

koi-downloads-history =
    .label = Show All Downloads
    .accesskey = S
koi-unified-extensions-manage-extensions =
    .label = Manage Extensions
koi-unified-extensions-item-message-manage = Manage Extension
koi-origin-controls-state-always-on = Can read and change this site
koi-origin-controls-state-when-clicked = Asks to read and change this site
koi-origin-controls-state-no-access = Can’t read or change this site
