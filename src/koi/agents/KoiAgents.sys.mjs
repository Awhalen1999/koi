/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Agent Connect, the app-wide half (koi-agents.js is each window's).
 *
 * A coding agent works in Koi's tabs through Mozilla's firefox-devtools-mcp,
 * which drives the two remote-control servers Firefox can start at runtime
 * (RemoteControlServers.sys.mjs, allowed by agents.yaml). The machinery is
 * Firefox's; this module decides when it runs and who may use it:
 *   - Allow agents is a setting (ENABLED_PREF). Once on, the servers wait for
 *     agents until the user turns it off, and start again at launch unless
 *     Koi was launched for automation. A runtime start leaves the profile's
 *     prefs alone (WebDriverBiDi.sys.mjs start), so waiting costs browsing
 *     nothing.
 *   - Ports: Marionette takes a free port and writes it to
 *     ~/.firefox-devtools-mcp/instances/<pid>.port, where the connector's
 *     --lookup-marionette-port finds it. The Remote Agent always takes 9222
 *     (RemoteAgent.sys.mjs has no pref for it). Either server force-quits the
 *     app when its port is taken (Marionette.sys.mjs init, RemoteAgent.sys.mjs
 *     #listen), so 9222 is checked first and Marionette is given port 0.
 *   - Asking: Firefox asks before any session it was not launched for
 *     (ConnectionPrompt.sys.mjs), in a modal window; its show() is replaced
 *     by Koi's prompt, asked for every new connection. Firefox allows one
 *     session and refuses a second before asking (WebDriverBiDi.sys.mjs
 *     createSession), so agents take turns. After Don't Allow, Koi refuses
 *     without asking for DENY_MS: an agent may retry at once.
 *   - Connected is any session on the servers. It ends when the agent quits,
 *     when the connector drops it after 30 idle minutes (it reconnects, and
 *     is asked again, on its next call), or on Disconnect.
 *
 * Windows listen on "koi-agents" (state changed) and answer the prompt
 * through window.gKoiAgents.ask(). */

import { BrowserWindowTracker } from "resource:///modules/BrowserWindowTracker.sys.mjs";
import { RemoteControlServers } from "moz-src:///browser/components/remotecontrol/RemoteControlServers.sys.mjs";
import { RemoteAgent } from "chrome://remote/content/components/RemoteAgent.sys.mjs";
import {
  ConnectionPrompt,
  ConnectionPromptResult,
} from "chrome://remote/content/shared/webdriver/ConnectionPrompt.sys.mjs";

const ENABLED_PREF = "koi.agents.enabled";
const MARIONETTE_PORT_PREF = "marionette.port";
const REMOTE_AGENT_PORT = 9222;
const DENY_MS = 60 * 1000;

// What an agent runs to reach Koi. The developer preset adds the console and
// network tools to the connector's default set.
const SERVER = [
  "npx",
  "-y",
  "@mozilla/firefox-devtools-mcp",
  "--connect-existing",
  "--lookup-marionette-port",
  "--tool-preset",
  "developer",
];

// Claude Code's own installer, then Homebrew's prefixes. A shell's PATH is not
// an app's, so Koi looks where these put it.
const HOME = Services.dirsvc.get("Home", Ci.nsIFile).path;
const CLAUDE_PATHS = [
  PathUtils.join(HOME, ".local", "bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
];
const CLAUDE_CONFIG = PathUtils.join(HOME, ".claude.json");

function portFree(port) {
  const socket = Cc["@mozilla.org/network/server-socket;1"].createInstance(
    Ci.nsIServerSocket
  );
  try {
    socket.initSpecialConnection(port, Ci.nsIServerSocket.LoopbackOnly, 1);
    socket.close();
    return true;
  } catch {
    return false;
  }
}

const notify = () => Services.obs.notifyObservers(null, "koi-agents");

// Launched for automation (--marionette, --remote-debugging-port), a server
// already runs for it, and Koi's would put its sessions behind the prompt.
// Read before Koi's own start, which would also set it.
const LAUNCHED_FOR_AUTOMATION = RemoteControlServers.enabled;

let connectedAt = 0;
let deniedAt = -Infinity;
let problem = null;
let queue = Promise.resolve();

RemoteControlServers.addListener(() => {
  const { connected } = KoiAgents;
  if (connected != !!connectedAt) {
    connectedAt = connected ? Date.now() : 0;
  }
  notify();
});

const firefoxShow = ConnectionPrompt.show;
ConnectionPrompt.show = async function () {
  if (Date.now() - deniedAt < DENY_MS) {
    return ConnectionPromptResult.DENY;
  }
  // The frontmost window with a toolbar: popups have no agents UI. With no
  // window open (macOS keeps running), Firefox's own modal asks.
  const win = BrowserWindowTracker.getTopWindow();
  if (!win?.gKoiAgents) {
    return firefoxShow.call(this);
  }
  if (await win.gKoiAgents.ask()) {
    return ConnectionPromptResult.ALLOW;
  }
  deniedAt = Date.now();
  return ConnectionPromptResult.DENY;
};

async function startServers() {
  if (!portFree(REMOTE_AGENT_PORT)) {
    problem = "port";
    return;
  }
  // Marionette saves the port it bound into its pref (server.sys.mjs
  // TCPListener.start), so the profile's own value goes back afterwards.
  const savedPort = Services.prefs.prefHasUserValue(MARIONETTE_PORT_PREF)
    ? Services.prefs.getIntPref(MARIONETTE_PORT_PREF)
    : null;
  Services.prefs.setIntPref(MARIONETTE_PORT_PREF, 0);
  try {
    await RemoteControlServers.start();
    problem = null;
  } catch (e) {
    console.error(e);
    problem = "error";
    // A failed start can leave one server up.
    await RemoteControlServers.stop();
  } finally {
    if (savedPort === null) {
      Services.prefs.clearUserPref(MARIONETTE_PORT_PREF);
    } else {
      Services.prefs.setIntPref(MARIONETTE_PORT_PREF, savedPort);
    }
  }
}

async function stopServers() {
  problem = null;
  await RemoteControlServers.stop();
}

// One start or stop at a time, each reading the setting when its turn comes,
// so a quick off-and-on ends where the switch does.
function sync() {
  queue = queue
    .then(() => {
      if (!KoiAgents.enabled) {
        return stopServers();
      }
      return KoiAgents.listening ? null : startServers();
    })
    .catch(console.error)
    .finally(notify);
  return queue;
}

export const KoiAgents = {
  setup: SERVER.join(" "),

  /** Allow agents: the user's setting. */
  get enabled() {
    return Services.prefs.getBoolPref(ENABLED_PREF, false);
  },

  /** True while the servers are up, waiting for an agent or serving one. */
  get listening() {
    return RemoteControlServers.runningDynamically;
  },

  /** True while an agent's session is open. */
  get connected() {
    return this.listening && RemoteControlServers.hasActiveSession;
  },

  /** When the agent connected (ms since epoch), or 0. */
  get connectedAt() {
    return connectedAt;
  },

  /**
   * Why the servers are down although enabled: "port" (9222 is taken) or
   * "error".
   */
  get problem() {
    return problem;
  },

  /** @param {boolean} on Turns Allow agents on or off. */
  setEnabled(on) {
    Services.prefs.setBoolPref(ENABLED_PREF, on);
    return sync();
  },

  /** Starts or stops the servers to match the setting, as after a problem. */
  sync,

  /**
   * At launch: starts the servers if the setting is on, unless Koi was
   * launched for automation.
   */
  resume() {
    return LAUNCHED_FOR_AUTOMATION ? Promise.resolve() : sync();
  },

  /** Ends the agent's session. The servers keep waiting for the next. */
  disconnect() {
    RemoteAgent.webDriverBiDi?.deleteSession();
  },

  /** @returns {Promise<string|null>} Claude Code's executable, if installed. */
  async claudePath() {
    for (const dir of CLAUDE_PATHS) {
      const path = PathUtils.join(dir, "claude");
      if (await IOUtils.exists(path)) {
        return path;
      }
    }
    return null;
  },

  /** @returns {Promise<boolean>} Whether Claude Code already knows Koi. */
  async claudeHasKoi() {
    try {
      return !!(await IOUtils.readJSON(CLAUDE_CONFIG)).mcpServers?.koi;
    } catch {
      return false;
    }
  },

  /** @returns {Promise<boolean>} Whether `claude mcp add` succeeded. */
  async addToClaude() {
    const command = await this.claudePath();
    if (!command) {
      return false;
    }
    const { Subprocess } = ChromeUtils.importESModule(
      "resource://gre/modules/Subprocess.sys.mjs"
    );
    // An npm-installed claude runs under node, which the app's PATH lacks.
    const proc = await Subprocess.call({
      command,
      arguments: ["mcp", "add", "--scope", "user", "koi", "--", ...SERVER],
      environment: { PATH: `${CLAUDE_PATHS.join(":")}:/usr/bin:/bin` },
      environmentAppend: true,
    });
    const { exitCode } = await proc.wait();
    return exitCode === 0;
  },
};
