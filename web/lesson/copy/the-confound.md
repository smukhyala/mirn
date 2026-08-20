---
source: src/mirn_app/static/app.js BEAT_CLAIMS.confounding_sweep
harvested_from: feat/simulation-page
status: verbatim — not yet re-pointed at the new sim's controls
---

# Reported perturbation tracks predictor error
Here the true disturbance is pinned at exactly zero the whole way across the chart — robot influence set to zero, the same move as in Beat 2. Meanwhile the forecaster behind the standard method is made steadily worse, either by feeding it more noise or by asking it to predict further ahead.

There is nothing left for it to measure, so the number it reports is tracking only how bad the guess has become. Push the Maximum predictor error slider up and watch that number climb through the detection floor from Beat 1 — the line an effect has to clear before it counts as real — even though the true effect never leaves zero.

This is the consequence that matters. A robot tuned to make that number small would not be learning to bother people less. It would be learning to move predictably.
