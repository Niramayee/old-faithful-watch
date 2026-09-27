#!/bin/sh
# Rebuild assets/geyser/mask-*.png from the frames. Run from the project root after tools/prepare_art.py.
# Needs Google Chrome. Writes measurements to tools/mask-stats.json.
set -e
PORT=8791
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
python3 -m http.server $PORT >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1
"$CHROME" --headless=new --disable-gpu --virtual-time-budget=240000 --dump-dom \
  "http://localhost:$PORT/tools/make_masks.html" 2>/dev/null > /tmp/of-masks.html
python3 - <<'EOF'
import base64, html, json, re
dom = open('/tmp/of-masks.html').read()
data = json.loads(html.unescape(re.search(r'<pre id="out">(.*?)</pre>', dom, re.S).group(1)))
for name, url in data['masks'].items():
    png = base64.b64decode(url.split(',', 1)[1])
    open(f'assets/geyser/mask-{name}.png', 'wb').write(png)
    print(f'mask-{name}.png  {len(png) // 1024} KB')
json.dump(data['stats'], open('tools/mask-stats.json', 'w'))
print('stats -> tools/mask-stats.json')
EOF
