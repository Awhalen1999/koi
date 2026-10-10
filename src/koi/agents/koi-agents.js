/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser-window globals (koi/ is outside eslint.config.mjs's browser-window
 * paths). */
/* global gNotificationBox, MozXULElement, delayedStartupPromise */

/* Agent Connect, each window's half (KoiAgents.sys.mjs is the app's):
 *   - Its own button in row one, after ⚒, on every page: shown with
 *     Developer Mode on (☰, KoiDevMode.enabled) and whenever access is on, so
 *     it can always be turned off. Checked while access is on.
 *   - The agents panel, two grouped lists in the System Settings idiom: the
 *     switch, with the connection (and Disconnect) or "waiting" under it;
 *     then Claude Code added in one click (its own `claude mcp add`) and Copy
 *     Setup for any other agent.
 *   - Koi's prompt before each connection (gKoiAgents.ask, called by the
 *     module): Allow Once, Allow for Today or Don't Allow.
 *   - "Agent" at the end of the address field while one is connected; it
 *     opens the panel.
 *   - A notification bar in the window in front when access turns itself off.
 * Built after delayed startup, once koi-devmode.js has placed its buttons. */

(() => {
  const XHTML = "http://www.w3.org/1999/xhtml";

  const OFF_MESSAGES = {
    disconnected: "The agent disconnected, so agent access is off.",
    idle: "No agent connected for 15 minutes, so agent access is off.",
    port: "Agent access couldn’t start: another app is using port 9222.",
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
    const { KoiDevMode } = ChromeUtils.importESModule(
      "chrome://browser/content/koi-devmode/KoiDevMode.sys.mjs"
    );

    const fragment = MozXULElement.parseXULToFragment(`
      <panel id="koi-agents-panel" type="arrow" orient="vertical" class="panel-no-padding" aria-label="Agents">
        <html:div class="koi-agents-body">
          <html:div class="koi-agents-group">
            <html:div class="koi-agents-row">
              <html:span class="koi-agents-tile"/>
              <html:span class="koi-agents-name">Agent Access</html:span>
              <html:moz-toggle class="koi-agents-switch" aria-label="Agent Access"/>
            </html:div>
            <html:div class="koi-agents-row koi-agents-connected">
              <html:span class="koi-agents-dot"/>
              <html:span class="koi-agents-name">Connected <html:span class="koi-agents-since"/></html:span>
              <html:button class="koi-agents-disconnect">Disconnect</html:button>
            </html:div>
            <html:div class="koi-agents-row koi-agents-ready">Waiting for an agent to connect</html:div>
          </html:div>
          <html:span class="koi-agents-footnote">A coding agent can use your tabs, with your logins, console and network. Koi asks before each one connects.</html:span>
          <html:span class="koi-agents-heading">Agents</html:span>
          <html:div class="koi-agents-group">
            <html:div class="koi-agents-row koi-agents-claude">
              <html:img class="koi-agents-icon" src="chrome://browser/content/koi-agents/claude-code.png" alt=""/>
              <html:span class="koi-agents-name">Claude Code</html:span>
              <html:span class="koi-agents-status"/>
              <html:button class="koi-agents-add">Add</html:button>
            </html:div>
            <html:div class="koi-agents-row">
              <html:span class="koi-agents-tile koi-agents-tile-other"/>
              <html:span class="koi-agents-name">Other Agents</html:span>
              <html:button class="koi-agents-copy">Copy Setup</html:button>
            </html:div>
          </html:div>
        </html:div>
      </panel>
      <panel id="koi-agents-prompt" type="arrow" orient="vertical" class="panel-no-padding" aria-label="Allow an agent to use Koi?">
        <html:div class="koi-agents-body">
          <html:div class="koi-agents-ask">
            <html:span class="koi-agents-tile"/>
            <html:div class="koi-agents-text">
              <html:span class="koi-agents-title">Allow an agent to use Koi?</html:span>
              <html:span class="koi-agents-note">It can use your tabs, console and network until it disconnects.</html:span>
            </html:div>
          </html:div>
          <html:div class="koi-agents-choices">
            <html:button class="koi-agents-allow">Allow Once</html:button>
            <html:button class="koi-agents-today">Allow for Today</html:button>
            <html:button class="koi-agents-deny">Don’t Allow</html:button>
          </html:div>
        </html:div>
      </panel>
    `);
    const panel = fragment.getElementById("koi-agents-panel");
    const prompt = fragment.getElementById("koi-agents-prompt");
    const toggle = panel.querySelector(".koi-agents-switch");
    const since = panel.querySelector(".koi-agents-since");
    const claudeRow = panel.querySelector(".koi-agents-claude");
    const addButton = panel.querySelector(".koi-agents-add");
    const copyButton = panel.querySelector(".koi-agents-copy");
    document.getElementById("mainPopupSet").append(fragment);

    const label = document.createElementNS(XHTML, "button");
    label.id = "koi-agents-label";
    label.textContent = "Agent";
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
    button.setAttribute("tooltiptext", "Agents");
    button.addEventListener("command", () =>
      panel.openPopup(button, "bottomright topright")
    );
    document.getElementById("unified-extensions-button").before(button);

    const setAccess = on =>
      (on ? KoiAgents.start() : KoiAgents.stop()).catch(console.error);

    // The panel ------------------------------------------------------------

    const setClaude = status => {
      claudeRow.setAttribute("status", status);
      claudeRow.querySelector(".koi-agents-status").textContent =
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

    toggle.addEventListener("toggle", () => setAccess(toggle.pressed));
    panel
      .querySelector(".koi-agents-disconnect")
      .addEventListener("click", () => setAccess(false));

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
      setTimeout(() => (copyButton.textContent = "Copy Setup"), 1500);
    });

    label.addEventListener("click", () =>
      panel.openPopup(label, "bottomright topright")
    );

    // The prompt -----------------------------------------------------------
    // Closing it any other way than Allow refuses.

    let answer;
    const CHOICES = {
      allow: { allow: true, remember: false },
      today: { allow: true, remember: true },
      deny: { allow: false, remember: false },
    };
    for (const [choice, value] of Object.entries(CHOICES)) {
      prompt
        .querySelector(`.koi-agents-${choice}`)
        .addEventListener("click", () => {
          answer = value;
          prompt.hidePopup();
        });
    }

    window.gKoiAgents = {
      /** @returns {Promise<{allow: boolean, remember: boolean}>} */
      ask() {
        answer = CHOICES.deny;
        panel.hidePopup();
        // The button shows while access is on, which a prompt needs.
        prompt.openPopup(button, "bottomright topright");
        // Bounces the Dock icon when the agent's terminal is in front.
        window.getAttention();
        return new Promise(resolve =>
          prompt.addEventListener("popuphidden", () => resolve(answer), {
            once: true,
          })
        );
      },
    };

    // Rendering. The window follows the module's state; it holds none.

    const render = () => {
      const { enabled, connected } = KoiAgents;
      button.hidden = !KoiDevMode.enabled && !enabled;
      button.toggleAttribute("checked", enabled);
      label.hidden = !connected;
      toggle.pressed = enabled;
      // Read when the panel opens; it does not tick while open.
      const minutes = Math.floor((Date.now() - KoiAgents.connectedAt) / 60000);
      since.textContent = minutes ? `· ${minutes} min` : "· just now";
      let state = "off";
      if (connected) {
        state = "connected";
      } else if (enabled) {
        state = "ready";
      }
      panel.setAttribute("state", state);
    };

    const observer = {
      observe(subject, topic, reason) {
        if (topic != "koi-agents-off") {
          render();
        } else if (window == Services.wm.getMostRecentBrowserWindow()) {
          gNotificationBox.appendNotification("koi-agents-off", {
            label: OFF_MESSAGES[reason],
            priority: gNotificationBox.PRIORITY_INFO_MEDIUM,
          });
        }
      },
    };
    const TOPICS = ["koi-agents", "koi-agents-off", "koi-devmode"];
    for (const topic of TOPICS) {
      Services.obs.addObserver(observer, topic);
    }
    addEventListener(
      "unload",
      () => {
        for (const topic of TOPICS) {
          Services.obs.removeObserver(observer, topic);
        }
      },
      { once: true }
    );

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
