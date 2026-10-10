/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Agent Connect, the app-wide half (koi-agents.js is each window's).
 *
 * A coding agent works in Koi's tabs through Mozilla's firefox-devtools-mcp,
 * which drives the two remote-control servers Firefox can start at runtime
 * (RemoteControlServers.sys.mjs, allowed by agents.yaml). The machinery is
 * Firefox's; this module decides when it runs and who may use it:
 *   - On: the user's switch. Marionette takes a free port and writes it to
 *     ~/.firefox-devtools-mcp/instances/<pid>.port, where the connector's
 *     --lookup-marionette-port finds it. The Remote Agent always takes 9222
 *     (RemoteAgent.sys.mjs has no pref for it). Either server force-quits the
 *     app when its port is taken (Marionette.sys.mjs init, RemoteAgent.sys.mjs
 *     #listen), so 9222 is checked first and Marionette is given port 0.
 *   - Asking: Firefox asks before any session it was not launched for
 *     (ConnectionPrompt.sys.mjs), in a modal window. Its show() is replaced
 *     by Koi's prompt in the window in front. Don't Allow also turns access
 *     off, so a connector that retries cannot ask again.
 *   - Off: when the agent disconnects, after IDLE_MS with no agent, and at
 *     quit, where Firefox stops both servers and removes the port file.
 *
 * Windows listen on "koi-agents" (state changed) and "koi-agents-off" (data:
 * why access turned itself off), and answer the prompt through
 * window.gKoiAgents.ask(). */

import { clearTimeout, setTimeout } from "resource://gre/modules/Timer.sys.mjs";
import { RemoteControlServers } from "moz-src:///browser/components/remotecontrol/RemoteControlServers.sys.mjs";
import {
  ConnectionPrompt,
  ConnectionPromptResult,
} from "chrome://remote/content/shared/webdriver/ConnectionPrompt.sys.mjs";

const REMEMBER_PREF = "koi.agents.allowed-on";
const MARIONETTE_PORT_PREF = "marionette.port";
const REMOTE_AGENT_PORT = 9222;
const IDLE_MS = 15 * 60 * 1000;

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

const today = () => new Date().toDateString();

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

// A session that begins while access is on is the agent's; its end turns
// access off. Sessions that began earlier (a browser launched for automation)
// are not.
let sessionActive = RemoteControlServers.hasActiveSession;
let agentSession = false;
let connectedAt = 0;
let idleTimer;

RemoteControlServers.addListener(() => {
  const active = RemoteControlServers.hasActiveSession;
  if (active && !sessionActive && KoiAgents.enabled) {
    agentSession = true;
    connectedAt = Date.now();
    clearTimeout(idleTimer);
  } else if (!active && sessionActive && agentSession) {
    KoiAgents.stop("disconnected");
  }
  sessionActive = active;
  Services.obs.notifyObservers(null, "koi-agents");
});

const firefoxShow = ConnectionPrompt.show;
ConnectionPrompt.show = async function () {
  if (Services.prefs.getStringPref(REMEMBER_PREF, "") == today()) {
    return ConnectionPromptResult.ALLOW;
  }
  const win = Services.wm.getMostRecentBrowserWindow();
  if (!win?.gKoiAgents) {
    return firefoxShow.call(this);
  }
  const { allow, remember } = await win.gKoiAgents.ask();
  if (!allow) {
    // Once the refusal has reached the connector.
    setTimeout(() => KoiAgents.stop(), 1000);
    return ConnectionPromptResult.DENY;
  }
  if (remember) {
    Services.prefs.setStringPref(REMEMBER_PREF, today());
  }
  return ConnectionPromptResult.ALLOW;
};

export const KoiAgents = {
  setup: SERVER.join(" "),

  get enabled() {
    return RemoteControlServers.runningDynamically;
  },

  get connected() {
    return this.enabled && agentSession && sessionActive;
  },

  /** When the agent connected (ms since epoch); meaningful while connected. */
  get connectedAt() {
    return connectedAt;
  },

  async start() {
    if (this.enabled) {
      return;
    }
    if (!portFree(REMOTE_AGENT_PORT)) {
      Services.obs.notifyObservers(null, "koi-agents-off", "port");
      return;
    }
    // Marionette saves the port it bound into its pref (server.sys.mjs
    // TCPListener.start), so the profile's own value goes back afterwards.
    const savedPort = Services.prefs.prefHasUserValue(MARIONETTE_PORT_PREF)
      ? Services.prefs.getIntPref(MARIONETTE_PORT_PREF)
      : null;
    Services.prefs.setIntPref(MARIONETTE_PORT_PREF, 0);
    agentSession = false;
    try {
      await RemoteControlServers.start();
    } finally {
      if (savedPort === null) {
        Services.prefs.clearUserPref(MARIONETTE_PORT_PREF);
      } else {
        Services.prefs.setIntPref(MARIONETTE_PORT_PREF, savedPort);
      }
    }
    idleTimer = setTimeout(() => this.stop("idle"), IDLE_MS);
  },

  /**
   * @param {string} [reason]
   *     Why access turned itself off: "disconnected" or "idle". None when the
   *     user turned it off.
   */
  async stop(reason) {
    clearTimeout(idleTimer);
    if (!this.enabled) {
      return;
    }
    agentSession = false;
    await RemoteControlServers.stop();
    if (reason) {
      Services.obs.notifyObservers(null, "koi-agents-off", reason);
    }
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
