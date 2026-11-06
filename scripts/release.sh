#!/bin/bash
# Builds Koi for release and makes the DMG people download, signed with the
# Developer ID, notarized and stapled, at dist/koi.dmg: Zen's macOS release
# workflow, run on this Mac. Needs the Developer ID certificate in the login
# keychain, the notarytool profile `koi` (xcrun notarytool store-credentials)
# and ~/.koi-keys/safebrowsing.dat, without which the build silently ships
# with phishing and malware protection off.
#
# production-without-restricted leaves out the entitlements Apple has to grant
# first (passkeys through Touch ID, and the app identifier a provisioning
# profile carries); signed with them ungranted, the app would not work.
set -euo pipefail
IDENTITY="Developer ID Application: Alexander Whalen (TA2LQ3B5QN)"
cd "$(dirname "$0")/.."
DMG="$PWD/dist/koi.dmg"
export KOI_RELEASE=1

[ -f ~/.koi-keys/safebrowsing.dat ] || { echo "Missing ~/.koi-keys/safebrowsing.dat" >&2; exit 1; }
npm run build
cd engine
# config.mk's -object_path_lto drops a few links' LTO objects in the source
# dir, where nothing reads them and git status lists them.
rm -rf .lto.o
./mach package

# Sign the app out of the DMG mach made, then make the DMG again around it.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
./mach python -m mozbuild.action.unpack_dmg "objdir-release/dist/koi-$(cat browser/config/version.txt).en-US.mac.dmg" "$TMP/dmg"
./mach macos-sign -c release -e production-without-restricted -s "$IDENTITY" -a "$TMP/dmg/Koi.app"

# The app gets its own ticket, unlike Zen's, so it opens offline once it has
# left the DMG (Apple's syspolicy_check calls a missing one fatal).
ditto -c -k --keepParent "$TMP/dmg/Koi.app" "$TMP/koi.zip"
xcrun notarytool submit "$TMP/koi.zip" --keychain-profile koi --wait
xcrun stapler staple "$TMP/dmg/Koi.app"

# `codesign --strict` fails on the app inside: hdiutil's HFS image gives every
# file an empty Finder record. Gatekeeper accepts it, and Zen ships the same.
mkdir -p "$(dirname "$DMG")"
./mach python -m mozbuild.action.make_dmg --volume-name Koi \
  --background browser/branding/release/background.png \
  --icon browser/branding/release/firefox.icns \
  --dsstore browser/branding/release/dsstore \
  "$TMP/dmg" "$DMG"
codesign -s "$IDENTITY" "$DMG"
xcrun notarytool submit "$DMG" --keychain-profile koi --wait
xcrun stapler staple "$DMG"
spctl -a -t open --context context:primary-signature -v "$DMG"
