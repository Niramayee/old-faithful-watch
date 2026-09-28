// Vercel serverless function: GET /api/prediction
// Fetches Old Faithful's latest prediction from GeyserTimes server-side (no browser CORS limits)
// and lets Vercel's edge cache hold it for 2 minutes, so all visitors share one upstream request.
// GeyserTimes runs on donated servers and asks clients to poll no more than once a minute and to
// display its ODbL attribution (see index.html); https://www.geysertimes.org/api/v5/docs/index.php

const SOURCE = 'https://www.geysertimes.org/api/v5/predictions_latest';

module.exports = async (req, res) => {
  try {
    const r = await fetch(SOURCE, {
      headers: { Accept: 'application/json', 'User-Agent': 'OldFaithfulWatch (+https://github.com/Niramayee/old-faithful-watch)' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) throw new Error(`GeyserTimes responded ${r.status}`);
    const j = await r.json();
    const now = Date.now();
    const of = (j.predictions || []).filter(
      (p) => p.geyserName === 'Old Faithful' && +p.prediction * 1000 > now - 3 * 60e3
    );
    const nps = of.find((p) => /NPS/i.test(p.comment || ''));
    const p = nps || of.sort((a, b) => a.prediction - b.prediction)[0];

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    if (!p) return res.status(200).json({ prediction: null });
    return res.status(200).json({
      prediction: {
        time: +p.prediction * 1000,
        open: +p.windowOpen * 1000,
        close: +p.windowClose * 1000,
        source: nps ? 'nps' : 'geysertimes'
      }
    });
  } catch (err) {
    res.setHeader('Cache-Control', 'public, s-maxage=30');
    return res.status(502).json({ error: String(err.message || err) });
  }
};
