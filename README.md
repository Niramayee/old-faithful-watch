# Old Faithful Watch

An illustrated, animated view of Old Faithful in Yellowstone's Upper Geyser Basin.

- Counts down to the next eruption using the live NPS ranger prediction and plays the eruption when it's due.
- Between eruptions, trivia rises out of the vent in a faint cloud of steam, hangs for a while, then evaporates.
- "Hurry it up, you old geezer!" plays a shortened eruption at any time, and "Okay, okay. Put a lid on it!" cuts that replay short. A real eruption can't be stopped.
- The poster art is re-inked for dawn, morning, day, dusk (as painted) and night. "Sky · Park time" follows the sun at Old Faithful; tap it to pick a look.
- Ravens cross the sky now and then, and one sometimes lands beside the geyser (none at night).
- Optional sound (wind, birds, the eruption, applause), all generated in the browser.

## How it's built

Plain HTML, CSS and JavaScript with no build step. The geyser is a set of vintage-poster frames (SVG, made in Recraft) in `assets/geyser/`. `js/geyser.js` cuts the steam and water out of each frame when the page loads and animates them on a single `<canvas>` over the still background: a soft reveal as the column rises, a sinking column and drifting cloud as it dies, steam wisps, and water spray. Sound is synthesized, so there are no audio files.

| File | What it does |
|---|---|
| `index.html` | Page structure and the park-sign UI |
| `css/style.css` | Styles for the signs, buttons and trivia carriers |
| `js/data.js` | Trivia facts and prediction settings: **edit facts here** |
| `js/geyser.js` | The geyser: frame cut-outs, eruption timeline, spray and steam |
| `js/palette.js` | Time-of-day looks: sorts each shape of the art into sky, mountains, forest, cone, ground or steam and re-inks it; the sun's position at Old Faithful |
| `sky.html` | Test bench showing every look side by side (with a colour-family view) |
| `js/birds.js` | Birds crossing the sky, and a raven (Recraft art in `assets/birds/`) that lands beside the geyser |
| `js/steam-message.js` | Trivia clouds: rise from the vent, hold the text, tear apart and evaporate |
| `eruption.html` | Test bench for the eruption alone (play, scrub, speed, loop) |
| `message.html` | Test bench for the steam messages |
| `art/`, `tools/` | Source art, and the scripts that clean it into `assets/` and build the geyser masks (`python3 tools/prepare_art.py`, then `./tools/make_masks.sh`) |
| `js/audio.js` | Synthesized sound (Web Audio API) |
| `js/app.js` | Predictions, countdown, trivia delivery, controls, main loop |
| `api/prediction.js` | Vercel serverless function that fetches the prediction |

## Eruption predictions

`api/prediction.js` fetches [GeyserTimes](https://www.geysertimes.org/), which relays the NPS ranger prediction, on the server. It caches the result on Vercel's edge for 2 minutes. Browsers can't call GeyserTimes directly (it blocks cross-site requests), so the function is required for live data.

If the function can't be reached (for example when previewing locally), the page falls back to the NPS prediction saved in `js/data.js`. After that prediction passes, it estimates forward using the ~92-minute average interval, and the sign says so.

To refresh the saved snapshot, update `OF.PREDICTION.snapshot` in `js/data.js` from `https://www.geysertimes.org/api/v5/predictions_latest`.

## Running locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Use a local server rather than opening the file directly. Opened as a file, browsers won't let the page read its own images' pixels, so a few effects (extra idle wisps, swelling cloud edges, cleaning the steam-message art) are skipped.

Add `#soon` to the URL (`http://localhost:8000/#soon`) to schedule a "live" eruption 40 seconds out for testing.

The `/api/prediction` function only runs on Vercel, or locally with `vercel dev`.

## Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel, choose **Add New → Project** and import the repo.
3. Keep the defaults: Framework preset **Other**, no build command, output directory = project root.
4. Deploy. Vercel serves the static files and picks up `api/prediction.js` automatically.

Every push to `main` redeploys.
