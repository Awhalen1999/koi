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
 *   - The agents panel: the switch, Claude Code added in one click (its own
 *     `claude mcp add`), Copy Setup for any other agent, and Disconnect while
 *     one is connected.
 *   - Koi's prompt before each connection (gKoiAgents.ask, called by the
 *     module).
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
    found: "Found on this Mac",
    added: "Added",
    missing: "Not installed",
    failed: "Couldn’t add it. Use Copy Setup instead.",
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
          <html:div class="koi-agents-head">
            <html:div class="koi-agents-text">
              <html:span class="koi-agents-title">Let agents connect</html:span>
              <html:span class="koi-agents-note">A coding agent can work in your tabs, with your logins, console and network. Koi asks before each one connects.</html:span>
            </html:div>
            <html:moz-toggle class="koi-agents-switch" aria-label="Let agents connect"/>
          </html:div>
          <html:div class="koi-agents-status">
            <html:span>An agent is connected.</html:span>
            <html:button class="koi-agents-disconnect">Disconnect</html:button>
          </html:div>
          <html:div class="koi-agents-rows">
            <html:div class="koi-agents-row koi-agents-claude">
              <html:span class="koi-agents-tile">C</html:span>
              <html:div class="koi-agents-text">
                <html:span class="koi-agents-name">Claude Code</html:span>
                <html:span class="koi-agents-note koi-agents-claude-note"/>
              </html:div>
              <html:button class="koi-agents-add">Add</html:button>
            </html:div>
            <html:div class="koi-agents-row">
              <html:span class="koi-agents-tile koi-agents-tile-other"/>
              <html:div class="koi-agents-text">
                <html:span class="koi-agents-name">Another agent</html:span>
                <html:span class="koi-agents-note">Cursor, Codex and others</html:span>
              </html:div>
              <html:button class="koi-agents-copy">Copy Setup</html:button>
            </html:div>
          </html:div>
          <html:span class="koi-agents-ready">Ready. Ask your agent to look at the tab you’re on.</html:span>
        </html:div>
      </panel>
      <panel id="koi-agents-prompt" type="arrow" orient="vertical" class="panel-no-padding" aria-label="Allow an agent to use Koi?">
        <html:div class="koi-agents-body">
          <html:div class="koi-agents-head">
            <html:span class="koi-agents-glyph"/>
            <html:span class="koi-agents-title">Allow an agent to use Koi?</html:span>
          </html:div>
          <html:span class="koi-agents-note">It can see and use your tabs, read their console and network, and run scripts on their pages. Access turns off when it disconnects.</html:span>
          <html:label class="koi-agents-remember"><html:input type="checkbox"/>Don’t ask again today</html:label>
          <html:div class="koi-agents-actions">
            <html:button class="koi-agents-deny">Don’t Allow</html:button>
            <html:button class="koi-agents-allow">Allow</html:button>
          </html:div>
        </html:div>
      </panel>
    `);
    const panel = fragment.getElementById("koi-agents-panel");
    const prompt = fragment.getElementById("koi-agents-prompt");
    const toggle = panel.querySelector(".koi-agents-switch");
    const claudeRow = panel.querySelector(".koi-agents-claude");
    const addButton = panel.querySelector(".koi-agents-add");
    const copyButton = panel.querySelector(".koi-agents-copy");
    const remember = prompt.querySelector("input");
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
      claudeRow.querySelector(".koi-agents-claude-note").textContent =
        CLAUDE_NOTES[status];
    };

    panel.addEventListener("popupshowing", async event => {
      if (event.target != panel) {
        return;
      }
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
    const answerPrompt = allow => {
      answer = { allow, remember: allow && remember.checked };
      prompt.hidePopup();
    };
    prompt
      .querySelector(".koi-agents-allow")
      .addEventListener("click", () => answerPrompt(true));
    prompt
      .querySelector(".koi-agents-deny")
      .addEventListener("click", () => answerPrompt(false));

    window.gKoiAgents = {
      /** @returns {Promise<{allow: boolean, remember: boolean}>} */
      ask() {
        answer = { allow: false, remember: false };
        remember.checked = false;
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
