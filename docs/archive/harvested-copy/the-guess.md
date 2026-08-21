---
source: src/mirn_app/static/app.js BEAT_CLAIMS.estimator_comparison
harvested_from: feat/simulation-page
status: verbatim — not yet re-pointed at the new sim's controls
---

# The run you cannot have
In the real world you only ever get to watch one version of events. There is no robot-absent run sitting there to compare against, so most published work guesses at it instead, using a forecaster: predict where a pedestrian was already heading, then measure how far off that prediction turned out to be.

That prediction error is what most published measurements report as the robot's effect. It comes from an estimator — a formula that turns raw paths into a single number claiming to size up the disturbance.

Right now the robot in this run is at full strength, and the two methods already disagree. The paired method can look at the robot-absent version of the crowd directly. The standard forecaster-based method cannot, and has to guess.

Now drag Robot influence down to zero. The robot stops doing anything at all, the two versions of the crowd become the same paths step for step, and the honest answer is exactly zero. That is what the paired method reports.

The standard method does not. It still reports a substantial disturbance from a robot that did nothing, because what it is really measuring is how wrong its own guess about the pedestrian was. The Forecast horizon slider controls how substantial. Ask the forecaster to predict further ahead and its guess gets worse, and the disturbance it claims to have found grows right along with it. The robot has not changed. Only the guess has.
