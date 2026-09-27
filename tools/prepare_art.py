"""Copy the Recraft geyser frames from art/ into assets/geyser/, and the steam-message wisps into
assets/wisps/, stripping the embedded C2PA metadata (most of each file's size).
Run from the project root: python3 tools/prepare_art.py"""
import re
from pathlib import Path

FRAMES = ["00-idle", "02-rising", "03-tall-jet", "04-full", "05-declining", "06-collapse-steam", "07-steam-fading"]
src, dst = Path("art"), Path("assets/geyser")
dst.mkdir(parents=True, exist_ok=True)

for name in FRAMES:
    svg = (src / f"{name}.svg").read_text()
    svg = re.sub(r"<metadata>.*?</metadata>", "", svg, flags=re.S)
    out = dst / f"{name}.svg"
    out.write_text(svg)
    print(f"{name}: {len(svg) // 1024} KB")

# Steam messages: the cloud that rises from the vent and holds the text, and the streak it tears into.
# (The traced frame around each square is removed at load time by js/steam-message.js.)
WISPS = {"Cloud wisp 8": "3-cloud", "Cloud wisp 3": "4-evaporate"}
wdst = Path("assets/wisps")
wdst.mkdir(parents=True, exist_ok=True)
for name, out_name in WISPS.items():
    svg = re.sub(r"<metadata>.*?</metadata>", "", (src / f"{name}.svg").read_text(), flags=re.S)
    (wdst / f"{out_name}.svg").write_text(svg)
    print(f"{name} -> wisps/{out_name}: {len(svg) // 1024} KB")
