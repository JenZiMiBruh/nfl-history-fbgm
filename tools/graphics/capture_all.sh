#!/usr/bin/env bash
# Re-captures every README / docs image from the site (site/index.html, guide.html, visuals.html).
# Needs the repo served at $BASE (any static server on the repo folder) and Chrome at $CHROME.
# Usage: CHROME="/path/to/chrome" BASE=http://localhost:3997/site/ bash tools/graphics/capture_all.sh
set -e
cd "$(dirname "$0")/../.."
BASE="${BASE:-http://localhost:3997/site/}"
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --virtual-time-budget=12000 --window-size="$2" --screenshot="$PWD/assets/$1.png" "$BASE$3" 2>/dev/null; echo "  $1"; }

# Explorer
shot shots/hero     1280,560  "index.html?shot=hero"
shot banner         1280,640  "../tools/graphics/banner.html"
shot shots/header   1100,250  "index.html?shot=header&teams=21"
shot shots/looks    1100,1290 "index.html?shot=looks&teams=29,30"
shot shots/looks2   1100,1590 "index.html?shot=looks&teams=18"
shot shots/chart    1100,350  "index.html?shot=chart&teams=21"
shot shots/roster   1100,540  "index.html?shot=roster&teams=21&season=2007"
shot shots/player   820,900   "index.html?shot=player&teams=21&name=Tom%20Brady"
shot shots/legends  1100,700  "index.html?shot=legends&teams=27"
shot shots/draft    1100,980  "index.html?shot=draft"
# Guides
shot guide/today    1100,1430 "guide.html?only=today"
shot guide/season   1100,1520 "guide.html?only=season"
shot guide/mod      1100,1700 "guide.html?only=mod"
# Explainers
for p in "two 760" "curve 640" "example 820" "dist 640" "careers 600" "sources 700" "eras 900" "fixes 860" "funnel 720"; do
  set -- $p; shot "docs/$1" "1100,$2" "visuals.html?only=$1"
done
shot poster         1800,2250 "../tools/graphics/poster.html"
