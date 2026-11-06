#!/bin/bash
# Builds Koi for release and makes what people download: dist/koi.dmg for a
# new install, signed with the Developer ID, notarized and stapled, and
# dist/koi.mar for installed copies to update from, signed with Koi's update
# key, and dist/update.xml, the file update.koi.surf serves for it
# (koi-updates). Needs the Developer ID certificate in the login keychain, the
# notarytool profile `koi` (xcrun notarytool store-credentials), xz, and in
# ~/.koi-keys the update key and safebrowsing.dat, without which the build
# silently ships with phishing and malware protection off.
#
# production-without-restricted leaves out the entitlements Apple has to grant
# first (passkeys through Touch ID, and the app identifier a provisioning
# profile carries); signed with them ungranted, the app would not work.
set -euo pipefail
IDENTITY="Developer ID Application: Alexander Whalen (TA2LQ3B5QN)"
cd "$(dirname "$0")/.."
DMG="$PWD/dist/koi.dmg"
UPDATE="$PWD/dist/koi.mar"
MANIFEST="$PWD/dist/update.xml"
KEY=~/.koi-keys/mar/private_key.pem
export KOI_RELEASE=1

for f in ~/.koi-keys/safebrowsing.dat "$KEY"; do
  [ -f "$f" ] || { echo "Missing $f" >&2; exit 1; }
done
npm run build
cd engine
VERSION=$(cat browser/config/version.txt)
# config.mk's -object_path_lto drops a few links' LTO objects in the source
# dir, where nothing reads them and git status lists them.
rm -rf .lto.o
./mach package

# Sign the app out of the DMG mach made, then make the DMG again around it.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
./mach python -m mozbuild.action.unpack_dmg "objdir-release/dist/koi-$VERSION.en-US.mac.dmg" "$TMP/dmg"
./mach macos-sign -c release -e production-without-restricted -s "$IDENTITY" -a "$TMP/dmg/Koi.app"

# The app gets its own ticket, so it opens offline once it has left the DMG
# (Apple's syspolicy_check calls a missing one fatal).
ditto -c -k --keepParent "$TMP/dmg/Koi.app" "$TMP/koi.zip"
xcrun notarytool submit "$TMP/koi.zip" --keychain-profile koi --wait
xcrun stapler staple "$TMP/dmg/Koi.app"

# `codesign --strict` fails on the app inside: hdiutil's HFS image gives every
# file an empty Finder record. Gatekeeper accepts it.
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

# The update file is the same signed app in a MAR. signmar reads the key from
# an NSS database, which takes it with a certificate, so a throwaway one wraps
# it. Then it is checked against the certificate Koi's updater embeds.
MAR=objdir-release/dist/host/bin/mar MOZ_PRODUCT_VERSION="$VERSION" MAR_CHANNEL_ID=release \
  ./tools/update-packaging/make_full_update.sh -q "$TMP/koi.mar" "$TMP/dmg/Koi.app"
BIN=objdir-release/dist/bin
mkdir "$TMP/nss"
"$BIN/certutil" -N -d "$TMP/nss" --empty-password
openssl req -new -x509 -key "$KEY" -subj "/CN=Koi Update Signing" -days 1 -out "$TMP/cert.pem"
openssl pkcs12 -export -inkey "$KEY" -in "$TMP/cert.pem" -name koi -passout pass: -out "$TMP/key.p12"
"$BIN/pk12util" -i "$TMP/key.p12" -d "$TMP/nss" -W ''
"$BIN/signmar" -d "$TMP/nss" -n koi -s "$TMP/koi.mar" "$UPDATE"
"$BIN/signmar" -D toolkit/mozapps/update/updater/release_primary.der -v "$UPDATE"

# The update file is attached to the GitHub release tagged v$VERSION.
INI="$TMP/dmg/Koi.app/Contents/Resources"
cat > "$MANIFEST" <<EOF
<?xml version="1.0"?>
<updates>
  <update type="minor" displayVersion="$VERSION" appVersion="$VERSION" platformVersion="$(sed -n 's/^Milestone=//p' "$INI/platform.ini")" buildID="$(sed -n 's/^BuildID=//p' "$INI/application.ini")">
    <patch type="complete" URL="https://github.com/Awhalen1999/koi/releases/download/v$VERSION/koi.mar" hashFunction="sha512" hashValue="$(shasum -a 512 "$UPDATE" | cut -d' ' -f1)" size="$(stat -f %z "$UPDATE")"/>
  </update>
</updates>
EOF
echo "Made $DMG, $UPDATE and $MANIFEST"
