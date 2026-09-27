# Old Faithful Watch

An illustrated, animated view of Old Faithful in Yellowstone's Upper Geyser Basin.

- Counts down to the next eruption using the live NPS ranger prediction and plays the eruption when it's due.
- Between eruptions, trivia drifts up out of the vent in the steam.
- "I can't wait, blow it up now" plays a shortened eruption at any time.
- Optional sound (wind, birds, the eruption, applause), all generated in the browser.

## How it's built

Plain HTML, CSS and JavaScript with no build step. The geyser is a set of vintage-poster frames (SVG, made in Recraft) in `assets/geyser/`. `js/geyser.js` cuts the steam and water out of each frame when the page loads and animates them on a single `<canvas>` over the still background: a soft reveal as the column rises, a sinking column and drifting cloud as it dies, steam wisps, and water spray. Sound is synthesized, so there are no audio files.

| File | What it does |
|---|---|
| `index.html` | Page structure and the park-sign UI |
| `css/style.css` | Styles for the signs, buttons and trivia carriers |
| `js/data.js` | Trivia facts and prediction settings: **edit facts here** |
| `js/geyser.js` | The geyser: frame cut-outs, eruption timeline, spray and steam |
| `eruption.html` | Test bench for the eruption alone (play, scrub, speed, loop) |
| `art/`, `tools/` | Source frames, and the scripts that clean them and build their masks (`python3 tools/prepare_art.py`, then `./tools/make_masks.sh`) |
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

Add `#soon` to the URL (`http://localhost:8000/#soon`) to schedule a "live" eruption 40 seconds out for testing.

The `/api/prediction` function only runs on Vercel, or locally with `vercel dev`.

## Deploying to Vercel

1. Push this repo to GitHub.
2. In Vercel, choose **Add New → Project** and import the repo.
3. Keep the defaults: Framework preset **Other**, no build command, output directory = project root.
4. Deploy. Vercel serves the static files and picks up `api/prediction.js` automatically.

Every push to `main` redeploys.
