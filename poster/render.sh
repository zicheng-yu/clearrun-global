#!/bin/zsh
# Render poster.html to an A3 300-DPI PNG (3508 x 4961 px) and PDF.
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
	--window-size=1754,2481 --virtual-time-budget=4000 \
	--screenshot="$PWD/_raw.png" "file://$PWD/poster.html" 2>/dev/null
python3 - <<'EOF'
from PIL import Image
im = Image.open("_raw.png").convert("RGB")
im = im.crop((0, 0, 3508, 4961))
im.save("ClearRun-poster-A3.png", dpi=(300, 300))

print(im.size)
EOF
rm -f _raw.png
sips -s format pdf ClearRun-poster-A3.png --out ClearRun-poster-A3.pdf >/dev/null
