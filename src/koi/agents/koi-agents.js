/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser-window globals (koi/ is outside eslint.config.mjs's browser-window
 * paths). */
/* global MozXULElement, delayedStartupPromise, gBrowser, gBrowserInit, FullScreen, PrivateBrowsingUtils, TabContextMenu, BrowsingContext */

/* Agent Connect, each window's half (KoiAgents.sys.mjs is the app's):
 *   - Its own button in row one, after ⚒, on every page: shown with
 *     Developer Mode on (☰, KoiDevMode.enabled) and whenever Allow agents is
 *     on. It is a setting, so the button has no pressed state.
 *   - The agents panel, a short list in the app menu's grammar: the Allow
 *     agents switch, then what it is (while off) or the status (Waiting,
 *     Connected with Disconnect, or why it could not start, with Try Again);
 *     then Claude Code added in one click (its own `claude mcp add`) and Copy
 *     setup for any other agent.
 *   - Koi's prompt before each connection (gKoiAgents.ask, called by the
 *     module), a macOS permission alert under the agent's glyph joined to
 *     Koi's icon: Allow or Don't Allow, for every new connection. It stays
 *     up until answered; with Koi in the background, a macOS notification
 *     says it is waiting.
 *   - "Agent" at the end of the address field on the agent's tabs while one
 *     is connected; it opens the steps.
 *   - The steps (kept by KoiAgentSteps.sys.mjs): its last six, or all, each
 *     opening the tab it happened in, from the label or the folder chip's
 *     menu. While it acts on the tab on screen, the page card takes a ring
 *     and an input action a tag where it lands, for a beat.
 *   - The agent's folder (KoiAgentTabs.sys.mjs), drawn by koi-agents.css: a
 *     folder like any other, except that its chip has a menu of its own
 *     instead of Firefox's editor (nothing to edit) and shows the live dot
 *     while an agent is connected. The panel counts its tabs and shows the
 *     folder; "Share with Agent" in the tab menu moves a tab in or back out,
 *     and the folder leads the "Add Tab to Folder" list. While an agent is
 *     connected its tabs stay awake, and tabs its pages open stay in the
 *     background.
 * Built after delayed startup, once koi-devmode.js has placed its buttons. */

(() => {
  const XHTML = "http://www.w3.org/1999/xhtml";
  const el = (tag, className, text = "") => {
    const node = document.createElementNS(XHTML, tag);
    node.className = className;
    node.textContent = text;
    return node;
  };

  // The panel's [state]: off, ready, connected, or KoiAgents.problem.
  const STATES = {
    ready: "Waiting",
    connected: "Connected",
    port: "Port 9222 in use",
    error: "Couldn’t start",
  };

  const CLAUDE_NOTES = {
    found: "",
    added: "Added",
    missing: "Not installed",
    failed: "Couldn’t add",
  };

  function build() {
    const { KoiAgents } = ChromeUtils.importESModule(
      "chrome://browser/content/koi-agents/KoiAgents.sys.mjs"
    );
    const { KoiAgentTabs } = ChromeUtils.importESModule(
      "chrome://browser/content/koi-agents/KoiAgentTabs.sys.mjs"
    );
    const { KoiAgentSteps } = ChromeUtils.importESModule(
      "chrome://browser/content/koi-agents/KoiAgentSteps.sys.mjs"
    );
    const { KoiDevMode } = ChromeUtils.importESModule(
      "chrome://browser/content/koi-devmode/KoiDevMode.sys.mjs"
    );

    const fragment = MozXULElement.parseXULToFragment(`
      <panel id="koi-agents-panel" type="arrow" orient="vertical" class="panel-no-padding" aria-label="Agents">
        <html:div class="koi-agents-body">
          <html:span class="koi-agents-heading">Access</html:span>
          <html:moz-toggle class="koi-agents-switch" label="Allow agents" inputlayout="inline-end"/>
          <html:span class="koi-agents-caption">Lets coding agents on this Mac use your tabs. Stays on until you turn it off, and Koi asks before each agent connects.</html:span>
          <html:div class="koi-agents-row koi-agents-status">
            <html:span class="koi-agents-name">Status</html:span>
            <html:span class="koi-agents-dot"/>
            <html:span class="koi-agents-state"/>
            <html:span class="koi-agents-since"/>
            <html:button class="koi-agents-retry">Try Again</html:button>
          </html:div>
          <html:button class="koi-agents-disconnect">Disconnect</html:button>
          <html:div class="koi-agents-row koi-agents-tabs">
            <html:span class="koi-agents-name">Agent folder</html:span>
            <html:span class="koi-agents-tab-count"/>
            <html:button class="koi-agents-show">Show</html:button>
          </html:div>
          <html:div class="koi-agents-row">
            <html:span class="koi-agents-name">This tab</html:span>
            <html:button class="koi-agents-share"/>
          </html:div>
          <toolbarseparator/>
          <html:span class="koi-agents-heading">Agents</html:span>
          <html:div class="koi-agents-row koi-agents-claude">
            <html:img class="koi-agents-icon" src="chrome://browser/content/koi-agents/claude-code.png" alt=""/>
            <html:span class="koi-agents-name">Claude Code</html:span>
            <html:span class="koi-agents-claude-note"/>
            <html:button class="koi-agents-add">Add</html:button>
          </html:div>
          <html:div class="koi-agents-row">
            <html:span class="koi-agents-icon koi-agents-icon-other"/>
            <html:span class="koi-agents-name">Other agents</html:span>
            <html:button class="koi-agents-copy">Copy setup</html:button>
          </html:div>
        </html:div>
      </panel>
      <panel id="koi-agents-prompt" type="arrow" orient="vertical" class="panel-no-padding" noautohide="true" aria-label="Allow an agent to use Koi?">
        <html:div class="koi-agents-body">
          <html:div class="koi-agents-join">
            <html:span class="koi-agents-tile"/>
            <html:span class="koi-agents-dots"/>
            <html:img class="koi-agents-koi" src="chrome://branding/content/about-logo-private.png" srcset="chrome://branding/content/about-logo-private@2x.png 2x" alt=""/>
          </html:div>
          <html:span class="koi-agents-title">Allow an agent to use Koi?</html:span>
          <html:span class="koi-agents-note">It works in a folder of its own, and any tab you share, and can read their console and network until it disconnects.</html:span>
          <html:div class="koi-agents-choices">
            <html:button class="koi-agents-allow">Allow</html:button>
            <html:button class="koi-agents-deny">Don’t Allow</html:button>
          </html:div>
        </html:div>
      </panel>
      <panel id="koi-agents-steps" type="arrow" orient="vertical" class="panel-no-padding" aria-label="Agent steps">
        <html:div class="koi-agents-body">
          <html:div class="koi-steps-head">
            <html:span class="koi-steps-tile"/>
            <html:span class="koi-steps-who">
              <html:span class="koi-steps-name">Agent</html:span>
              <html:span class="koi-steps-note"/>
            </html:span>
          </html:div>
          <html:div class="koi-steps-list"/>
          <html:span class="koi-steps-empty">No steps yet.</html:span>
          <html:span class="koi-steps-kept">Koi keeps the last 500 steps until it quits.</html:span>
          <toolbarseparator/>
          <html:div class="koi-steps-foot">
            <html:button class="koi-steps-more"/>
            <html:button class="koi-steps-close-tabs">Close Tabs</html:button>
            <html:button class="koi-steps-disconnect">Disconnect</html:button>
          </html:div>
        </html:div>
      </panel>
      <menupopup id="koi-agents-folder-menu">
        <menuitem class="koi-agents-show-steps" label="Show Steps"/>
        <menuitem class="koi-agents-open-panel" label="Open Agents Panel"/>
        <menuitem class="koi-agents-share-current" label="Share Current Tab"/>
        <menuitem class="koi-agents-close-tabs" label="Close Tabs"/>
        <menuseparator/>
        <menuitem class="koi-agents-disconnect-item" label="Disconnect"/>
      </menupopup>
    `);
    const panel = fragment.getElementById("koi-agents-panel");
    const folderMenu = fragment.getElementById("koi-agents-folder-menu");
    const steps = fragment.getElementById("koi-agents-steps");
    const stepsNote = steps.querySelector(".koi-steps-note");
    const stepsList = steps.querySelector(".koi-steps-list");
    const stepsKept = steps.querySelector(".koi-steps-kept");
    const stepsEmpty = steps.querySelector(".koi-steps-empty");
    const stepsMore = steps.querySelector(".koi-steps-more");
    const stepsDisconnect = steps.querySelector(".koi-steps-disconnect");
    const prompt = fragment.getElementById("koi-agents-prompt");
    const toggle = panel.querySelector(".koi-agents-switch");
    const stateLabel = panel.querySelector(".koi-agents-state");
    const since = panel.querySelector(".koi-agents-since");
    const claudeRow = panel.querySelector(".koi-agents-claude");
    const addButton = panel.querySelector(".koi-agents-add");
    const copyButton = panel.querySelector(".koi-agents-copy");
    const tabsRow = panel.querySelector(".koi-agents-tabs");
    const tabCount = panel.querySelector(".koi-agents-tab-count");
    const showButton = panel.querySelector(".koi-agents-show");
    const shareButton = panel.querySelector(".koi-agents-share");
    document.getElementById("mainPopupSet").append(fragment);

    const label = el("button", "", "Agent");
    label.id = "koi-agents-label";
    label.hidden = true;
    document.getElementById("page-action-buttons").append(label);

    // skipintoolbarset keeps CustomizableUI from managing it, as ⚒.
    const button = document.createXULElement("toolbarbutton");
    button.id = "koi-agents-button";
    button.className = "toolbarbutton-1 chromeclass-toolbar-additional";
    button.setAttribute("skipintoolbarset", "true");
    button.setAttribute(
      "image",
      "chrome://browser/content/koi-agents/koi-agent.svg"
    );
    button.setAttribute("label", "Agents");
    button.setAttribute("tooltiptext", "Agents");
    button.addEventListener("command", () =>
      panel.openPopup(button, "bottomright topright")
    );
    document.getElementById("unified-extensions-button").before(button);

    // The panel ------------------------------------------------------------

    // How long the agent has been connected, read when shown; it does not
    // tick while a panel is open.
    const connectedFor = () => {
      const minutes = Math.floor((Date.now() - KoiAgents.connectedAt) / 60000);
      return minutes ? `${minutes} min` : "just now";
    };

    const setClaude = status => {
      claudeRow.setAttribute("status", status);
      claudeRow.querySelector(".koi-agents-claude-note").textContent =
        CLAUDE_NOTES[status];
    };

    panel.addEventListener("popupshowing", async event => {
      if (event.target != panel) {
        return;
      }
      render();
      if (!(await KoiAgents.claudePath())) {
        setClaude("missing");
      } else {
        setClaude((await KoiAgents.claudeHasKoi()) ? "added" : "found");
      }
    });

    toggle.addEventListener("toggle", () =>
      KoiAgents.setEnabled(toggle.pressed).catch(console.error)
    );
    panel
      .querySelector(".koi-agents-retry")
      .addEventListener("click", () => KoiAgents.sync());
    panel
      .querySelector(".koi-agents-disconnect")
      .addEventListener("click", () => KoiAgents.disconnect());
    showButton.addEventListener("click", () => {
      const group = KoiAgentTabs.group(window);
      if (group) {
        group.collapsed = false;
        gBrowser.selectedTab = group.tabs[0];
      }
    });
    shareButton.addEventListener("click", () => {
      const tab = gBrowser.selectedTab;
      KoiAgentTabs.share(tab, !KoiAgentTabs.is(tab));
      render();
    });

    // The folder ----------------------------------------------------------

    const strip = gBrowser.tabContainer;
    const isAgentChip = node =>
      gBrowser.isTabGroupLabel(node) && node.group.hasAttribute("koi-agent");

    // The chip: Koi's menu instead of Firefox's editor. Capture, ahead of
    // Firefox's listener on the label.
    strip.addEventListener(
      "contextmenu",
      event => {
        if (isAgentChip(event.target)) {
          event.preventDefault();
          event.stopPropagation();
          folderMenu.openPopupAtScreen(event.screenX, event.screenY, true);
        }
      },
      true
    );
    folderMenu.addEventListener("popupshowing", () => {
      folderMenu.querySelector(".koi-agents-show-steps").disabled =
        !KoiAgentSteps.list.length;
      folderMenu.querySelector(".koi-agents-share-current").disabled =
        KoiAgentTabs.is(gBrowser.selectedTab);
      folderMenu.querySelector(".koi-agents-disconnect-item").disabled =
        !KoiAgents.connected;
    });
    folderMenu.addEventListener("command", event => {
      const action = event.target.className;
      if (action == "koi-agents-show-steps") {
        const chip =
          KoiAgentTabs.group(window)?.querySelector(".tab-group-label");
        openSteps(chip ?? button);
      } else if (action == "koi-agents-open-panel") {
        panel.openPopup(button, "bottomright topright");
      } else if (action == "koi-agents-share-current") {
        KoiAgentTabs.share(gBrowser.selectedTab);
      } else if (action == "koi-agents-close-tabs") {
        KoiAgentTabs.closeAll();
      } else if (action == "koi-agents-disconnect-item") {
        KoiAgents.disconnect();
      }
    });

    // The tab menu: "Share with Agent" after "Add Tab to Folder", present
    // while Allow agents is on and the window is not private. Firefox lays
    // the menu out from a list of its items on first show and refuses one it
    // does not know (MenuSectionLayout), so the item is added after that and
    // taken out again when the menu closes. In the "Add Tab to Folder" list
    // the folder comes first, in the agent's blue.
    const tabMenu = document.getElementById("tabContextMenu");
    const shareItem = document.createXULElement("menuitem");
    shareItem.id = "koi-agents-share-item";
    shareItem.addEventListener("command", () => {
      const tabs = TabContextMenu.contextTabs;
      const on = !tabs.every(KoiAgentTabs.is, KoiAgentTabs);
      for (const tab of tabs) {
        KoiAgentTabs.share(tab, on);
      }
    });
    tabMenu.addEventListener("popupshowing", event => {
      if (event.target != tabMenu) {
        return;
      }
      TabContextMenu._ensureMenuArranged(tabMenu);
      if (!KoiAgents.enabled || PrivateBrowsingUtils.isWindowPrivate(window)) {
        return;
      }
      const tabs = TabContextMenu.contextTabs;
      const back = tabs.every(KoiAgentTabs.is, KoiAgentTabs);
      shareItem.setAttribute(
        "label",
        back ? "Take Back from Agent" : "Share with Agent"
      );
      document.getElementById("context_moveTabToGroup").after(shareItem);
    });
    tabMenu.addEventListener("popuphidden", event => {
      if (event.target == tabMenu) {
        shareItem.remove();
      }
    });
    document
      .getElementById("context_moveTabToGroupPopupMenu")
      .addEventListener("popupshowing", event => {
        const group = KoiAgentTabs.group(window);
        const item =
          group && event.target.querySelector(`[tab-group-id="${group.id}"]`);
        if (item) {
          document
            .getElementById("open-tab-groups-separator-upper")
            .after(item);
          item.style.setProperty("--tab-group-color", "var(--koi-agent)");
        }
      });

    addButton.addEventListener("click", async () => {
      addButton.disabled = true;
      setClaude((await KoiAgents.addToClaude()) ? "added" : "failed");
      addButton.disabled = false;
    });

    copyButton.addEventListener("click", () => {
      Cc["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Ci.nsIClipboardHelper)
        .copyString(KoiAgents.setup);
      copyButton.textContent = "Copied";
      setTimeout(() => (copyButton.textContent = "Copy setup"), 1500);
    });

    label.addEventListener("click", () => openSteps(label));

    // The steps --------------------------------------------------------------
    // Newest first: the last RECENT, or all of them. Read when the popover
    // opens and again as steps arrive while it is open; times do not tick.

    const RECENT = 6;
    let showAll = false;
    const ago = at => {
      const seconds = Math.round((Date.now() - at) / 1000);
      if (seconds < 5) {
        return "now";
      }
      if (seconds < 60) {
        return `${seconds}s`;
      }
      const minutes = Math.round(seconds / 60);
      return minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
    };
    // The tab a step happened in, wherever it is now; gone if it closed.
    const tabOf = browserId => {
      if (!browserId) {
        return null;
      }
      const browser =
        BrowsingContext.getCurrentTopByBrowserId(browserId)?.embedderElement;
      return browser?.documentGlobal.gBrowser?.getTabForBrowser(browser);
    };
    const stepRow = step => {
      const row = el("button", "koi-steps-row");
      const icon = el("img", "koi-steps-icon");
      icon.src = step.icon;
      icon.alt = "";
      const words = step.count > 1 ? `${step.text} ×${step.count}` : step.text;
      const tab = tabOf(step.browserId);
      const favicon = el("img", "koi-steps-favicon");
      favicon.alt = "";
      favicon.hidden = !tab;
      if (tab) {
        favicon.src =
          tab.getAttribute("image") ||
          "chrome://global/skin/icons/defaultFavicon.svg";
      }
      row.append(
        icon,
        el("span", "koi-steps-text", words),
        favicon,
        el("span", "koi-steps-when", ago(step.at))
      );
      row.addEventListener("click", () => {
        if (tab?.isConnected) {
          tab.documentGlobal.gBrowser.selectedTab = tab;
          tab.documentGlobal.focus();
        }
        steps.hidePopup();
      });
      return row;
    };
    const renderSteps = () => {
      const all = KoiAgentSteps.list;
      const { connected } = KoiAgents;
      if (connected) {
        const tabs = KoiAgentTabs.all.length;
        stepsNote.textContent = `Connected ${connectedFor()} · ${tabs} ${tabs == 1 ? "tab" : "tabs"} in its folder`;
      } else {
        stepsNote.textContent = `Disconnected · ${all.length} ${all.length == 1 ? "step" : "steps"}`;
      }
      const shown = (showAll ? all : all.slice(-RECENT)).toReversed();
      stepsList.replaceChildren(...shown.map(stepRow));
      stepsList.toggleAttribute("all", showAll);
      stepsEmpty.hidden = !!all.length;
      stepsKept.hidden = !showAll;
      stepsMore.hidden = !showAll && all.length <= RECENT;
      stepsMore.textContent = showAll ? "Recent" : `All ${all.length} steps`;
      stepsDisconnect.hidden = !connected;
    };
    const openSteps = anchor => {
      showAll = false;
      panel.hidePopup();
      steps.openPopup(anchor, "bottomright topright");
    };
    steps.addEventListener("popupshowing", event => {
      if (event.target == steps) {
        renderSteps();
      }
    });
    stepsMore.addEventListener("click", () => {
      showAll = !showAll;
      renderSteps();
    });
    steps
      .querySelector(".koi-steps-close-tabs")
      .addEventListener("click", () => KoiAgentTabs.closeAll());
    stepsDisconnect.addEventListener("click", () => KoiAgents.disconnect());
    const stepsObserver = {
      observe: () => steps.state == "open" && renderSteps(),
    };
    Services.obs.addObserver(stepsObserver, "koi-agent-steps");

    // The moment it acts -----------------------------------------------------
    // A ring around the page card for RING after its last step, and, for an
    // input action, a tag on the element for TAG, drawn by the chrome over
    // the page (koi-agents.css): nothing is added to the page itself. Only
    // on the tab on screen. Steps that touch no element (a screenshot, a
    // read) keep the ring up and leave the tag where it is: an agent's click
    // is usually followed at once by a look, which would otherwise wipe the
    // tag before it is seen.

    const RING = 1500;
    const TAG = 2000;
    const touch = el("div", "koi-agent-touch");
    const touchBox = el("div", "koi-agent-touch-box");
    const touchTag = el("span", "koi-agent-touch-tag");
    touchBox.append(touchTag);
    touch.append(touchBox);
    let lit = null;
    let ringTimer = 0;
    let tagTimer = 0;
    const unlight = () => {
      lit?.removeAttribute("koi-agent-acting");
      lit = null;
    };

    /**
     * Called by KoiAgentSteps.sys.mjs as each step lands.
     *
     * @param {MozTabbrowserTab} tab
     * @param {{kind: string, rect: ?object}} [touchOf] An input action's
     *   kind and the box it lands on, in the page's CSS pixels.
     */
    const touched = (tab, touchOf) => {
      if (!tab.selected) {
        return;
      }
      const browser = tab.linkedBrowser;
      const card = browser.closest(".browserSidebarContainer");
      if (card != lit) {
        unlight();
        lit = card;
      }
      lit?.setAttribute("koi-agent-acting", "");
      clearTimeout(ringTimer);
      ringTimer = setTimeout(unlight, RING);
      const rect = touchOf?.rect;
      if (rect) {
        const zoom = browser.fullZoom;
        Object.assign(touchBox.style, {
          left: `${rect.left * zoom}px`,
          top: `${rect.top * zoom}px`,
          width: `${rect.width * zoom}px`,
          height: `${rect.height * zoom}px`,
        });
        // Below the element when there is no room above it.
        touchBox.toggleAttribute("below", rect.top * zoom < 36);
        touchTag.textContent = `Agent · ${touchOf.kind}`;
        browser.closest(".browserStack")?.append(touch);
        touch.setAttribute("shown", "");
        clearTimeout(tagTimer);
        tagTimer = setTimeout(() => touch.removeAttribute("shown"), TAG);
      }
    };

    // The prompt -----------------------------------------------------------
    // noautohide keeps it up through clicks elsewhere and app switches
    // (without it, a switch to Koi closes it, which reads as Don't Allow), so
    // it ends with an answer: Allow, or Don't Allow and Escape. Otherwise only
    // the window closing or access turning off (render) ends it, which refuses
    // that one connection without holding off the next.

    const ALERT = "koi-agents-prompt";
    const alerts = Cc["@mozilla.org/alerts-service;1"].getService(
      Ci.nsIAlertsService
    );
    let answer;
    const answerPrompt = allow => {
      answer = allow;
      prompt.hidePopup();
    };
    prompt
      .querySelector(".koi-agents-allow")
      .addEventListener("click", () => answerPrompt(true));
    prompt
      .querySelector(".koi-agents-deny")
      .addEventListener("click", () => answerPrompt(false));
    prompt.addEventListener("keydown", event => {
      if (event.key == "Escape") {
        answerPrompt(false);
      }
    });

    window.gKoiAgents = {
      touched,

      /**
       * @returns {Promise<boolean|null>} true for Allow, false for Don't
       *   Allow, null when the prompt ended unanswered.
       */
      async ask() {
        answer = null;
        panel.hidePopup();
        const answered = new Promise(resolve => {
          const done = new AbortController();
          const finish = () => {
            done.abort();
            alerts.closeAlert(ALERT);
            resolve(answer);
          };
          const { signal } = done;
          prompt.addEventListener("popuphidden", finish, { signal });
          addEventListener("unload", finish, { signal });
        });
        // The prompt hangs off the button, which shows while Allow agents is
        // on but not in fullscreen: page fullscreen ends, as for Firefox's
        // permission prompts, and window fullscreen reveals the toolbar.
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
        if (window.fullScreen) {
          FullScreen.showNavToolbox();
        }
        // A panel opened while another of Koi's windows is active (a popup,
        // a dialog) rolls up at once, unseen, which reads as Don't Allow. So
        // this window comes forward first, and the panel waits a beat past
        // "activate", which fires before macOS has made it key. A timer, not
        // a frame: an occluded window gets no frames.
        const active = Services.focus.activeWindow;
        if (active && active != window) {
          const activated = new Promise(resolve => {
            addEventListener("activate", resolve, { once: true });
            setTimeout(resolve, 1000);
          });
          window.focus();
          await activated;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        prompt.openPopup(button, "bottomright topright");
        // With another app in front (no active window), the agent's caller
        // would wait on a prompt nobody sees: the Dock icon bounces, and a
        // notification brings Koi forward to it. The only one Koi sends,
        // for something the user started.
        if (!Services.focus.activeWindow) {
          window.getAttention();
          const alert = Cc["@mozilla.org/alert-notification;1"].createInstance(
            Ci.nsIAlertNotification
          );
          alert.init(
            ALERT,
            "",
            "Allow an agent to use Koi?",
            "Click to answer.",
            true
          );
          alerts.showAlert(alert, (subject, topic) => {
            if (topic == "alertclickcallback") {
              window.focus();
            }
          });
        }
        return answered;
      },
    };

    // Awake tabs. A background tab is hidden to its page: Firefox pauses its
    // animation frames and throttles its timers, which froze scrolling and
    // transitions in the agent's tabs and kept state out of its screenshots.
    // While an agent is connected its tabs are made active the way the tab
    // on screen is (docShellIsActive; BrowsingContext.isActive alone left
    // frames paused, since a tab that renders no layers gets no refresh
    // ticks). That costs a rendered layer per agent tab, only while an agent
    // is connected. The tab switcher turns a tab off when the user leaves
    // it, so this runs again after each switch (TabSwitchDone).
    const awake = new WeakSet();
    // Smooth scrolls never move in a background tab, so an awake tab's are
    // made instant (KoiAgentPage.sys.mjs), again after each navigation.
    const scrolling = (tab, instant) => {
      try {
        tab.linkedBrowser.browsingContext?.currentWindowGlobal
          ?.getActor("KoiAgentPage")
          .sendAsyncMessage(instant ? "Instant" : "Smooth");
      } catch {
        // A document the actor does not run in (about:blank, a chrome page).
      }
    };
    const wake = connected => {
      for (const tab of gBrowser.tabs) {
        const browser = tab.linkedBrowser;
        if (!browser?.browsingContext) {
          continue;
        }
        // Read the tab's own state: the switcher may have turned it off.
        if (connected && !tab.selected && KoiAgentTabs.is(tab)) {
          if (!awake.has(tab)) {
            awake.add(tab);
            scrolling(tab, true);
          }
          if (!browser.docShellIsActive) {
            browser.docShellIsActive = true;
          }
        } else if (awake.delete(tab)) {
          scrolling(tab, false);
          if (!tab.selected) {
            browser.docShellIsActive = false;
          }
        }
      }
    };
    gBrowser.addTabsProgressListener({
      onLocationChange(browser, webProgress, request, location, flags) {
        const tab = gBrowser.getTabForBrowser(browser);
        if (
          webProgress.isTopLevel &&
          !(flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT) &&
          awake.has(tab)
        ) {
          scrolling(tab, true);
        }
      },
    });

    // A tab an agent's page opens (a target="_blank" link, window.open)
    // stays in the background, as the agent's own do: Firefox brings such
    // tabs forward (browser.tabs.loadDivertedInBackground,
    // BrowserDOMWindow.sys.mjs). It lands in the agent's folder already,
    // since Firefox puts a related tab in its opener's group.
    const { addTab } = gBrowser;
    gBrowser.addTab = function (uri, options = {}) {
      const opener =
        options.openerBrowser && this.getTabForBrowser(options.openerBrowser);
      if (KoiAgentTabs.is(opener)) {
        options = { ...options, inBackground: true };
      }
      return addTab.call(this, uri, options);
    };

    // Rendering. The window follows the module's state; it holds none.

    const render = () => {
      const { enabled, listening, connected, problem } = KoiAgents;
      // Turned off under an open prompt: the agent is refused.
      if (!listening) {
        prompt.hidePopup();
      }
      button.hidden = !KoiDevMode.enabled && !enabled;
      const onAgentTab = KoiAgentTabs.is(gBrowser.selectedTab);
      label.hidden = !connected || !onAgentTab;
      toggle.pressed = enabled;
      const tabs = KoiAgentTabs.all.length;
      tabsRow.hidden = !tabs;
      tabCount.textContent = tabs;
      const group = KoiAgentTabs.group(window);
      showButton.disabled = !group;
      group?.toggleAttribute("koi-live", connected);
      wake(connected);
      shareButton.textContent = onAgentTab ? "Take Back" : "Share This Tab";
      let state = "off";
      if (connected) {
        state = "connected";
        since.textContent = connectedFor();
      } else if (enabled) {
        state = problem ?? "ready";
      }
      panel.setAttribute("state", state);
      stateLabel.textContent = STATES[state] ?? "";
    };

    const observer = { observe: render };
    const TOPICS = ["koi-agents", "koi-devmode"];
    for (const topic of TOPICS) {
      Services.obs.addObserver(observer, topic);
    }
    for (const type of [
      "TabSelect",
      "TabOpen",
      "TabClose",
      "TabGroupCreate",
      "TabGrouped",
      "TabUngrouped",
    ]) {
      strip.addEventListener(type, render);
    }
    gBrowser.addEventListener("TabSwitchDone", render);
    addEventListener(
      "unload",
      () => {
        for (const topic of TOPICS) {
          Services.obs.removeObserver(observer, topic);
        }
        Services.obs.removeObserver(stepsObserver, "koi-agent-steps");
      },
      { once: true }
    );

    render();

    // Allow agents survives a restart. Firefox means a start to wait for the
    // window's idle tasks, but awaits the {promise, resolve} pair itself, which
    // does not wait (RemoteAgent.sys.mjs startAtRuntime). Every window asks;
    // the first starts and the rest find it running.
    gBrowserInit.idleTasksFinished.promise.then(() => KoiAgents.resume());
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
