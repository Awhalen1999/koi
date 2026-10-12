/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Instant scrolling in an agent's background tabs. Firefox hands a page's
 * smooth scrolls to the compositor (ScrollContainerFrame.cpp, ScrollToImpl),
 * which only animates the tab on screen, so in a background tab a smooth
 * scroll never moves: a nav link updates the address and the page stays at
 * the top. While a tab is the agent's, Koi makes its smooth scrolls instant,
 * so the page lands where the site meant it to. A user sheet overrides CSS
 * scroll-behavior (anchor links), and the scroll methods take "smooth" as
 * "instant" (scripted navigation); anything else passes through. Undone when
 * the tab stops being the agent's, or the user is looking at it.
 *
 * koi-agents.js asks a tab's top document for it (getActor, then a
 * message), so the actor exists only in the agent's tabs: nothing runs in
 * the user's. Registered by KoiAgentTabs.sys.mjs. */

const SHEET =
  "data:text/css," +
  encodeURIComponent("* { scroll-behavior: auto !important; }");

const METHODS = ["scroll", "scrollTo", "scrollBy"];
const OPTIONS = ["top", "left", "block", "inline", "container"];

/** The parent side only carries koi-agents.js's messages. */
export class KoiAgentPageParent extends JSWindowActorParent {}

/** Makes the page's smooth scrolls instant on "Instant", undoes it on "Smooth". */
export class KoiAgentPageChild extends JSWindowActorChild {
  #undo = [];

  receiveMessage({ name }) {
    if (name == "Instant") {
      this.#instant();
    } else {
      this.#restore();
    }
  }

  didDestroy() {
    this.#undo = [];
  }

  #instant() {
    const win = this.contentWindow;
    if (this.#undo.length || !win) {
      return;
    }
    win.windowUtils.loadSheetUsingURIString(SHEET, win.windowUtils.USER_SHEET);
    this.#undo.push(() =>
      win.windowUtils.removeSheetUsingURIString(
        SHEET,
        win.windowUtils.USER_SHEET
      )
    );

    // A smooth request becomes the same request, instant: options are copied
    // into the page as a fresh object, the rest of the arguments as given.
    const instant = options => {
      if (options?.behavior != "smooth") {
        return options;
      }
      const copy = { behavior: "instant" };
      for (const key of OPTIONS) {
        if (options[key] !== undefined) {
          copy[key] = options[key];
        }
      }
      return Cu.cloneInto(copy, win);
    };
    const targets = [
      [win, METHODS],
      [win.Element.prototype, [...METHODS, "scrollIntoView"]],
    ];
    for (const [target, names] of targets) {
      const page = Cu.waiveXrays(target);
      for (const name of names) {
        const native = target[name];
        const before = Object.getOwnPropertyDescriptor(page, name);
        Cu.exportFunction(
          function (options, ...rest) {
            return native.call(this, instant(options), ...rest);
          },
          target,
          { defineAs: name }
        );
        this.#undo.push(() => {
          if (before) {
            Object.defineProperty(page, name, before);
          } else {
            delete page[name];
          }
        });
      }
    }
  }

  #restore() {
    for (const undo of this.#undo.splice(0)) {
      undo();
    }
  }
}
