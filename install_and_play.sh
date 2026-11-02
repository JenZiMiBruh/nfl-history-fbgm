#!/usr/bin/env bash
# NFL History for Football GM: one-step setup and launch for Mac and Linux.
# Needs Node.js 22+ and git (Mac: `brew install node git`).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
GAME="$DIR/football-gm"
BASE=bda1fa5

command -v node >/dev/null || { echo "Install Node.js first: https://nodejs.org"; exit 1; }
command -v git >/dev/null || { echo "Install git first: https://git-scm.com"; exit 1; }

if [ ! -f "$GAME/.nfl-installed" ]; then
  [ -d "$GAME" ] || git clone https://github.com/zengm-games/zengm.git "$GAME"
  cd "$GAME"
  git checkout -q $BASE
  git apply --whitespace=nowarn "$DIR/mod/nfl-history-mod.patch"
  mkdir -p public/football/nfl
  cp "$DIR/mod/public/nfl/nfl_mod.js" public/football/nfl/
  corepack enable 2>/dev/null || true
  corepack pnpm install
  touch .nfl-installed
fi

cd "$GAME"
IP=$( (ipconfig getifaddr en0 || hostname -I | awk '{print $1}') 2>/dev/null )
echo
echo "  Ready: http://localhost:3000"
echo "  On your phone (same Wi-Fi): http://$IP:3000"
echo
(sleep 4; open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000) &
SPORT=football node --run dev -- --host
