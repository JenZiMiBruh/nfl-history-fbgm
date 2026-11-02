#!/usr/bin/env bash
# NFL History for Football GM: one-step setup and launch for Mac and Linux. Needs git (Mac: `xcode-select --install`).
# Football GM needs Node 24 exactly (newer Node versions dropped corepack, which installs its packages), so a private
# copy is downloaded into this folder; whatever Node is on the computer doesn't matter.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
GAME="$DIR/football-gm"
BASE=bda1fa5
NODEVER=v24.22.2
LOG="$DIR/install_log.txt"
fail() { echo; echo "Something went wrong. Run this again first (it picks up where it stopped)."; echo "If it still fails, open an issue and attach install_log.txt: https://github.com/JenZiMiBruh/nfl-history-fbgm/issues"; exit 1; }
trap fail ERR

command -v git >/dev/null || { echo "Install git first: https://git-scm.com"; exit 1; }

if [ ! -x "$DIR/node/bin/node" ]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) PLAT=darwin-arm64 ;; Darwin-x86_64) PLAT=darwin-x64 ;;
    Linux-x86_64) PLAT=linux-x64 ;; Linux-aarch64) PLAT=linux-arm64 ;;
    *) echo "Unsupported system: $(uname -s) $(uname -m)"; exit 1 ;;
  esac
  echo "Downloading Node.js $NODEVER for this folder..."
  curl -fsSL "https://nodejs.org/dist/$NODEVER/node-$NODEVER-$PLAT.tar.gz" | tar -xz -C "$DIR" >>"$LOG" 2>&1
  mv "$DIR/node-$NODEVER-$PLAT" "$DIR/node"
fi
export PATH="$DIR/node/bin:$PATH"

if [ ! -f "$GAME/.nfl-installed" ]; then
  [ -d "$GAME/.git" ] || { echo "Downloading Football GM source..."; git clone https://github.com/zengm-games/zengm.git "$GAME" >>"$LOG" 2>&1; }
  cd "$GAME"
  # Start from a clean copy every time, so a run that stopped halfway can't block the next one
  git checkout -q -f $BASE >>"$LOG" 2>&1
  git clean -q -fd -e node_modules >>"$LOG" 2>&1
  echo "Applying the NFL History mod..."
  git apply --whitespace=nowarn "$DIR/mod/nfl-history-mod.patch" >>"$LOG" 2>&1
  mkdir -p public/football/nfl
  cp "$DIR/mod/public/nfl/nfl_mod.js" public/football/nfl/
  echo "Installing packages (the longest step)..."
  corepack enable >>"$LOG" 2>&1 || true
  corepack pnpm install >>"$LOG" 2>&1
  touch .nfl-installed
fi

cd "$GAME"
IP=$( (ipconfig getifaddr en0 || hostname -I | awk '{print $1}') 2>/dev/null || true)
echo
echo "  Ready: http://localhost:3000"
echo "  On your phone (same Wi-Fi): http://$IP:3000"
echo
(sleep 4; open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000) &
SPORT=football node --run dev -- --host
