# MIRN — Minimum-Intervention Robot Navigation

**Building the ruler, not the room.**

MIRN is a measurement instrument for *robot-induced perturbation of pedestrian motion* — how much a mobile robot's presence deforms how people move, relative to a counterfactual world where the robot was never there.

This repository is **not** a simulator, a dataset, or a navigation planner. It is an estimator with an identification strategy, a calibration procedure, and a small policy whose only job is to demonstrate that the corrected measurement changes conclusions.

---

## The contribution in one paragraph

Planning against a counterfactual estimate of human motion is **not novel** — it has been published at least four times ([Courteous AV, IROS 2018](https://arxiv.org/abs/1808.02633); [Moder & Pauli, RO-MAN 2022](https://dl.acm.org/doi/10.1109/RO-MAN53752.2022.9900826); [SACSoN, RA-L 2024](https://arxiv.org/abs/2306.01874); [Zhou et al. 2023](https://arxiv.org/abs/2312.17076)). What *is* open is that the quantity everyone optimizes is **misestimated three ways**, and all three are now measurable:

1. **Wrong control condition.** SACSoN's counterfactual is *robot stationary* — it zeros the robot's future actions but leaves it in the scene. The authors explicitly flag *robot absent* as the correct generalization and do not do it. The gap between the two is a real bias, and [PeRoI](https://doi.org/10.5281/zenodo.18876411)'s `PD` vs `PD-SR` split measures it directly.
2. **Estimator confounds causal effect with predictor error.** Perturbation is computed as a prediction residual. A forecaster with 0.4 m ADE reports ~0.4 m of "perturbation" for a robot that did nothing — and real robot-induced deviations are the same order of magnitude. Worse, a policy trained to minimize that number is partly trained to move in ways the forecaster finds *easy to predict*, which is not unobtrusiveness and is sometimes its opposite.
3. **No detection floor.** Nobody has published the null distribution of trajectory divergence under no intervention, so no published perturbation number has a known significance.

**Fix those and "how much did the robot disturb people" acquires an estimand, an identification strategy, a null, and an error bar.**

### What changes about perturbation

| | Current practice | MIRN |
|---|---|---|
| **Control condition** | Robot **stationary** | Robot **absent**, with the gap measured on PeRoI PD vs PD-SR |
| **Estimator** | Point forecast minus observation | Divergence between **paired rollout distributions**, **debiased** for predictor error |
| **Scope** | Dyadic, one-step, nearest pedestrian | Closed-loop over the rollout, incl. **second-order propagation** |
| **Units** | Raw metres, uncalibrated | Effect size against a **measured null**, with a stated detection floor |

Row 2 is load-bearing. Everything else is supporting evidence.

---

## What we build (and explicitly do not)

Five artifacts, descending value:

| # | Artifact | Scale | Why |
|---|---|---|---|
| 1 | **Estimator** — `(peds, robot, env) → estimate + CI + identification assumption` | ~2k LOC | This is the paper |
| 2 | **Calibration** — null distribution → minimum detectable perturbation (MDP) | a table + a plot | This is what others cite |
| 3 | **Paired-rollout harness** — adapters over existing sims | ~500 LOC | Plumbing, not a simulator |
| 4 | **Policy** — MPPI cost term, deliberately unambitious | ~800 LOC | Proves the measurement matters |
| 5 | **Results** — PeRoI bias, confounding plot, ablation ladder | notebooks + CSV | The evidence |

**Explicitly absent:** new environments, new physics, crowd rendering, dataset collection, ROS packages beyond the harness.

> We are a **consumer** of simulators. NavIsaacLab has diffusion pedestrians and GPU parallelism; Arena has a five-version head start; HuNavSim has an active maintainer and ROS 2 packaging. Competing on simulation infrastructure is a lost year.

---

## Repository layout

```
mirn/
├── configs/                     # YAML experiment configs; every run is a config
├── src/mirn/
│   ├── contracts.py             # Frozen typed dataclasses — the only cross-module vocabulary
│   ├── registry.py              # Generic name → class registry backing every plugin point
│   ├── data/                    # DatasetAdapter ABC → peroi, thor_magni, jrdb
│   ├── divergence/              # Divergence ABC → sinkhorn_w2, frechet, ade_fde
│   ├── predictor/               # Predictor ABC → cvm (mandatory baseline), agent_transformer
│   ├── estimator/               # PerturbationEstimator ABC → residual (naive), paired, debiased
│   ├── calibration/             # Split-half null, MDP, power analysis
│   ├── harness/                 # PairedRolloutEnv ABC → socnavgym, crowdnav, hunavsim
│   ├── policy/                  # Planner ABC → mppi; cost terms incl. lambda_h
│   ├── experiments/             # One module per numbered milestone experiment
│   └── viz/                     # theme.py (dark, minimal) + plots.py
├── tests/
├── results/                     # CSV only — never commit large artifacts
└── docs/research/mirn-research-wayfinder.md   # READ THIS FIRST
```

Every extension point is an ABC plus a registry entry. Swapping the divergence, the predictor, or the simulator is a config edit, never a code edit.

---

## Core contracts

Defined once in `src/mirn/contracts.py`, frozen, and never bypassed:

- **`Trajectory`** — `(T, 2)` positions, `t0`, `dt`, `agent_id`, optional heading/velocity.
- **`Scene`** — pedestrian trajectories, static geometry, optional robot trajectory, `robot_present: bool`.
- **`RolloutPair`** — a factual scene and its counterfactual twin, sharing `seed`, goals, and initial conditions. The *only* legal input to a paired estimator; construction asserts the pairing invariants.
- **`PerturbationEstimate`** — `value`, `ci_low`, `ci_high`, `units` (`"metres"` or `"mdp"`), `identification: str`, `n_rollouts`, `divergence_name`. **An estimate without a stated identification assumption is a bug, not a value.**

---

## Non-negotiable methodology

These are enforced in tests and in review; violating one invalidates the result.

1. **Report in MDP units.** A raw-metres perturbation with no null distribution is meaningless. `PerturbationEstimate.units == "metres"` is permitted only inside calibration code.
2. **The placebo test gates everything.** Delete a random *non-interacting* pedestrian; the estimator must return Δ ≈ 0. [CausalAgents](https://arxiv.org/abs/2207.03586) shows SOTA forecasters shift 25–38% relative minADE when provably non-causal agents are removed — so this is a live failure mode, not a formality.
3. **One model, three conditions.** Never fit a robot-free prior and a robot-conditioned model separately: the difference then contains dataset-shift bias confounded with the causal effect, and it does not shrink with more data. Train a single predictor on PeRoI `PD + PD-SR + PD-MR` with an explicit robot-presence indicator so the null arm is genuinely observed and positivity holds.
4. **Constant velocity is a mandatory baseline row.** CVM scores 0.39/0.83 ADE/FDE on ETH/UCY, and with angular sampling under best-of-20 reaches [0.28/0.56](https://arxiv.org/abs/1903.07933). A predictor that cannot beat CVM on *calibration* (NLL, coverage) is not earning its parameters.
5. **Report collision rate and NLL, never minADE alone.** A hand-crafted uniform predictor [matches SOTA minADE₂₀ while producing 3.3–15.7% collisions](https://arxiv.org/abs/2209.12243).
6. **Δ_H stays a soft cost.** Only `C_collision` goes through the CBF safety filter. A miscalibrated learned cost inside a hard constraint produces infeasibility in exactly the crowded scenarios that matter.
7. **λ_h = 0 vs λ_h > 0 must be a config change, not a retraining run.** This is why the planner is MPPI and not RL.

---

## Getting started

```bash
uv venv && source .venv/bin/activate     # Python 3.11+
uv pip install -e ".[dev]"
cp .env.example .env                     # paths to datasets; never commit .env
pytest -q
```

Fetch PeRoI (CC-BY-4.0, ~UNVERIFIED size) and point `.env` at it:

```bash
python -m mirn.data.peroi fetch --out "$MIRN_DATA_ROOT/peroi"
python -m mirn.data.peroi characterize --out results/peroi_characterization.csv
```

Every experiment is a config:

```bash
python -m mirn.experiments.run --config configs/experiment/m05_detection_floor.yaml
```

Results land in `results/` as CSV. Figures render dark-mode via `mirn.viz.theme`.

---

## Roadmap

**No code before Milestone 3.** Milestones 1–2 are reading and writing.

| # | Milestone | Output | Est. |
|---|---|---|---|
| 1 | Resolve prior-art threats; hunt hard for prior statements of the predictor-error confounding argument | One-page honest delta statement | 1 wk |
| 2 | Write the related-work section **first** | If it cannot survive "how is this not SACSoN?", there is no project | 3 d |
| 3 | Download & characterize PeRoI; quantify selection effects (≥3.5 m, ≤2.7 m/s); power analysis on 260 PD-MR trajectories | `results/peroi_characterization.csv` | 1 wk |
| 4 | Evaluation harness: Sinkhorn W₂, Fréchet, ADE/FDE; reproduce the uniform-predictor exploit on JRDB-Traj | `mirn.divergence`, `mirn.estimator.residual` | 1.5 wk |
| 5 | **Detection floor + control-condition bias — no model required** | **Two publishable results.** Highest-value work in the plan | 1.5 wk |
| 6 | Single mixture predictor: 1–5M param agent-token transformer, anchor queries, unicycle head, robot-presence indicator | `mirn.predictor.agent_transformer` | 2 wk |
| 7 | MVP decision battery: Δ_H distribution vs MDP, placebo test, **estimator-confounding sweep (the killer plot)**, proxemics collinearity | **Go/no-go gate** | 1.5 wk |
| 8 | Predictor ablation ladder: agent-mixing ∈ {none, mean-pool, k-NN graph, dense attention} | Collision rate + NLL, CVM row included | 1.5 wk |
| 9 | Human preference collection; compare metrics by pairwise-preference accuracy vs min-distance, social work, PSC, SN26 | Validity evidence | 2–3 wk |
| 10 | **Only now:** the MPPI loop. First experiment is λ_h = 0 vs λ_h > 0 | `mirn.policy.mppi` | 3 wk |

Milestone 7 is a genuine kill gate. If Δ_H does not clear the detection floor, or the placebo test fails, the honest outcome is a negative-result paper on measurement validity — which is still publishable and still useful.

---

## Key external dependencies

| Thing | Where | License | Note |
|---|---|---|---|
| **PeRoI** | [zenodo 18876411](https://doi.org/10.5281/zenodo.18876411) | CC-BY-4.0 | 15,461 PD / 2,948 PD-SR / 260 PD-MR, 15 Hz, two outdoor sites |
| THÖR-MAGNI | [zenodo 10407223](https://doi.org/10.5281/zenodo.10407223) | CC-BY-4.0 | 100 Hz mocap. **No robot-absent condition** — static vs mobile only |
| JRDB / JRDB-Traj | [jrdb.erc.monash.edu](https://jrdb.erc.monash.edu/) | CC BY-NC-SA 3.0 | Registration required; stationary vs moving captures at recurring locations |
| SocNavGym | [gnns4hri/SocNavGym](https://github.com/gnns4hri/SocNavGym) | **GPL-3.0** | Continuous `prob_to_avoid_robot` knob — the reactivity dose-response |
| CrowdNav++ | [Shuijing725/CrowdNav_Prediction_AttnGraph](https://github.com/Shuijing725/CrowdNav_Prediction_AttnGraph) | MIT | `robot.visible` is the paired-rollout hook |
| HuNavSim 2.0 | [robotics-upo/hunav_sim](https://github.com/robotics-upo/hunav_sim) | MIT | ROS 2 Humble; `Impassive` behavior = robot-blind arm |
| Nav2 MPPI | [nav2_mppi_controller](https://github.com/ros-navigation/navigation2) | MIT | Reference: 1000×56 @ 50+ Hz CPU |

**GPL warning:** SocNavGym is GPL-3.0. Keep it behind the `harness` adapter boundary and out of any distributed artifact, or the license propagates.

---

## Reading order

1. `docs/research/mirn-research-wayfinder.md` — the full literature assessment. **Start here.**
2. §15b (build scope) and §16 (milestones) of that document are the operational plan.
3. `CLAUDE.md` — conventions and guardrails for agentic work in this repo.
