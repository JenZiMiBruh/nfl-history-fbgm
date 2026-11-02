#!/usr/bin/env bash
# NFL History for Football GM for Mac and Linux. Needs git (Mac: `xcode-select --install`).
# Gets a private Node 24 (Football GM needs exactly 24; newer versions dropped corepack), then hands over to
# mod/launcher.mjs, which updates the mod automatically, sets up Football GM and starts the game.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
NODEVER=v24.22.2
LOG="$DIR/install_log.txt"

command -v git >/dev/null || { echo "Install git first: https://git-scm.com"; exit 1; }

if [ ! -x "$DIR/node/bin/node" ]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) PLAT=darwin-arm64 ;; Darwin-x86_64) PLAT=darwin-x64 ;;
    Linux-x86_64) PLAT=linux-x64 ;; Linux-aarch64) PLAT=linux-arm64 ;;
    *) echo "Unsupported system: $(uname -s) $(uname -m)"; exit 1 ;;
  esac
  echo "Downloading Node.js $NODEVER for this folder..."
  curl -fsSL "https://nodejs.org/dist/$NODEVER/node-$NODEVER-$PLAT.tar.gz" | tar -xz -C "$DIR" 2>>"$LOG" || {
    echo "Couldn't download Node.js. Check your connection and run this again; if it still fails, open an issue and attach install_log.txt."; exit 1; }
  mv "$DIR/node-$NODEVER-$PLAT" "$DIR/node"
fi
export PATH="$DIR/node/bin:$PATH"
exec node "$DIR/mod/launcher.mjs"
