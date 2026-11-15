#!/bin/sh
# Renders the README images from their HTML sources with headless Chrome, then encodes WebP.
# Usage: sh assets/readme/source/render.sh   (from the repo root; needs Google Chrome and cwebp)
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
render() { # name width height
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=2 \
    --window-size="$2,$3" --virtual-time-budget=3000 --screenshot="/tmp/readme-$1.png" "file://$PWD/$1.html" 2>/dev/null
  cwebp -quiet -q 86 "/tmp/readme-$1.png" -o "../$1.webp"
}
render hero 1200 720
render demo 1200 675
