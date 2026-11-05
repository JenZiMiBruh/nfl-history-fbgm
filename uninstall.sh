#!/usr/bin/env bash
# Removes NFL History for Football GM on Mac and Linux: stops the game if it's running, then deletes this folder (the
# mod, the downloaded Football GM files and the private copy of Node). Nothing else is touched unless you say so.
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -f "$DIR/mod/launcher.mjs" ]; then
  echo "This doesn't look like the NFL History for Football GM folder, so nothing was removed."
  exit 1
fi
echo
echo "  Uninstall NFL History for Football GM"
echo "  -------------------------------------"
echo "  This will stop the game if it's running and delete this folder:"
echo "    $DIR"
echo
echo "  Your leagues are saved in your web browser, not in this folder."
echo "  To delete them too: before uninstalling, open http://localhost:3000, go to Leagues and delete them."
echo
read -r -p "  Uninstall now? [y/N] " ok
case "$ok" in [yY]*) ;; *) echo "  Nothing was removed."; exit 0 ;; esac

echo "  Stopping the game..."
pkill -f "$DIR/node/bin/node" 2>/dev/null
pkill -f "$DIR/football-gm" 2>/dev/null

read -r -p "  Also delete pnpm's shared download cache? (say N if you use pnpm for anything else) [y/N] " cache
case "$cache" in
  [yY]*) rm -rf "$HOME/Library/pnpm/store" "$HOME/.local/share/pnpm/store" 2>/dev/null ;;
esac

cd "$HOME" || exit 1
rm -rf "$DIR"
if [ -e "$DIR" ]; then
  echo "  Some files couldn't be removed. Close the game and delete the folder by hand: $DIR"
else
  echo "  NFL History for Football GM was removed. Thanks for playing!"
fi
