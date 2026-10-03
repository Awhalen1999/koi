/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Developer mode's error count, the content side. Registered by
 * KoiDevMode.sys.mjs for tabs' top documents only, so third-party frames do
 * not inflate a page's count. Reports each uncaught error and unhandled
 * promise rejection; the parent keeps the count.
 */
export class KoiPageErrorsChild extends JSWindowActorChild {
  handleEvent(event) {
    // A failed image or script load is a plain `error` Event on its element;
    // only a script error is an ErrorEvent, and only it carries a message.
    if (event.type == "error" && typeof event.message != "string") {
      return;
    }
    this.sendAsyncMessage("PageError");
  }
}
