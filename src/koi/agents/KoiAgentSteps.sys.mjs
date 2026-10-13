/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The agent's steps: what it did, in words, for the steps panel
 * (koi-agents.js), and the moment it acts on a tab, for the page ring and
 * the "Click" tag.
 *
 * Every command reaches Firefox through one of two exported entry points,
 * which Koi wraps with no patch: Marionette looks up each handler with
 * GeckoDriver.prototype.getCommandHandler (driver.sys.mjs), and WebDriver
 * BiDi runs each command through WebDriverSession.prototype.execute
 * (Session.sys.mjs). Most commands are housekeeping (listing handles,
 * reading titles, switching contexts) and leave no step. An action becomes
 * one only once it succeeds, and a repeat of the step before it folds into
 * a count.
 *
 * Mozilla's connector (firefox-devtools-mcp) clicks, hovers and types with
 * input actions at viewport points, and reads the page with its own script
 * (window.__createSnapshot). Its helper scripts take a page element as an
 * argument (checking visibility, scrolling, focusing a field) and are left
 * out; a drag it fakes with script events is left out with them. A click's
 * or a field's name comes from the page before the action runs
 * (KoiAgentPage.sys.mjs, "Touch"), sent ahead of the command on the same
 * channel so it arrives first, and never awaited before it: the agent waits
 * for nothing.
 *
 * Steps are kept in memory for the life of the app, at most MAX, and start
 * over with each connection. Nothing is written to disk. */

import { GeckoDriver } from "chrome://remote/content/marionette/driver.sys.mjs";
import { NavigableManager } from "chrome://remote/content/shared/NavigableManager.sys.mjs";
import { WebDriverSession } from "chrome://remote/content/shared/webdriver/Session.sys.mjs";

const MAX = 500;

const ICONS = {
  open: "chrome://global/skin/icons/link.svg",
  click: "chrome://global/skin/icons/cursor-arrow.svg",
  type: "chrome://global/skin/icons/edit.svg",
  scroll: "chrome://global/skin/icons/arrow-down.svg",
  back: "chrome://browser/skin/back.svg",
  forward: "chrome://browser/skin/forward.svg",
  reload: "chrome://global/skin/icons/reload.svg",
  screenshot: "chrome://browser/skin/screenshot.svg",
  read: "chrome://browser/skin/reader-mode.svg",
  script: "chrome://global/skin/icons/developer.svg",
  tab: "chrome://browser/skin/new-tab.svg",
  close: "chrome://global/skin/icons/close.svg",
  dialog: "chrome://global/skin/icons/info.svg",
};

// WebDriver's codes for the keys an agent presses on their own; modifiers
// and printable characters are not named.
const KEYS = {
  "": "Backspace",
  "": "Tab",
  "": "Return",
  "": "Enter",
  "": "Escape",
  "": "Space",
  "": "Left",
  "": "Up",
  "": "Right",
  "": "Down",
  "": "Delete",
};

let steps = [];

const changed = () => Services.obs.notifyObservers(null, "koi-agent-steps");

// A place as a person reads it: host and path, or a file's name.
function place(url) {
  try {
    const { protocol, host, pathname } = new URL(url);
    const text =
      protocol == "file:"
        ? pathname.split("/").pop()
        : host + (pathname == "/" ? "" : pathname);
    return text.length > 48 ? text.slice(0, 47) + "…" : text;
  } catch {
    return url;
  }
}

// Adds a step, and tells the tab's window, which shows the page ring and,
// for an input action, the tag at the element if the tab is on screen.
function record(icon, text, context, touchOf = null) {
  const browserId = context?.top.browserId ?? 0;
  const last = steps.at(-1);
  if (last?.text == text && last.browserId == browserId) {
    last.count++;
    last.at = Date.now();
  } else {
    steps.push({ icon, text, browserId, count: 1, at: Date.now() });
    if (steps.length > MAX) {
      steps.shift();
    }
  }
  changed();
  const browser = context?.top.embedderElement;
  const tab = browser?.documentGlobal.gBrowser?.getTabForBrowser(browser);
  tab?.documentGlobal.gKoiAgents?.touched(tab, touchOf);
}

const contextOf = id =>
  id ? NavigableManager.getBrowsingContextById(id) : null;

// Reads an input-actions command: what it does, and the point it does it at.
function readActions(actions = []) {
  for (const source of actions) {
    const list = source.actions ?? [];
    if (source.type == "pointer") {
      const move = list.findLast(
        a => a.type == "pointerMove" && (a.origin ?? "viewport") == "viewport"
      );
      const pressed = list.some(a => a.type == "pointerDown");
      return {
        kind: pressed ? "Click" : "Hover",
        point: move && { x: move.x, y: move.y },
      };
    }
    if (source.type == "key") {
      const values = list.filter(a => a.type == "keyDown").map(a => a.value);
      const typed = values.some(v => !(v in KEYS) && v >= " " && v < "");
      if (typed) {
        return { kind: "Type", point: {} };
      }
      const keys = [...new Set(values.map(v => KEYS[v]).filter(Boolean))];
      return keys.length ? { kind: "Press", keys } : null;
    }
    if (source.type == "wheel") {
      return { kind: "Scroll" };
    }
  }
  return null;
}

// The step a command will make if it succeeds, as a function to call then,
// or null for housekeeping.
function plan(name, params, context) {
  switch (name) {
    case "WebDriver:Navigate":
    case "browsingContext.navigate":
      return () => record(ICONS.open, "Opened " + place(params.url), context);
    case "WebDriver:Back":
      return () => record(ICONS.back, "Went back", context);
    case "WebDriver:Forward":
      return () => record(ICONS.forward, "Went forward", context);
    case "browsingContext.traverseHistory":
      return params.delta < 0
        ? () => record(ICONS.back, "Went back", context)
        : () => record(ICONS.forward, "Went forward", context);
    case "WebDriver:Refresh":
    case "browsingContext.reload":
      return () => record(ICONS.reload, "Reloaded the page", context);
    case "WebDriver:NewWindow":
    case "browsingContext.create":
      return result =>
        record(
          ICONS.tab,
          "Opened a new tab",
          contextOf(result?.handle ?? result?.context)
        );
    case "WebDriver:CloseWindow":
    case "browsingContext.close":
      return () => record(ICONS.close, "Closed a tab");
    case "WebDriver:TakeScreenshot":
    case "WebDriver:TakeElementScreenshot":
    case "browsingContext.captureScreenshot":
      return () => record(ICONS.screenshot, "Took a screenshot", context);
    case "browsingContext.handleUserPrompt":
      return () => record(ICONS.dialog, "Answered a dialog", context);
    case "WebDriver:ExecuteScript":
    case "WebDriver:ExecuteAsyncScript":
      return () => record(ICONS.script, "Ran a script on the page", context);
    case "script.callFunction":
    case "script.evaluate": {
      const source = params.functionDeclaration ?? params.expression ?? "";
      if (source.includes("__createSnapshot")) {
        return () => record(ICONS.read, "Read the page", context);
      }
      const helper =
        source.includes("__resolveUid") ||
        params.arguments?.some(argument => argument?.sharedId);
      return helper
        ? null
        : () => record(ICONS.script, "Ran a script on the page", context);
    }
    case "WebDriver:ElementClick":
      return () => record(ICONS.click, "Clicked an element", context);
    case "WebDriver:ElementSendKeys":
      return () => record(ICONS.type, "Typed in a field", context);
    case "input.setFiles":
      return () => record(ICONS.type, "Chose a file to upload", context);
    case "WebDriver:PerformActions":
    case "input.performActions":
      return touch(readActions(params.actions), context);
  }
  return null;
}

// An input action: its words, and the element's name and box from the page.
function touch(action, context) {
  if (!action) {
    return null;
  }
  if (action.kind == "Press") {
    return () =>
      record(ICONS.type, "Pressed " + action.keys.join(", "), context);
  }
  if (action.kind == "Scroll") {
    return () => record(ICONS.scroll, "Scrolled the page", context);
  }
  // Asked now, ahead of the action, answered by the time it succeeds.
  let reply = null;
  if (action.point && context?.currentWindowGlobal) {
    try {
      reply = context.currentWindowGlobal
        .getActor("KoiAgentPage")
        .sendQuery("Touch", action.point)
        .catch(() => null);
    } catch {
      // A document the actor does not run in.
    }
  }
  const verb = { Click: "Clicked", Hover: "Hovered over", Type: "Typed in" }[
    action.kind
  ];
  const icon = action.kind == "Type" ? ICONS.type : ICONS.click;
  return async () => {
    const found = await reply;
    const what = found?.label ? `“${found.label}”` : "the page";
    // A frame's box is in its own viewport: only the top page's is drawn.
    const rect = context && context == context.top ? found?.rect : null;
    record(icon, `${verb} ${what}`, context, { kind: action.kind, rect });
  };
}

function run(name, params, context, command) {
  const step = plan(name, params, context);
  const result = command();
  if (step) {
    result.then(step, () => {});
  }
  if (name == "WebDriver:NewSession" || name == "session.new") {
    result.then(
      () => {
        steps = [];
        changed();
      },
      () => {}
    );
  }
  return result;
}

export const KoiAgentSteps = {
  /** Newest last; the panel reads, never writes. */
  get list() {
    return steps;
  },

  install() {
    const { getCommandHandler } = GeckoDriver.prototype;
    GeckoDriver.prototype.getCommandHandler = function (name) {
      const handler = getCommandHandler.call(this, name);
      return function (cmd) {
        // An agent works in content; a chrome-context session is a test
        // harness's, and leaves no steps.
        if (this.context != "content") {
          return handler.call(this, cmd);
        }
        let context = null;
        try {
          context = this.getBrowsingContext({ top: true });
        } catch {
          // No session or window yet (NewSession), or a closed one.
        }
        return run(name, cmd.parameters ?? {}, context, () =>
          Promise.resolve(handler.call(this, cmd))
        );
      };
    };

    const { execute } = WebDriverSession.prototype;
    WebDriverSession.prototype.execute = function (module, command, params) {
      const context = contextOf(params?.context ?? params?.target?.context);
      return run(`${module}.${command}`, params ?? {}, context, () =>
        execute.call(this, module, command, params)
      );
    };
  },
};
