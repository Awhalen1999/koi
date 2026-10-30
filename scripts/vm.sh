#!/bin/bash
# Runs the current build in the Cua Space (a headless macOS VM): packages
# it, copies the DMG in, installs it over the previous Koi there and
# launches it (Koi quits through AppleScript first: a kill makes the next
# launch open Restore Session). Dev builds are symlinks into the repo and the objdir, so only
# a packaged app runs anywhere else. The Space must be running
# (`cua spaces start koi`); drive Koi with `cua do screenshot`,
# `cua do click X Y`, `cua do type`, `cua do shell` (coordinates are the
# screenshot's pixels). KOI_VM names another Space.
set -euo pipefail
SPACE="${KOI_VM:-koi}"
cd "$(dirname "$0")/../engine"
env -u CLAUDECODE ./mach package | grep "Created package" || exit 1
DMG=$(ls -t obj-*/dist/koi-*.dmg | head -1)
cua sb cp "$DMG" "$SPACE:/Users/lume/Downloads/koi.dmg"
cua do switch "$SPACE" > /dev/null
cua do shell 'if pgrep -x koi >/dev/null; then osascript -e "quit app \"Koi\""; for i in 1 2 3 4 5; do pgrep -x koi >/dev/null || break; sleep 1; done; fi; hdiutil attach ~/Downloads/koi.dmg -nobrowse -quiet -mountpoint /tmp/koi-dmg && rm -rf /Applications/Koi.app && cp -R /tmp/koi-dmg/Koi.app /Applications/ && hdiutil detach /tmp/koi-dmg -quiet && open /Applications/Koi.app'
echo "Koi is running in $SPACE"
