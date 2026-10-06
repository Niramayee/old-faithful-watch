# Old Faithful Watch

An illustrated, animated view of Old Faithful geyser in Yellowstone's Upper Geyser Basin, in the style of a vintage national park poster. It counts down to the next predicted eruption and erupts on schedule.

**Live site:** https://keep-faith.vercel.app

## What it does

- **Live countdown.** It shows the park rangers' current eruption prediction, with your local time and the ± window. When the predicted time arrives, the geyser erupts at real length (about 4½ minutes, including the steam phase).
- **Eruptions on demand.** "Hurry it up, you old geezer!" plays a shortened eruption at any time. "Okay, okay. Put a lid on it!" winds that replay down again. A real eruption can't be stopped.
- **Time of day.** The poster art is re-inked for dawn, morning, day, dusk (as painted) and night. "Sky · Park time" follows the sun's real position at Old Faithful. Tap it to choose a look.
- **Trivia in the steam.** About every 90 seconds a fact rises out of the vent in a faint cloud, lingers, then evaporates. Facts you've seen are collected in *Field notes*.
- **Wildlife.**
  - A bison and her calf graze on the basin floor, and a lone bison wanders by now and then.
  - Ravens cross the sky, and one sometimes lands beside the geyser.
  - There are no birds at night.
- **Sound (optional).** Wind, birdsong, the eruption's roar and applause are all synthesized in the browser. There are no audio files.

## How it's built

Plain HTML, CSS and JavaScript. There's no framework and no build step. The illustrations are SVGs made in [Recraft](https://www.recraft.ai); everything that moves is drawn on canvas.

| File | What it does |
|---|---|
| `index.html`, `css/style.css` | The page: title, countdown strip, controls, Field notes |
| `js/app.js` | Predictions, countdown, the eruption schedule, trivia, controls, main loop |
| `js/geyser.js` | The geyser: cuts the steam and water out of each eruption frame at load time and animates them on one canvas (rising column, drifting cloud, spray, idle wisps) |
| `js/palette.js` | Time-of-day looks: sorts every shape in the art into sky, mountains, forest, cone, ground or steam, and re-inks it; the sun's position at Old Faithful |
| `js/steam-message.js` | The trivia clouds |
| `js/birds.js`, `js/bison.js` | Wildlife |
| `js/audio.js` | Synthesized sound (Web Audio) |
| `js/data.js` | Trivia facts and prediction settings. **Edit facts here.** |
| `api/prediction.js` | Vercel serverless function that fetches the prediction |
| `art/` | Source illustrations from Recraft (including some not used yet) |
| `assets/` | The cleaned art the site loads, plus the plume masks |
| `tools/` | Scripts that turn `art/` into `assets/` |

### Eruption predictions

Rangers at Old Faithful post a prediction for each eruption. [GeyserTimes](https://www.geysertimes.org) relays it through its API. Browsers can't call that API directly, so `api/prediction.js` fetches it server-side. Vercel's edge cache holds the result for 2 minutes, so all visitors share one upstream request, well within GeyserTimes' "no more than once a minute" policy.

If the function can't be reached, for example when previewing locally without `vercel dev`, the page uses the NPS prediction saved in `js/data.js`. After that passes, it projects forward using Old Faithful's roughly 92-minute average interval. The status badge says **Estimate** or **Saved** instead of **Live** when this happens.

### The art pipeline

The eruption is seven Recraft frames that share the same background: idle, rising, tall jet, full, declining, collapsing steam and fading steam. `tools/prepare_art.py` strips the embedded metadata and copies the frames, wisps, ravens and bison from `art/` to `assets/`. `tools/make_masks.sh` diffs each frame against the idle frame in headless Chrome to build `assets/geyser/mask-*.png`, which the page uses to cut out just the steam and water. It needs Google Chrome installed.

```sh
python3 tools/prepare_art.py
./tools/make_masks.sh
```

## Running locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Use a local server rather than opening `index.html` as a file. Browsers won't let a page opened from a file read its own images' pixels, so a few effects are skipped: the idle wisps, the swelling cloud edges and the clean-up of the steam-cloud art.

The `/api/prediction` function only runs on Vercel, or locally with `vercel dev`. Without it you'll see the saved or estimated prediction.

### Preview shortcuts

Add these to the address. Combine them with `&`, for example `index.html#sky=night&erupt=40`.

| Shortcut | Effect |
|---|---|
| `#soon` | Schedule a "live" eruption 40 seconds from now |
| `#erupt=<seconds>` | Start a replay and jump that far into it |
| `#sky=dawn` / `morning` / `day` / `dusk` / `night` | Force a time-of-day look |
| `#notes` | Fill in a few Field notes and open the panel |
| `#birds` | Send birds every few seconds and bring a raven down |
| `#birdsnap`, `#bisonsnap` | Place birds, or the wandering bison, mid-scene straight away (for screenshots) |

Test benches for working on single pieces:
- `eruption.html` shows the eruption on its own, with play, scrub, speed and loop.
- `message.html` shows the steam messages.
- `sky.html` shows every time-of-day look side by side, with a colour-family view.

## Deploying

The site is designed for [Vercel](https://vercel.com): import the repository with the framework preset **Other**, no build command, and the project root as the output directory. Vercel serves the static files and picks up `api/prediction.js` automatically. Every push to `main` redeploys.

## Credits

- **Eruption predictions** are made by Yellowstone National Park rangers ([NPS geyser activity](https://www.nps.gov/yell/planyourvisit/geyser-activity.htm)).
- **Contains information from [GeyserTimes](https://www.geysertimes.org)**, which is made available here under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/).
- **Illustrations** were made with [Recraft](https://www.recraft.ai).
- **Fonts:** Cormorant Garamond, Alegreya, Alegreya Sans and Big Shoulders Display, from [Google Fonts](https://fonts.google.com) (SIL Open Font License).
- **Trivia facts** are compiled from National Park Service material and other public sources. Corrections are welcome.
- **Analytics:** [Microsoft Clarity](https://clarity.microsoft.com), loaded only on the live site (see `OF.ANALYTICS` in `js/data.js`).

This is an independent fan project, not affiliated with or endorsed by the National Park Service or GeyserTimes.

## Licence

The code is released under the [MIT Licence](LICENSE). The illustrations in `art/` and `assets/` are **not** covered by it: they are © Niramayee, all rights reserved, and may not be reused or used to train AI models without permission. See [LICENSE](LICENSE) for details.
