/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const ConsoleAPIStorage = Cc["@mozilla.org/consoleAPI-storage;1"].getService(
  Ci.nsIConsoleAPIStorage
);

/**
 * Developer mode's error count, the content side. Registered by
 * KoiDevMode.sys.mjs for tabs' top documents only, so third-party frames do
 * not inflate a page's count. Reports each uncaught error, unhandled promise
 * rejection and console.error(); the parent keeps the count.
 */
export class KoiPageErrorsChild extends JSWindowActorChild {
  #pending = 0;
  #destroyed = false;

  actorCreated() {
    // The storage's listeners hear every console in the process, so each
    // page picks out its own, as the devtools do (console-api.js).
    const page = this.manager.innerWindowId;
    this.onConsoleEvent = ({ innerID, level }) => {
      if (innerID === page && level == "error") {
        this.#report();
      }
    };
    ConsoleAPIStorage.addLogEventListener(
      this.onConsoleEvent,
      Services.scriptSecurityManager.getSystemPrincipal()
    );
  }

  didDestroy() {
    this.#destroyed = true;
    ConsoleAPIStorage.removeLogEventListener(this.onConsoleEvent);
  }

  // One message per task, however many errors it raised: a loop that logs a
  // thousand costs the main process one message and one badge update.
  #report() {
    if (this.#pending++) {
      return;
    }
    Services.tm.dispatchToMainThread(() => {
      if (!this.#destroyed) {
        this.sendAsyncMessage("PageErrors", this.#pending);
      }
      this.#pending = 0;
    });
  }

  handleEvent(event) {
    switch (event.type) {
      case "DOMDocElementInserted":
        // Only here to create the actor.
        return;
      case "error":
        // A failed image or script load is a plain `error` Event on its
        // element; only a script error is an ErrorEvent, and only it carries
        // a message.
        if (typeof event.message != "string") {
          return;
        }
        break;
    }
    this.#report();
  }
}
