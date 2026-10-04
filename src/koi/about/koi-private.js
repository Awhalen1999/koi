/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* about:privatebrowsing can open in any window (typed, linked), so the page
 * claims privacy only in a private one. AboutPrivateBrowsingChild exports
 * RPMIsWindowPrivate before this runs, in the privileged about process. */
/* global RPMIsWindowPrivate */

if (!RPMIsWindowPrivate()) {
  document.documentElement.classList.add("normal");
}
