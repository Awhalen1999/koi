/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser-window globals (koi/ is outside eslint.config.mjs's browser-window
 * paths). */
/* global MozXULElement, delayedStartupPromise, gBrowserInit, FullScreen */

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
 *     Koi's icon: Allow or Don't Allow, asked again for every new session.
 *   - "Agent" at the end of the address field while one is connected; it
 *     opens the panel.
 * Built after delayed startup, once koi-devmode.js has placed its buttons. */

(() => {
  const XHTML = "http://www.w3.org/1999/xhtml";

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
      <panel id="koi-agents-prompt" type="arrow" orient="vertical" class="panel-no-padding" aria-label="Allow an agent to use Koi?">
        <html:div class="koi-agents-body">
          <html:div class="koi-agents-join">
            <html:span class="koi-agents-tile"/>
            <html:span class="koi-agents-dots"/>
            <html:img class="koi-agents-koi" src="chrome://branding/content/about-logo-private.png" srcset="chrome://branding/content/about-logo-private@2x.png 2x" alt=""/>
          </html:div>
          <html:span class="koi-agents-title">Allow an agent to use Koi?</html:span>
          <html:span class="koi-agents-note">It can use your open tabs, read their console and network, and run scripts until it disconnects.</html:span>
          <html:div class="koi-agents-choices">
            <html:button class="koi-agents-allow">Allow</html:button>
            <html:button class="koi-agents-deny">Don’t Allow</html:button>
          </html:div>
        </html:div>
      </panel>
    `);
    const panel = fragment.getElementById("koi-agents-panel");
    const prompt = fragment.getElementById("koi-agents-prompt");
    const toggle = panel.querySelector(".koi-agents-switch");
    const stateLabel = panel.querySelector(".koi-agents-state");
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
    button.setAttribute("label", "Agents");
    button.setAttribute("tooltiptext", "Agents");
    button.addEventListener("command", () =>
      panel.openPopup(button, "bottomright topright")
    );
    document.getElementById("unified-extensions-button").before(button);

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

    label.addEventListener("click", () =>
      panel.openPopup(label, "bottomright topright")
    );

    // The prompt -----------------------------------------------------------
    // Closing it any other way than Allow refuses: Escape, a click outside,
    // the window closing, or access turning off (render).

    let allowed;
    const answerPrompt = allow => {
      allowed = allow;
      prompt.hidePopup();
    };
    prompt
      .querySelector(".koi-agents-allow")
      .addEventListener("click", () => answerPrompt(true));
    prompt
      .querySelector(".koi-agents-deny")
      .addEventListener("click", () => answerPrompt(false));

    window.gKoiAgents = {
      /** @returns {Promise<boolean>} Whether the user allowed it. */
      async ask() {
        allowed = false;
        panel.hidePopup();
        const answered = new Promise(resolve => {
          const done = new AbortController();
          const answer = () => {
            done.abort();
            resolve(allowed);
          };
          const { signal } = done;
          prompt.addEventListener("popuphidden", answer, { signal });
          addEventListener("unload", answer, { signal });
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
        // this window comes forward first, and the panel waits a frame past
        // "activate", which fires before macOS has made it key.
        const active = Services.focus.activeWindow;
        if (active && active != window) {
          const activated = new Promise(resolve => {
            addEventListener("activate", resolve, { once: true });
            setTimeout(resolve, 1000);
          });
          window.focus();
          await activated;
          await new Promise(requestAnimationFrame);
        }
        prompt.openPopup(button, "bottomright topright");
        // Bounces the Dock icon when the agent's terminal is in front.
        window.getAttention();
        return answered;
      },
    };

    // Rendering. The window follows the module's state; it holds none.

    const render = () => {
      const { enabled, listening, connected, problem } = KoiAgents;
      if (!listening) {
        prompt.hidePopup();
      }
      button.hidden = !KoiDevMode.enabled && !enabled;
      label.hidden = !connected;
      toggle.pressed = enabled;
      let state = "off";
      if (connected) {
        state = "connected";
        // Read when the panel opens; it does not tick while open.
        const minutes = Math.floor(
          (Date.now() - KoiAgents.connectedAt) / 60000
        );
        since.textContent = minutes ? `${minutes} min` : "just now";
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
