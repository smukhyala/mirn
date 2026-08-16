# CLAUDE.md — working agreement for MIRN

Read `docs/research/mirn-research-wayfinder.md` before making any non-trivial decision. It is the authoritative literature assessment; this file is the operational contract.

---

## What this project is

A **measurement instrument** for robot-induced perturbation of pedestrian motion, plus a minimal policy that demonstrates the measurement changes conclusions.

**It is not** a simulator, a dataset-collection effort, a trajectory-prediction SOTA chase, or a social-navigation planner paper. If a proposed change moves the project toward any of those, say so and push back before implementing.

The contribution is that perturbation is currently misestimated three ways — wrong control condition (robot-stationary vs robot-absent), an estimator that confounds causal effect with predictor error, and no established detection floor. Everything we build serves quantifying those.

---

## Hard guardrails

Violating any of these invalidates results, so treat them as build errors rather than preferences.

1. **Never write a simulator.** Wrap existing ones behind `mirn.harness`. If an adapter needs a feature the upstream sim lacks, patch narrowly in the adapter and document the divergence — do not fork.
2. **Never fit separate robot-free and robot-conditioned models.** One model, mixture training on `PD + PD-SR + PD-MR`, explicit robot-presence indicator. Two models bake dataset-shift bias into the estimate and it does not shrink with data.
3. **Never report perturbation in raw metres outside `mirn.calibration`.** Report in MDP units against the measured null.
4. **Never return a `PerturbationEstimate` without `identification` and a CI.** The dataclass makes these required; do not add defaults.
5. **Never put Δ_H inside a hard constraint.** Soft MPPI cost only. CBF filters collision, nothing else.
6. **Never make λ_g / λ_c / λ_h training-time constants.** They must remain runtime config. This is the reason the planner is MPPI rather than RL.
7. **Never report minADE alone.** Always alongside collision rate and NLL. A uniform predictor matches SOTA minADE₂₀ at 3.3–15.7% collisions.
8. **Never delete or soften an UNVERIFIED marker** in the research docs without a primary source. Downgrade claims rather than smoothing them.

---

## Code conventions

Python 3.11+. The user's standing preferences, which apply here:

- **Framework-first with pluggable components.** Every extension point is an ABC in `<module>/base.py` plus a `@register` decorator into `mirn.registry`. Concrete implementations are selected by name from YAML. No `if backend == "..."` dispatch chains.
- **Explicit loops over comprehensions.** Write `for` loops with named intermediates. Do not chain or compound statements to save lines.
- **No `isinstance()` for type checking.** Use registry lookups, ABC dispatch, or an explicit `kind: str` field on the dataclass.
- **Typed contracts everywhere.** Frozen `@dataclass(frozen=True, slots=True)` in `contracts.py`. Validate in `__post_init__`; raise, never warn. Full type hints on every public function.
- **CSV for results.** Every experiment writes a flat CSV to `results/`. Parquet only for intermediate caches under `.cache/`.
- **No hardcoded paths or secrets.** Dataset roots come from `.env` via `MIRN_DATA_ROOT`. `.env` is gitignored; `.env.example` is committed.
- **Plots are dark-mode, minimal, high-end** (DeepMind / Anthropic register). All styling lives in `mirn.viz.theme` — never set colors or fonts inline in a plotting function.
- **Determinism is a feature.** Every stochastic path takes an explicit `seed: int`. Global RNG state is banned. `RolloutPair` construction asserts both arms share a seed.

### Testing

The user wants rigorous testing as progress is made, not a test phase at the end. Concretely:

- Write the test with the implementation, in the same commit.
- **Property tests over the estimators.** Non-negativity; zero on identical inputs; symmetry where the divergence claims it; invariance to global translation and rotation of the scene; monotonicity under synthetic injected deviation.
- **The placebo test is a first-class test**, not an experiment: `tests/test_placebo.py` deletes a random non-interacting pedestrian and asserts Δ ≈ 0 within the null band. It runs in CI on synthetic data and is expected to be the test that catches real bugs.
- **Golden-file tests on calibration outputs**, so a null distribution cannot silently drift.
- Simulator adapters get contract tests against a shared `PairedRolloutEnv` conformance suite, so a new backend is proven equivalent before use.
- `pytest -q` must pass before any commit. Do not claim work is complete without running it and showing the output.

---

## Contracts (`src/mirn/contracts.py`)

Change these only with a deliberate migration; every module speaks this vocabulary.

- `Trajectory` — `(T, 2)` float array, `t0: float`, `dt: float`, `agent_id: str`, optional `heading`, `velocity`.
- `Scene` — `pedestrians: tuple[Trajectory, ...]`, `geometry`, `robot: Trajectory | None`, `robot_present: bool`, `source: str`, `seed: int`.
- `RolloutPair` — `factual: Scene`, `counterfactual: Scene`. `__post_init__` asserts equal seeds, equal goals, equal initial pedestrian states, and `counterfactual.robot_present is False`. **This invariant is the whole experiment**; if an adapter cannot satisfy it, that adapter is unusable, not the invariant.
- `PerturbationEstimate` — `value`, `ci_low`, `ci_high`, `units: Literal["metres", "mdp"]`, `identification: str`, `n_rollouts: int`, `divergence_name: str`.

---

## Architecture decisions already made

Do not relitigate these without new evidence; each has a documented ablation in the wayfinder §6.

| Decision | Rationale |
|---|---|
| **No learned world model** | 30.3 s/trajectory for NWM; "delete the robot" is ill-defined in pixel space; OOD mode collapse |
| **No GNN / message passing** | STAR: GCN 1.86 ADE vs plain attention 0.56. Dense self-attention with agent+time embeddings instead |
| **No CVAE latent** | MTR ablation: latent 0.2633 → anchors 0.3059 mAP. Use k-means anchors over training endpoints |
| **No diffusion in v1** | Step count is the latency budget; every real-time result is 1–5 steps. Defer to v2 |
| **Keep the unicycle dynamics head** | Trajectron++'s single largest win (nuScenes FDE 0.18 → 0.07 m) |
| **1–5M param predictor, not 65M** | Six years of architecture work moved ETH/UCY ADE ~3 cm. Capacity is not the bottleneck |
| **Evaluate on JRDB-Traj, not ETH/UCY** | ETH/UCY is saturated and metric-compromised; JRDB-Traj matches the deployment condition |
| **MPPI, not gradient MPC or RL** | Δ_H need not be differentiable or convex; λ weights stay runtime knobs |

### The latency trap

Nav2 defaults (1000 rollouts × 56 steps) imply ~56,000 predictor queries per control cycle — 3.7 s/cycle at 66 µs each. Not viable. Use **encode-once / decode-many** and **plan-mode clustering**: encode the scene once, cluster the K sampled control sequences into a small number of modes, and evaluate Δ_H per mode rather than per state. Any design that queries the predictor inside the inner rollout loop is wrong; flag it immediately.

---

## Known environment pitfalls

- **Python-RVO2** (`sybrenstuvel/Python-RVO2`, default branch last pushed 2020-08-07) is the single most common install failure and a hard dependency of CrowdNav and SICNav. Pin `Cython==0.29.33`.
- **SocNavGym is GPL-3.0.** Keep it behind the harness boundary; never import it from distributed code.
- **`teb_local_planner`** has no buildfarm binaries for Humble/Jazzy — source build only, expect to build g2o manually. Only relevant if we add it as a baseline.
- **HuNavSim** wraps Gazebo Classic 11 (EOL Jan 2025), Fortress, Isaac, Webots — **not Harmonic**.
- **CrowdNav-family repos ship `robot.visible = False`.** That is our counterfactual hook, but it also means the default config produces Δ_H ≡ 0. Never report a number from a robot-invisible config as a result.

---

## Verified facts (do not re-derive or hallucinate around)

- **SACSoN's counterfactual is robot-stationary**, implemented as `f_ψ(h, r_past, 0)`. The authors explicitly write that the principle "could be further generalized to … the robot is absent all together, but we focus on the stationary robot counterfactual as a simple instantiation." This sentence is the project's opening.
- **PeRoI is released**: Zenodo 18876411, CC-BY-4.0, published 2026-06-01, University of Bonn (Agrawal, Ostermann-Myrau, Dengler, Bennewitz). 15,461 PD / 2,948 PD-SR (1,090 HSR, 837 MPO700, 1,021 Go1) / 260 PD-MR; 18,669 total over 142 h; 15 Hz; YOLOv11 + homography. The arXiv PDF's "available after publication" line is stale.
- **THÖR-MAGNI has no robot-absent condition.** Scenarios 1–2 contain a *stationary* DARKO robot; Scenario 3 makes it mobile. It bounds perturbation from below; it cannot identify the estimand.
- **HuRoN/SACSoN**: 75 h, 58.7 km, 4000+ interactions, 5 indoor office environments, MIT license.
- **No standard social-nav metrics package exists.** Francis et al. (THRI 2025) is normative with no reference implementation. `hunav_evaluator` is the de facto runnable option.

---

## Working style

- **Milestones 1–2 are reading and writing. Do not write code during them.** If asked to start implementing before the related-work paragraph exists, say so.
- Prefer editing existing files to creating new ones. Do not create documentation files unless asked.
- When a claim needs a citation, fetch the primary source. Do not cite from memory; this repo's credibility rests on the reference list.
- When something cannot be verified, write **UNVERIFIED** and move on. Do not guess licenses, commit dates, or ROS distro support.
- Surface disagreement early. A wrong architectural commitment here costs weeks, and the guardrails above exist because the obvious version of this project is already published.
