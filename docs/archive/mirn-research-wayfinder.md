> **ARCHIVED — 2026-08-20.**
>
> This document describes a research programme MIRN is no longer pursuing: a measurement
> instrument for robot-induced perturbation of pedestrian motion, aimed at publication. MIRN is now
> an interactive learning environment. See the repository README.
>
> **Nothing in this file governs current work, and no claim in it has been re-verified since it was
> written.** Every `UNVERIFIED` marker below stands exactly as it was, and §17's own caveat about
> rate-limited searches applies to every negative claim it makes. If the teaching material takes a
> claim from here, it cites the primary source directly rather than citing this document.
>
> Prepending this block is the only edit made to it. The body below is unchanged.

---

# MIRN Research Wayfinder

**Minimum-Intervention Robot Navigation — literature assessment and project scoping**

Compiled 2026-08-16 from four parallel primary-source reviews (novelty/literature, metrics/formulation, simulation/data/baselines, architecture/utility). Every factual claim about prior work carries an arXiv ID, DOI, or repository URL. Claims that could not be confirmed against a primary source are marked **UNVERIFIED** rather than smoothed over.

**Verdict: MODIFY.** The core idea as stated has been published at least four times. A narrower, sharper version is genuinely open and worth building. Details in §1 and §16.

---

## Table of contents

1. [Executive assessment](#1-executive-assessment)
2. [Literature map](#2-literature-map)
3. [Closest competing approaches](#3-closest-competing-approaches)
4. [Novelty and gap analysis](#4-novelty-and-gap-analysis)
5. [Recommended research question](#5-recommended-research-question)
6. [Technical architecture](#6-technical-architecture)
7. [Counterfactual methodology](#7-counterfactual-methodology)
8. [Simulation and data stack](#8-simulation-and-data-stack)
9. [Baseline suite](#9-baseline-suite)
10. [Evaluation methodology](#10-evaluation-methodology)
11. [MVP experiment](#11-mvp-experiment)
12. [Path toward a publishable result](#12-path-toward-a-publishable-result)
13. [Real-world robotics utility](#13-real-world-robotics-utility)
14. [Major technical and research risks](#14-major-technical-and-research-risks)
15. [Skills developed](#15-skills-developed)
15b. [Build scope — what you are and are not building](#15b-build-scope--what-you-are-and-are-not-building)
16. [First 10 implementation milestones](#16-first-10-implementation-milestones)
17. [Unverified items and open threads](#17-unverified-items-and-open-threads)

---

## 1. Executive assessment

### 1.1 The headline

**MIRN's central idea — plan against a counterfactual estimate of how humans would have moved absent the robot — is not novel.** It has been published, in recognizable form, at least four times:

| Work | What it did | Year |
|---|---|---|
| **Courteous Autonomous Cars** ([arXiv:1808.02633](https://arxiv.org/abs/1808.02633)) | Penalizes `max{0, C_H(with robot) − C_H(no robot)}` in cost space; "Alt I" reference is literally the human's optimum with no robot present | IROS 2018 |
| **Moder & Pauli** ([DOI](https://dl.acm.org/doi/10.1109/RO-MAN53752.2022.9900826)) | "Social Influence" objective measuring "the divergence between a scene prediction conditioned by the robot plan and a scene prediction independent of the robot plan," inside a model-predictive policy | RO-MAN 2022 |
| **SACSoN** ([arXiv:2306.01874](https://arxiv.org/abs/2306.01874)) | "If the robot had not intruded into the space, would the human have acted in the same way? By minimizing this counterfactual perturbation…" — implemented as a planning cost | RA-L 2024 |
| **Zhou et al.** ([arXiv:2312.17076](https://arxiv.org/abs/2312.17076)) | Wasserstein distance between robot-present and robot-absent pedestrian distributions (IDP), plus L1 crowd-flux disruption (FDP), used as planner penalties | 2023 |

Additionally, **Li et al.** ([arXiv:2311.16091](https://arxiv.org/abs/2311.16091)) computes an explicit `‖μ̂^{w/Ego} − μ̂^{w/o Ego}‖²`, and **Agrawal, Dengler & Bennewitz** ([arXiv:2409.14844](https://arxiv.org/abs/2409.14844)) implement Δ_H as a post-hoc paired-rollout evaluation metric. A bipedal social-navigation survey ([arXiv:2406.17151](https://arxiv.org/abs/2406.17151)) cites, under the literal heading *minimally-invasive navigation*, "a social interference metric based on Kullback-Leibler divergence to measure the interference of the robot's path plan on the surrounding humans' future trajectory."

Any MIRN write-up that does not foreground SACSoN and Moder & Pauli in its first paragraph will be desk-rejected.

### 1.2 What survives

Five things remain genuinely open. Ranked by strength:

**(A0) Δ_H is misestimated three ways, and all three are now quantifiable.** *(Full argument in §4.4b — this is the strongest contribution available.)* Every existing method computes perturbation as a **prediction residual**, which confounds the robot's causal effect with the predictor's own error: a model with 0.4 m ADE reports ~0.4 m of "perturbation" for a robot that did nothing, and typical robot-induced deviations are the same order of magnitude. On top of that, the field's control condition is wrong (robot-stationary, not robot-absent — biasing the estimand toward zero), and **nobody has published the null distribution of trajectory divergence under no intervention**, so no published perturbation number has a known significance. PeRoI makes all three measurable. No paper was found making this critique.

**(A) The causal validity of Δ_H — nobody has checked.** Every paper above assumes that a learned predictor's response to removing the robot is a *causal* quantity. CausalAgents ([arXiv:2207.03586](https://arxiv.org/abs/2207.03586)) gives strong reason to doubt it: deleting agents that human annotators certified as **non-causal** shifts SOTA forecasters by **25–38% relative minADE**. Predictors latch onto agents that provably do not matter. So a predictor's Δ_H may be measuring its own input sensitivity rather than robot influence. The test is cheap — delete a random non-interacting pedestrian and check Δ_H ≈ 0 — falsifiable, currently unpublished, and useful to the field whichever way it resolves.

**(B) Δ_H as a *measurement* rather than a planner penalty.** Zhou et al. define IDP and FDP and then **never report their values** — only the nine standard navigation metrics. SACSoN reports collisions and personal-space time. Nobody has characterized the *distribution* of intervention cost: when it is large, when it is zero, how it varies with density and geometry. Tolstaya et al. ([arXiv:2104.09959](https://arxiv.org/abs/2104.09959)) found the analogous driving quantity is heavy-tailed and near-zero most of the time; if that holds for pedestrians, it is a publishable negative-or-positive result on its own and it determines whether the objective is even tunable.

**(C) A defensible reference behavior instead of "absent."** All prior work picks a baseline arbitrarily — robot-stationary (SACSoN), robot-force-off (Agrawal), robot-deleted (Zhou). Each is degenerate or circular in a different way (§4.3). FeAR's *Move de Rigueur* ([arXiv:2505.17739](https://arxiv.org/abs/2505.17739)) — compare against what a **norm-following** agent would have done — is the principled alternative and is unexploited in pedestrian navigation.

**(D) Accessibility-weighted asymmetric intervention.** Weight deviation cost by the *pedestrian's* cost of deviating. This has legal grounding (§13), fixes the sign problem (§4.4), and is novel relative to all six prior works.

### 1.3 The recommendation in one paragraph

Do not build "MIRN, the planner." Build **the measurement instrument and the validity study first**: a rigorous, causally-tested estimator of robot-induced pedestrian perturbation, characterized on real interventional data (PeRoI), with the placebo test as the centerpiece. That is 4–6 months of tractable work, it is publishable at a workshop or RA-L on its own, nobody has done it, and it is a *precondition* for any planner claim being believable. Only then close the loop with MPPI. If you build the planner first, you will spend six months tuning λ_h against a cost function you cannot demonstrate is measuring anything real.

---

## 2. Literature map

### 2.1 Surveys — read these first

- Mavrogiannis et al., *Core Challenges of Social Robot Navigation: A Survey*, ACM THRI 12(3), 2023 — [arXiv:2103.05668](https://arxiv.org/abs/2103.05668), [doi:10.1145/3583741](https://doi.org/10.1145/3583741). Notably states outright that *"testing only on the ORCA simulator environment is not necessarily informative"* (§4 relevance) and that optimizing safety+efficiency jointly is "an under-specification, and so additional constraints will be required."
- Singamaneni et al., *A Survey on Socially Aware Robot Navigation*, IJRR 43(10), 2024 — [arXiv:2311.06922](https://arxiv.org/abs/2311.06922).
- Francis et al. (52 authors), *Principles and Guidelines for Evaluating Social Robot Navigation Algorithms*, ACM THRI 2025 — [arXiv:2306.16740](https://arxiv.org/abs/2306.16740), [doi:10.1145/3700599](https://dl.acm.org/doi/10.1145/3700599). Eight principles (safety, comfort, legibility, politeness, social competency, agent understanding, proactivity, contextual appropriateness) and a three-axis metric taxonomy. **No reference implementation exists.**
- Methodological review of 85 papers, Jan 2020–Jul 2025 — [arXiv:2510.22448](https://arxiv.org/abs/2510.22448) — concludes *"the scientific community has not yet achieved an agreement on how Social Robot Navigation should be benchmarked."*

### 2.2 Crowd navigation via RL

CADRL ([arXiv:1609.07845](https://arxiv.org/abs/1609.07845)) → SA-CADRL ([arXiv:1703.08862](https://arxiv.org/abs/1703.08862)) → GA3C-CADRL ([arXiv:1805.01956](https://arxiv.org/abs/1805.01956)) → SARL ([arXiv:1809.08835](https://arxiv.org/abs/1809.08835), [doi:10.1109/ICRA.2019.8794134](https://doi.org/10.1109/ICRA.2019.8794134)) → DS-RNN ([arXiv:2011.04820](https://arxiv.org/abs/2011.04820)) → CrowdNav++ ([arXiv:2203.01821](https://arxiv.org/abs/2203.01821)).

Structurally, all reward goal progress minus collision/proximity penalties. **None contains a term measuring human displacement relative to a robot-free baseline.** Safety is a reward term, never a constraint; no formal guarantees; sim-to-real demos are consistently small-scale (one Jackal or TurtleBot, short indoor runs).

2025–2026: **HiCrowd** ([arXiv:2602.05608](https://arxiv.org/html/2602.05608)) — hierarchical RL producing a follow-point plus low-level MPC, with `r_follow` rewarding alignment with DBSCAN-clustered pedestrian group flow; deployed at a museum and Expo 2025 Osaka; no counterfactual. **NavThinker** ([arXiv:2603.15359](https://arxiv.org/abs/2603.15359), March 2026) — action-conditioned world model in Depth Anything V2 patch-feature space, autoregressive scene+human prediction feeding DD-PPO, deployed on Unitree Go2. **This is MIRN's proposed architecture minus the counterfactual branch.**

Do not cite "Logic-Guided Socially-aware Robot Navigation World Model" ([arXiv:2510.23509](https://arxiv.org/abs/2510.23509)) — **withdrawn by its authors**.

### 2.3 Action-conditioned and ego-conditioned prediction

- **Conditional Behavior Prediction** (Tolstaya et al., Waymo, ICRA 2021) — [arXiv:2104.09959](https://arxiv.org/abs/2104.09959). Models take a query future ego trajectory; defines per-query influence `D_KL[p(S^B | s^A) ‖ p(S^B)]` and scene interactivity `I(S^A, S^B)`. **Two findings MIRN must internalize:** conditioning bought only ~10% weighted-ADE improvement (3.486 → 3.142), and the interactivity histogram is dominated by near-zero scores. Expect Δ_H to be heavy-tailed and inert most of the time.
- RESET, *Revisiting Trajectory Sets for Conditional Behavior Prediction* — [arXiv:2304.05856](https://arxiv.org/abs/2304.05856).
- Joint prediction-and-planning: DIPP ([arXiv:2207.10422](https://arxiv.org/abs/2207.10422)), GameFormer ([arXiv:2303.05760](https://arxiv.org/abs/2303.05760)), PLUTO ([arXiv:2404.14327](https://arxiv.org/abs/2404.14327)), DTPP ([arXiv:2310.05885](https://arxiv.org/abs/2310.05885)).
- nuPlan reactivity caveat: replacing IDM with a learned reactive model shows **IDM-based simulation systematically overestimates planning performance and reshuffles method rankings** ([arXiv:2510.14677](https://arxiv.org/pdf/2510.14677)).

### 2.4 Counterfactual and causal reasoning in prediction

- **CausalAgents** (Roelofs et al., Waymo) — [arXiv:2207.03586](https://arxiv.org/abs/2207.03586), [code](https://github.com/google-research/causal-agents). Five human annotators per segment label agents whose presence could influence the ego; non-causal agents are deleted; SOTA forecasters shift **25–38% relative minADE** under a causally-null perturbation. **The single most important threat-to-validity citation for MIRN.**
- CausalMotion (CVPR 2022) — [arXiv:2111.14820](https://arxiv.org/abs/2111.14820), [code](https://github.com/vita-epfl/causalmotion). Latent split into invariant / style / spurious.
- CICR (Oct 2025) — [PMC12653532](https://pmc.ncbi.nlm.nih.gov/articles/PMC12653532/). SCM with social environment as confounder, front-door criterion.

All of this is counterfactual reasoning to make the *predictor* better. None closes the loop into a planner's cost.

### 2.5 Disturbance and minimum-intervention objectives

Covered in §3. This is the thread that matters.

### 2.6 The counter-literature: robots *should* influence humans

- Sadigh, Sastry, Seshia, Dragan, *Planning for Autonomous Cars that Leverage Effects on Human Actions*, RSS 2016 — [doi:10.15607/RSS.2016.XII.029](https://doi.org/10.15607/RSS.2016.XII.029), [PDF](https://www.roboticsproceedings.org/rss12/p29.pdf). **MIRN is this paper's negation and must say so explicitly.**
- Schwarting et al., *Social behavior for autonomous vehicles*, PNAS 2019 — [doi:10.1073/pnas.1820676116](https://doi.org/10.1073/pnas.1820676116). Social Value Orientation as a selfish↔altruistic dial; 25% prediction-error reduction on 92 human merges.
- Hong, Levine, Dragan, *Learning to Influence Human Behavior with Offline RL*, NeurIPS 2023 — [arXiv:2303.02265](https://arxiv.org/abs/2303.02265).
- Frozen robot problem: Trautman & Krause, IROS 2010 ([PDF](https://las.inf.ethz.ch/files/trautman10unfreezing.pdf)); Trautman et al., IJRR 2015 ([doi:10.1177/0278364914557874](https://doi.org/10.1177/0278364914557874)); mixed-strategy Nash for crowd navigation, IJRR 2025 ([doi:10.1177/02783649241302342](https://doi.org/10.1177/02783649241302342)); *Human Robot Pacing Mismatch* ([arXiv:2403.01542](https://arxiv.org/abs/2403.01542)).
- Legibility: Dragan, Lee, Srinivasa, HRI 2013 — [CMU RI](https://publications.ri.cmu.edu/legibility-and-predictability-of-robot-motion). Legible motion *deliberately* changes observer belief, typically by exaggerating away from the efficient path.

---

## 3. Closest competing approaches

Ordered by proximity to MIRN. Read all seven before writing anything.

### 3.1 SACSoN — the closest, and it is very close

Hirose, Shah, Sridhar, Levine. IEEE RA-L 9(1):49–56, 2024. [arXiv:2306.01874](https://arxiv.org/abs/2306.01874) · [project](https://sites.google.com/view/sacson-review/home) · [code](https://github.com/NHirose/SACSoN)

Abstract, verbatim: *"We introduce a definition for such behavior based on the counterfactual perturbation of the human: if the robot had not intruded into the space, would the human have acted in the same way? By minimizing this counterfactual perturbation, we can induce robots to behave in ways that do not alter the natural behavior of humans in the shared space."*

Mechanics:
```
ĥ_{t+1:t+β} = f_ψ(h_{t−α:t}, r_{t−α:t}, r_{t+1:t+β})     # robot-conditioned
ĥ^gw       = f_ψ(h_{t−α:t}, r_{t−α:t}, 0)                # counterfactual: robot STOPS
J_cp(θ)    = (1/N_s) Σᵢ (ĥ^gw_{t+i} − ĥ_{t+i})²
min_θ  J_nav + w_cp·J_cp + w_ps·J_ps      with w_cp = 10.0, w_ps = 100.0
```
`f_ψ` is a 3-layer fully-connected velocity predictor, frozen during policy training — so this is offline model-based optimization through a differentiable human-response model, not RL. Data: HuRoN, 75 h, 58.7 km, 4000+ interactions, 5 office environments, iRobot Roomba base, Jetson Xavier AGX + Intel i5 NUC, ~3 fps control, RICOH THETA S at 0.35 m. Results: 1 vs 20 pedestrian collisions and 57.6 s vs 85.2 s personal-space violation against ExAug. Author-stated limitation: single-pedestrian scenes.

**How MIRN differs, honestly:** (i) robot-*absent* rather than robot-*stationary* counterfactual — which SACSoN's authors explicitly name as the generalization they chose not to pursue; (ii) a distributional divergence rather than squared L2 on point predictions; (iii) closed-loop receding-horizon planning rather than an offline visuomotor policy. These are engineering deltas on a claimed idea.

**But (i) is a real technical argument, and it is MIRN's best one.** Under SACSoN's definition, a robot whose future action is zero gives `ĥ = ĥ^gw` and therefore **`J_cp ≡ 0` exactly**. Freezing is the global minimizer *by construction*. A robot-absent baseline correctly charges a stopped robot for being an obstacle in a corridor. That is a clean, demonstrable, publishable distinction.

### 3.2 Moder & Pauli — possibly closer still

*Proactive Robot Movements in a Crowd by Predicting and Considering the Social Influence*, IEEE RO-MAN 2022. [DOI](https://dl.acm.org/doi/10.1109/RO-MAN53752.2022.9900826)

Their Social Influence objective "measures the divergence between a scene prediction conditioned by the robot plan and a scene prediction independent of the robot plan," inside a model-predictive policy. That is Δ_H, as a divergence, inside an MPC — MIRN's exact formulation.

**Full text UNVERIFIED** (TechRxiv returned 403). **Obtain and read this before any further design work.** It may be a complete duplicate.

### 3.3 Zhou et al. — minimally-intrusive navigation

*Minimally-intrusive Navigation in Dense Crowds with Integrated Macro and Micro-level Dynamics*. [arXiv:2312.17076](https://arxiv.org/abs/2312.17076). Predecessor: ICRA 2022, [IEEE 9739572](https://ieeexplore.ieee.org/abstract/document/9739572) (author list **UNVERIFIED** — IEEE returned HTTP 418).

Three per-pedestrian distributions: No-Interference (NID, a Gaussian process `N(τ|μ_i,Σ_i)`), Peer-Influence (PID, reweighted by iterative best response), Total-Influence (TID).

```
IDP = max_i W_i( F(p_i^TID) , F(p_i^PID) )        # Wasserstein, Monte-Carlo optimal transport
FDP = ∫∫ |ρ(t,x,R(t))v(t,x,R(t)) − ρ₀(t,x)v₀(t,x)| dx dt    # L1 flux difference
```
The robot-absent branch is generated by simulating a *"unique 'parallel spacetime'"* without the robot. Planning by sampling-based search plus flow-sensitive A* over a triangulation map. Also defines **freezing number = stops > 3 s**.

**MIRN's Δ_H is IDP.** MIRN differs architecturally (learned model vs GP + social force; MPC vs sampling+A*) and lacks the macro/flow level entirely — arguably the more original half of their contribution.

**The opening:** IDP and FDP are used only as planner penalties. **The paper never reports IDP or FDP values** — only the nine standard navigation metrics. The measurement half is unoccupied.

### 3.4 Courteous Autonomous Cars

Sun, Zhan, Tomizuka, Dragan. IROS 2018. [arXiv:1808.02633](https://arxiv.org/abs/1808.02633)

```
C_R^court(x^t, u_R, u_H, θ_H) = max{0, C_H(x^t, u_R, u_H; θ_H) − C_H^{alt,*}(x^t; θ_H)}
```
Three reference variants; **Alt I is literally the human's optimal cost with no robot present**: `min_{u_H} C_H(x^t, u_H, θ_H)`. Validated on NGSIM merges.

**How MIRN differs, precisely:** cost space vs trajectory space. Consequences: (1) cost space requires an inferred human reward `θ_H` via IRL; trajectory space needs only a predictor; (2) the hinge `max{0,·}` makes courtesy *free* when the robot helps the human — whereas a symmetric `D(·,·)` penalizes helping, which is a genuine defect in MIRN as currently specified; (3) MIRN handles multimodality (a human splitting between homotopy classes) natively, which a scalar cost delta does not.

So MIRN is not merely Courteous AV in 2D — but it is the same *principle* in a different measurement space, and on the sign question it is the weaker version.

### 3.5 SICNav / SICNav-Diffusion — the right substrate, not the competitor

Samavi, Han, Shkurti, Schoellig. IEEE T-RO 2024. [arXiv:2310.10982](https://arxiv.org/abs/2310.10982) · [SICNav-Diffusion RA-L 2025, arXiv:2503.08858](https://arxiv.org/abs/2503.08858) · [field deployment, arXiv:2506.08851](https://arxiv.org/abs/2506.08851) · [code](https://github.com/sepsamavi/safe-interactive-crowdnav)

Humans modeled as ORCA agents; each human's ORCA optimization embedded as lower-level constraints in the robot's MPC, collapsed via KKT reformulation. Robot plan and human predictions solved jointly, collision-free by construction. Authors state the method "can influence pedestrian motion while explicitly satisfying safety constraints" — **influence is a resource it exploits, not a quantity it minimizes.**

Verified specs: horizon **1 s (sim) / 2 s (real)** at δt = 0.25 s, **10 Hz**, CasADi in sim / **acados** on hardware, 8-core i7-9700K, N = 3 and 5 humans in sim, **N ∈ {1,2,3} on real hardware**, Clearpath Jackal. Field deployment logged 6.73 km over 1 h 51 min with 49 manual takeovers; solve times 0.100–0.114 s. SICNav-Diffusion: 2-step DDIM, <100 ms, ≤8 pedestrians, 4.8 s horizon, RTX 4080.

**Critical caveat for MIRN:** SICNav gets action-conditioned prediction by committing to ORCA as a *differentiable analytic* human model, which the KKT reformulation requires. **A learned, non-differentiable Δ_H cannot enter that reformulation.** "Graft MIRN onto SICNav" is not a small extension.

### 3.6 Agrawal, Dengler & Bennewitz — Δ_H as evaluation metric

*Evaluating Robot Influence on Pedestrian Behavior Models for Crowd Simulation and Benchmarking*, ICSR 2024. [arXiv:2409.14844](https://arxiv.org/abs/2409.14844), [doi:10.1007/978-981-96-3519-1_34](https://doi.org/10.1007/978-981-96-3519-1_34)

Verbatim: *"we first set up the SRFM with its robot force component active and run the benchmark to record pedestrian trajectories. We then conduct a second run of the deterministic benchmark using the SRFM but with the robot force component disabled."* Deviation by **Fréchet distance**. The Social Robot Force Model adds a learned robot force `f_r` to a social force model, fit by nonlinear least squares on JRDB.

Results (RL policy vs DWA): 0.69±0.05 vs 0.76±0.04 (footpath), 1.25±0.17 vs 1.57 (crosswalk), 0.68±0.08 vs 0.75, 4.72±0.36 vs 5.67 (box), 0.70±0.05 vs 0.81.

**Two lessons.** First, this is exactly MIRN's Δ_H computed post hoc on paired deterministic rollouts — MIRN's delta is "close the loop," which SACSoN already closed. Second, **the effect sizes are small relative to variance** (0.69±0.05 vs 0.76±0.04). Power analysis is mandatory before running any comparison of this kind.

### 3.7 PeRoI — the dataset, and a warning about the sign

Agrawal, Ostermann-Myrau, Dengler, Bennewitz. [arXiv:2503.16481](https://arxiv.org/abs/2503.16481) (v3, March 2026). Data: [Zenodo DOI 10.5281/zenodo.18876411](https://doi.org/10.5281/zenodo.18876411), published 2026-06-01, **CC-BY-4.0, open access**.

Three controlled conditions, 18,669 trajectories, 142 hours, 15 Hz, two outdoor sites, fixed overhead camera + YOLOv11 + homography:
- **PD** — pedestrians only, **no robot**: 15,461 trajectories
- **PD-SR** — stationary robot: 2,948 (1,090 Toyota HSR / 837 Neobotix MPO700 / 1,021 Unitree Go1)
- **PD-MR** — moving robot: 260 (Go1, teleoperated, predefined path)

Also introduces NeuRoSFM (neural-augmented robot social force model): ADE improves 1.118 m → 0.744 m when robot-specific forces are modeled.

**The finding that breaks symmetric Δ_H:** PeRoI records **attraction rates of 1.6–7.96%** alongside 26.1–33.95% avoidance. Pedestrians sometimes move *toward* the robot out of curiosity. A symmetric divergence penalizes that identically to a forced swerve.

---

## 4. Novelty and gap analysis

### 4.1 The distinctions, and who owns which

| Concept | Owners |
|---|---|
| Collision avoidance | CADRL lineage, ORCA planners, SICNav lower level |
| Personal space / proxemics | Hall 1966; PSC in Francis et al.; HuNavSim intrusion metrics; SEAN violation counts |
| Social compliance / norm-following | SARL, SCAND imitation, VLM navigation |
| Pedestrian trajectory prediction | Trajectron++, AgentFormer, MTR, SICNav-Diffusion |
| Minimizing discomfort | Francis "comfort" principle; RoSAS-based studies |
| Minimizing human displacement | Agrawal et al. (Fréchet); Zhou et al. (IDP); Stratton et al. (Human PI) |
| Minimizing crowd-flow change | Zhou et al. FDP; [Minimally Invasive Social Navigation, arXiv:2005.03840](https://arxiv.org/abs/2005.03840) (`I_r = ρ_r‖ΔV_r‖²`, macroscopic, no robot-free baseline) |
| **Minimizing counterfactual intervention** | **SACSoN, Moder & Pauli, Zhou et al., Courteous AV, Li et al.** |

### 4.2 Is Δ_H just a smoother proxy for proxemics costs?

Partly, and the burden of proof is on MIRN. In free space Δ_H is dominated by lateral displacement, which is monotone in proximity — so Δ_H will correlate strongly with personal-space penalties already in SARL-class rewards.

Where they *must* decouple:
- **Narrow corridors** — close pass, near-zero deviation, because the human has nowhere else to go
- **Doorway/bottleneck contention** — large deviation at large distance, because the robot occupies the only feasible homotopy class
- **Crossing-flow interception** — timing matters more than distance

**If MIRN cannot exhibit a scenario suite where Δ_H-optimal and proxemics-optimal behavior visibly diverge, there is no paper.** This is cheap and falsifiable. Make it Experiment 1, not Experiment 5.

### 4.3 The degeneracy problem — five distinct pathologies

Let `P₁ = law of human trajectories under do(robot executes r)`, `P₀ = law under do(no robot)`, `Δ_H(r) = D(P₁,P₀)`.

**D1 — Absent-equivalence (the freeze degeneracy) is an identity, not a worry.** Under SACSoN's definition `J_cp ≡ 0` exactly when the robot stops. Even under true robot-removal, a robot parked out of the way and a robot that never departs both score ≈ 0. Δ_H is monotone in "amount of task attempted."

**D2 — Detour.** Δ_H is blind to robot cost; routing through empty space achieves Δ_H ≈ 0 at unbounded robot expense. Combined with D1, the zero level set is `{freeze} ∪ {detour} ∪ {any human-free path}` — the argmin is a *set*, so the best policy is formally unidentified.

**D3 — Scale non-comparability.** Δ_H ≡ 0 in empty scenes, so benchmark averages measure scene composition. Stratton, Hauser, Mavrogiannis ([arXiv:2405.11410](https://arxiv.org/html/2405.11410v1)) quantify this: crowd density vs success rate ρ = −0.867, vs min distance ρ = −0.735 (p<0.001).

**D4 — Sign blindness.** A divergence is non-negative and valence-free. PeRoI's 1.6–7.96% attraction rate makes this concrete.

**D5 — Estimator-induced non-identifiability.** P₀ is never observed; Δ̂_H depends on `f_ψ`, so policies can Goodhart the predictor. A predictor fit on observational robot-present data yields a *conditional*, not *interventional*, distribution. And SUTVA/no-interference is violated by construction — pedestrians interact — so the correct estimand is a **scene-level total effect**; any per-pedestrian decomposition is model-imposed.

### 4.4 The fixes the literature actually supports

1. **Replace "absent" with a normative reference.** FeAR's *Move de Rigueur* ([arXiv:2305.15003](https://arxiv.org/abs/2305.15003) grid-world ECAI 2023; [arXiv:2505.17739](https://arxiv.org/abs/2505.17739) continuous):
   ```
   FeAR_{i,j≠i}(S,A,μ) = Z · [ V_j(S,[A_i ← μ_i]) − V_j(S,A) ] / [ V_j(S,[A_i ← μ_i]) + ε ]
   ```
   where `V_j` is the hypervolume of agent j's feasible action space and `μ_i` is the normatively expected action. Two things this buys: the baseline is *norm-following behavior* rather than absence (killing D1 — freezing is itself a deviation from the MdR), and the quantity measured is **option restriction** rather than displacement.

2. **Share-normalized attribution.** Probst, Wenzel, Dasi ([arXiv:2509.12890](https://arxiv.org/abs/2509.12890), ICRA 2026, [code](https://github.com/HRI-EU/hri-metrics)): conflict `CP(t) = max(0, 1 − pDCE(t)/(r₁+r₂))`, `C(t) = CP(t)N(t)`, then **Responsibility `R_x = (1/C_total)∫CC_x^−(t)dt` with `Σ_x R_x = 1`** and Engagement `E_x`. Because shares sum to 1, **a frozen robot contributes nothing to conflict resolution and the humans' share goes to 1 — the freeze scores maximally badly.** Scale-free by construction, which also fixes D3.

3. **Constrain rather than scalarize.** `min_π Δ_H(π) s.t. success = 1, collisions = 0, T_robot ≤ (1+ε)T*`. SACSoN's `w_cp = 10.0` is an arbitrary, cross-paper-incomparable weight; ε is a reportable knob. Sweep ε and report the **Δ_H(ε) Pareto frontier**, comparing by dominance.

4. **Anchor the zero point on a human.** Report `Δ_H(π) − Δ_H(π_human)` using human-driven demonstrations. "As unobtrusive as a polite human" is the meaningful zero; "as unobtrusive as absent" is not achievable by any embodied agent.

5. **Add an option-preservation term to catch blocking.** Human empowerment `E(z_t^H) = max_w I(a_t ; z_{t+1}^H | z_t^H)` ([arXiv:2501.01539](https://arxiv.org/abs/2501.01539), HRI 2025) falls when a human's reachable set shrinks, penalizing a doorway-blocking robot even at zero displacement. Caveats the authors flag: evaluated only in CrowdNav circle-crossing with ORCA humans, 500 seeds per policy, **no human study**, and *"scenarios with lower success rates can still exhibit higher empowerment values"* — degenerate on its own.

### 4.4b The measurement critique — the strongest available contribution

This is the sharpest argument in the entire review, and it is a substantive, falsifiable critique of SACSoN's loss and of every "invasiveness" metric in the literature. **No paper was found making it** (though see the caveat at the end of this subsection).

**Every existing method computes perturbation as a prediction residual.** Run a trajectory predictor with the robot's future zeroed, subtract, call the difference perturbation. That quantity confounds two things with nothing to do with each other:

- the **causal effect** of the robot on the human, and
- the **error of your predictor**.

**A predictor with 0.4 m ADE reports ~0.4 m of "perturbation" for a robot that did absolutely nothing.** Typical robot-induced lateral deviations are on the same order — recall Agrawal et al.'s planner differences of 0.69±0.05 vs 0.76±0.04 m ([arXiv:2409.14844](https://arxiv.org/abs/2409.14844)), and PeRoI's NeuRoSFM improving ADE from 1.118 m to 0.744 m ([arXiv:2503.16481](https://arxiv.org/abs/2503.16481)). **The signal is at or below the noise floor of the instrument used to measure it.**

The consequence for planning is worse than for measurement. Optimizing a policy against that estimator partly optimizes the robot **to be predictable to your model**, not to be unobtrusive. That is a Goodhart failure with a specific, nameable mechanism — and it is testable in simulation for almost nothing (see E3 in §11).

**Three distinct misestimations, all now quantifiable against PeRoI:**

| Bias | Description | How to quantify |
|---|---|---|
| **B1 — wrong control condition** | SACSoN's null is robot-*stationary*; the correct null is robot-*absent*. A parked robot still bends flow, so the entire literature's estimand is **biased toward zero** by an unmeasured amount. | PeRoI **PD vs PD-SR** is exactly the parked-robot effect: 15,461 robot-free vs 2,948 stationary-robot trajectories, same sites, same tracking, **split across three embodiments** (HSR / MPO700 / Go1). The paper's finding that attraction varies sharply by embodiment suggests the effect is real and platform-dependent. |
| **B2 — estimator confounding** | Reported perturbation = causal effect + predictor error, inseparable in current practice. | Simulation sweep: hold true perturbation fixed at zero, vary predictor quality, show reported perturbation tracks predictor error. |
| **B3 — no detection floor** | Pedestrian trajectories vary enormously between two robot-free samples. Nobody has published the null distribution of trajectory divergence under no intervention, so no published perturbation number has a known significance. | Split PeRoI's PD (robot-free) data in half; compute the divergence statistic between halves; that **is** the reference distribution. Define **minimum detectable perturbation** (MDP) as the effect size a method can resolve. |

**B3 has a sting worth stating explicitly in the paper:** several published social-navigation improvements plausibly do not clear their own detection floor. Supplying that yardstick — and re-expressing existing published deltas in MDP units — is worth more than supplying the 47th planner.

**A fourth gap, unrelated but unclaimed: second-order perturbation.** The robot deflects person A; A deflects B; B never saw the robot. Every existing metric is dyadic robot-to-human. Perturbation *propagation through a crowd* is unexplored, visually compelling, and it is precisely what distinguishes "minimum intervention" from "keep your distance" — **a robot can be locally polite and globally disruptive, and single-pair metrics structurally cannot see it.**

**Caveat on this subsection.** The claim that nobody has published the predictor-error confounding argument comes from a targeted search that found nothing, in a session where the arXiv API was rate-limiting. Absence of evidence from a short search is weak for a claim this load-bearing. **Verifying B2's novelty is milestone 1-adjacent and should be done before the argument is built on.**

### 4.5 Conflict with legibility

Real, not superficial. Dragan et al. define legible motion as motion that *deliberately* changes an observer's belief about the robot's goal, typically by exaggerating away from the efficient path. Francis et al. list legibility and politeness as **separate** principles precisely because they trade off.

The resolution: legibility intervenes on human **belief**; MIRN penalizes intervention on human **motion**. A robot can be belief-legible and motion-unobtrusive if the legibility signal is an early, small, unambiguous course commitment.

**But this implies a hard design constraint.** Sadigh's and Courteous AV's merging examples both show a *small early* influence prevents a *large late* one. A myopic per-step Δ_H will therefore be strictly worse in cumulative intervention than a policy that intervenes early. **Δ_H must be an integral over the full episode, not a per-MPC-step cost, or it systematically picks the wrong branch.**

### 4.6 Where the field's metrics actually stand — the motivation slide

Existing benchmarks measure the **robot's** trajectory, not the humans'. Verified inventories:

- **Arena-Bench / Arena-Rosnav 2.0** ([arXiv:2206.05728](https://arxiv.org/abs/2206.05728), [arXiv:2302.10023](https://arxiv.org/abs/2302.10023)) — Table I/II byte-identical: success rate, collisions, time to goal, path length, velocity, acceleration, movement jerk, curvature, angle over length, roughness, clearing distance. All robot-side.
- **Arena 3.0** ([arXiv:2406.00837](https://arxiv.org/abs/2406.00837)) adds exactly three social metrics: *time in private zone* (0.5 m radius), *time facing pedestrians*, *time seen by pedestrians*. All still functions of robot pose. Drops `Clearing Dist.`
- **Arena 4.0** ([arXiv:2409.12471](https://arxiv.org/abs/2409.12471)) contains **no navigation-metric table** — only scene-graph generation metrics. Nav set presumably inherited but never re-enumerated (**UNVERIFIED at paper level**).
- **SocNavBench** ([arXiv:2103.00047](https://arxiv.org/abs/2103.00047)) — path length/ratio, path irregularity, goal traversal ratio, traversal time, average speed, energy expenditure `∫‖v‖²dt`, acceleration, jerk, closest-pedestrian distance, TTC. States the assumption that *"interrupting pedestrians by inducing deviations from their preferred trajectory is a sign of poor social navigation"* — yet its pedestrians are **replayed ETH/UCY tracks that do not react**, making that deviation structurally unmeasurable.
- **SEAN 2.0** ([metrics docs](https://sean.interactive-machines.com/docs/metrics)) — the closest existing thing to human-side attribution: *directional* proxemic violations, **Robot-on-Person vs Person-on-Robot**.
- **HuNavSim** ([hunav_evaluator](https://github.com/robotics-upo/hunav_sim/tree/master/hunav_evaluator), RA-L 2023) — ~28–30 metrics including group intrusions, average pedestrian velocity, and **social work** (social force on robot + obstacle force on robot + social force on agents).
- **CrowdNav/SARL** — discomfort frequency `t_disc/T` where `d_t < 0.2 m`. Note 0.2 m is far inside Hall's intimate zone, and in the paper's "invisible" setting ORCA humans do not react at all.
- **Bench-MR** ([RA-L 2021](https://idm-lab.org/bib/abstracts/papers/ral21.pdf), [repo](https://github.com/robot-motion/bench-mr)) — cleaner and better-specified, but wheeled motion planning with no social component; its jerk metric is dead code behind `#if 0`.

**Coverage against MIRN's checklist:** human speed change — only HuNavSim's average pedestrian velocity and Stratton's Human AA. Human path deviation — only SACSoN and the two disturbance papers, never as a benchmark metric. **Forced stops — robot-side only, never human-side.** Human time-to-goal loss — only Stratton's Human GPS. Group disruption — intrusion counts only. Flow disruption — Zhou et al. only.

**Code-vs-paper credibility warning.** `arena-evaluation`'s [`get_metrics.py`](https://github.com/Arena-Rosnav/arena-evaluation) thresholds failure at `collision_amount >= 3` while every paper says "< 2 collisions"; acceleration and jerk are raw successive differences **not divided by dt** (code units m/s despite claimed m/s² and m/s³); angle-over-length has no wraparound normalization; `Clearing Dist.` is commented out; Arena 3.0's three social metrics are not present in any public repo; last push **2023-05-26**, predating Arena 3.0. Treat Arena as a scenario generator and ROS 2 integration layer, not a trustworthy metrics pipeline.

### 4.7 The most important empirical anchor

**Stratton, Singamaneni, Goyal, Alami, Mavrogiannis** ([arXiv:2601.09856](https://arxiv.org/abs/2601.09856)) — 80 participants, two sites, Stretch + PR2, motion capture. Introduces genuine human-side metrics: **Human GPS** (goals/second), **Human PI** (path irregularity, rad/m), **Human AA** (average acceleration), plus RoSAS Discomfort and NASA-TLX.

Findings load-bearing for MIRN:
- **ADE is not a reliable predictor of navigation performance or human impressions**
- The human-cooperation assumption breaks down in constrained space
- *"when the robot took longer paths (higher Robot PI), humans were able to move faster (higher Human AS) at both sites (p<0.01)"*
- *"faster, more direct robot motion … correlated with higher Discomfort"*

That is a **directly measured intervention-vs-efficiency trade-off** — evidence the Pareto frontier MIRN posits actually exists.

### 4.8 And the number that motivates the whole project

In SN26's human-rating study ([arXiv:2509.01251](https://arxiv.org/abs/2509.01251)) — 4,402 rated trajectories, 49 raters recruited / 22 retained, continuous 0–1 slider:

| Metric | Pearson r vs human rating |
|---|---|
| Learned ALT metric | **0.797** (ρ = 0.684) |
| Success | 0.366 |
| Collisions with objects | −0.387 |
| Max near humans | −0.415 |
| **Min distance to humans** | **0.009** (ρ = 0.397) |

**The field's most-used social metric correlates with human judgment at r = 0.009.** That is the motivation slide — and also the bar any new metric must clear.

Corroborating: *Metrics vs Surveys* ([arXiv:2510.02941](https://arxiv.org/abs/2510.02941), RO-MAN 2026), 11 metrics × 4 Likert dimensions, 70 respondents, 24 Jackal/VICON trials — strong correlates: min distance to person, proxemics-intimate, proxemics-social, time-to-goal, average robot speed; **weak: social work, path length**; smoothness poorly captured. (Note: participant nationalities read Italy/Spain/France in one fetch and Italy/Spain/Poland in another — check the PDF before citing.)

---

## 5. Recommended research question

### 5.1 The reframe

Do not ask *"can a robot minimize its perturbation of humans?"* — that has been answered affirmatively four times. Ask:

> **Is the counterfactual perturbation that minimum-intervention navigators optimize a causally valid quantity, and does optimizing it produce behavior humans actually prefer?**

This is a validity study of an existing objective. It is unclaimed, cheap, falsifiable, and useful whichever way it resolves. The planner follows from it rather than preceding it.

### 5.2 Three falsifiable hypotheses

**H1 — Distributional intervention cost has superior criterion validity.**
- *Claim:* W₂-Δ_H against a Move-de-Rigueur reference predicts human obtrusiveness judgments better than any single deployed hand-crafted metric, and better than its own Dirac special case.
- *IV:* metric used to score a trajectory. *DVs:* Spearman ρ and pairwise-preference accuracy against held-out human ratings.
- *Baselines:* min-distance-to-human (r = 0.009 / ρ = 0.397 in SN26, but among the *strongest* correlators in Metrics-vs-Surveys — a real bar), social work, PSC, the SN26/ALT learned metric (r = 0.797), SACSoN-style squared-L2 displacement.
- *Falsified if:* ρ(W₂-Δ_H) is not significantly greater than ρ(min-distance) under a paired bootstrap at α = 0.05, **or** it fails to beat the Dirac/ADE special case — i.e. the distributional machinery buys nothing.

**H2 — The degeneracy is real, and a time budget removes it at bounded cost.**
- *Claim:* unconstrained `argmin Δ_H` produces freezing or gross detour; a constraint `T ≤ (1+ε)T*` eliminates it; and Δ_H(ε) is a non-flat, knee-shaped frontier.
- *IV:* ε, swept. *DVs:* robot freeze rate (stops > 3 s, per Zhou et al.), path-length ratio, Δ_H, success rate, Responsibility `R_robot`.
- *Baselines:* unconstrained `argmin Δ_H`; SACSoN's fixed `w_cp = 10.0` scalarization.
- *Falsified if:* the unconstrained minimizer does not degenerate; **or** Δ_H(ε) is statistically flat across ε (no trade-off exists and the framing is vacuous); **or** no ε achieves both low freeze rate and Δ_H below the human-demonstration reference.

**H3 — Reactive-crowd simulators are biased estimators of real intervention cost, and the bias reverses policy rankings.**
- *Claim:* ORCA/SFM simulators systematically **under**-estimate Δ_H because they model the robot as a reciprocal pedestrian, whereas real pedestrians apply distinct robot-specific forces.
- *IV:* measurement environment — ORCA sim / plain SFM / robot-force-augmented SRFM / real PeRoI PD vs PD-MR contrast.
- *DVs:* Δ_H magnitude; Kendall τ between each environment's ranking of ≥4 fixed policies and the real-data ranking.
- *Falsified if:* τ(ORCA-sim, real) is not significantly below τ(SRFM-sim, real), or the magnitude bias is not consistently signed.
- *Prior support making this non-trivial:* PeRoI shows robot-specific forces reduce ADE 1.118 → 0.744 m; Agrawal et al. show planner deviation differences are small relative to variance (0.69±0.05 vs 0.78±0.04), so **power analysis is mandatory**.

**H4 — reported perturbation is confounded with predictor error.**
- *Claim:* the perturbation values published in the social-navigation literature are dominated by trajectory-predictor error rather than by robot causal effect, and existing methods cannot distinguish the two.
- *IV:* predictor quality (swept by training-set size, model capacity, or injected noise), with **true perturbation held fixed at zero** (robot present but non-interacting, or robot absent entirely).
- *DV:* reported Δ_H.
- *Falsified if:* reported Δ_H is flat in predictor error when true perturbation is zero — i.e. the estimator is genuinely isolating causal effect.
- *Why this is the strongest hypothesis in the set:* it is cheap (simulation only, no real data, no planner), it is a direct critique of a published loss function (SACSoN's `J_cp`), and it stands **whether or not any MIRN policy ever works**.

**H5 — the stationary-robot control condition is biased toward zero, measurably.**
- *Claim:* a parked robot measurably perturbs pedestrian flow, so SACSoN-style robot-stationary nulls understate true perturbation by a non-trivial, embodiment-dependent amount.
- *IV:* control condition (robot-absent PD vs robot-stationary PD-SR) and robot embodiment (HSR / MPO700 / Go1).
- *DV:* divergence between pedestrian trajectory distributions.
- *Falsified if:* PD and PD-SR distributions are statistically indistinguishable at adequate power — in which case SACSoN's null is fine and this branch of the critique closes.

**H0 — the placebo test, which gates all three.**
- *Claim:* a learned robot-conditioned predictor's response to deleting the robot is causal, not input-sensitivity artifact.
- *Test:* delete a random **non-interacting** pedestrian instead of the robot; Δ_H should be ≈ 0.
- *Prior reason to doubt:* CausalAgents' 25–38% shift under provably-null deletions.
- *If this fails,* H1–H3 are measuring model artifacts and the finding itself is the paper.

### 5.3 Recommended formulation

```
π* = argmin_π  E_scenarios[ (1/N) Σ_h  W₂( P(H_h | do(π)) , P(H_h | do(π_MdR)) ) ]
     s.t.  success ≥ 1−δ,  collisions = 0,
           T_robot ≤ (1+ε)·T*,  R_robot ≥ ρ_min,  ΔEmp_h ≤ κ  ∀h
```
reported as a **frontier over ε**, normalized against `π_naive` on identical seeds, and anchored against `π_human`.

**Why W₂ over KL.** KL diverges when supports do not overlap — the normal case for narrow or near-deterministic trajectory predictors (cf. [arXiv:1701.07875](https://arxiv.org/abs/1701.07875)). W₂ with an L2 ground cost is finite, is a true metric (symmetry + triangle inequality), carries units of **metres**, and **reduces exactly to RMS displacement when both predictive distributions collapse to Diracs** — so it strictly generalizes SACSoN's `J_cp` and degrades gracefully to it. Costs: exact OT is O(m³ log m) in samples (Sinkhorn ≈ O(m²/ε)), and empirical W₂ converges at the slow n^(−1/d) rate, so use entropic or sliced variants and run a power analysis.

**KL precedent, if you prefer it:** Tolstaya's interactivity score ([arXiv:2104.09959](https://arxiv.org/abs/2104.09959)) and Jaques et al.'s causal social influence `c_t^k = Σ_{j≠k} D_KL[p(a_t^j | a_t^k, s_t^j) ‖ p(a_t^j | s_t^j)]`, shown equal in expectation to mutual information `I(A^j;A^k|z)` ([arXiv:1810.08647](https://arxiv.org/abs/1810.08647), ICML 2019).

---

## 6. Technical architecture

Component-by-component, with the ablation that would justify each. **The proposed stack is roughly 3× more complex than the evidence supports.**

### 6.1 Drop: learned world model

Navigation World Models (Bar, Zhou, Tran, Darrell, LeCun, CVPR 2025) — [arXiv:2412.03572](https://arxiv.org/abs/2412.03572), [code](https://github.com/facebookresearch/nwm). 1B-parameter Conditional Diffusion Transformer, CEM over 120 samples, 250 diffusion steps, 2 s horizon. **Table 8 reports 30.3 s per trajectory**; 14.7 s with time-skip; 0.4 s only after distilling 250 steps to 6. The paper calls inference speed "a key bottleneck in deploying NWM in real-world robotics" and reports **mode collapse in unseen environments**.

Driving world models are worse: Vista is 2.5B params at 50 sampling steps, "computationally expensive" per its authors ([arXiv:2405.17398](https://arxiv.org/abs/2405.17398)); GAIA-1/GAIA-2 ([arXiv:2309.17080](https://arxiv.org/abs/2309.17080), [arXiv:2503.20523](https://arxiv.org/abs/2503.20523)) and Genie ([arXiv:2402.15391](https://arxiv.org/abs/2402.15391)) publish **no inference latency at all**. **No paper closes a real control loop on a generative world model at 10 Hz.**

Four reasons beyond cost: (i) a world model spends capacity modeling robot self-motion and static geometry you already know **in closed form** for a differential-drive base; (ii) **"delete the robot" is not well-defined in pixel space** — the robot is entangled in the generated image, whereas in a trajectory model it is a single input substitution; (iii) OOD mode collapse is disqualifying for a safety-adjacent cost; (iv) the RSSM world models that do run on real robots aren't doing anything a conditional trajectory predictor cannot.

*Fair counter-argument to acknowledge in the paper:* a world model would capture human reactions to robot **appearance** and expressive motion, which a trajectory-only predictor misses entirely. If the thesis turns out to hinge on legibility, that is a genuine limitation of the simpler design.

*Ablation that would earn it:* conditional predictor + known unicycle dynamics vs learned world model **at matched wall-clock latency**. At matched latency the world model gets ~6 denoising steps. It will lose.

### 6.2 Drop to an ablation row: GNN / graph transformer

Social-STGCNN's own ablation replaces its tuned inverse-L2 adjacency with a uniform all-ones matrix — no graph at all — and ETH/UCY moves only **0.44/0.75 → 0.49/0.79** ADE/FDE ([arXiv:2002.11927](https://arxiv.org/abs/2002.11927)).

STAR swaps only the spatial operator, everything else fixed ([arXiv:2005.08514](https://arxiv.org/abs/2005.08514)):

| Operator | ADE/FDE |
|---|---|
| GCN (message passing) | 1.86 / 3.34 |
| GAT | 0.48 / 1.02 |
| **Plain multi-head attention** | **0.56 / 0.92** |
| Graph-flavored attention | 0.41 / 0.87 |

Message-passing is catastrophically worse; plain attention is within noise of the graph variant. At driving scale the graph disappears entirely: Wayformer's thesis is that a homogeneous attention stack with no hand-built scene graph reaches SOTA ([arXiv:2207.05844](https://arxiv.org/abs/2207.05844)); MTR/MTR++ are transformer encoder–decoders over agent and polyline tokens ([arXiv:2209.13508](https://arxiv.org/abs/2209.13508), [arXiv:2306.17770](https://arxiv.org/abs/2306.17770)); AgentFormer gets structure from *agent-aware attention* over a flat token sequence ([arXiv:2103.14023](https://arxiv.org/abs/2103.14023)).

*Cheaper alternative:* per-agent tokens plus one dense self-attention block with agent and time identity embeddings.

*Decisive ablation:* hold capacity, optimizer, decoder fixed; swap **only** the agent-mixing operator across {none, mean-pool, k-NN graph attention, dense self-attention}. Report ADE/FDE **plus collision rate and NLL**. Include constant velocity as a mandatory row.

### 6.3 Drop: CVAE latent variables

MTR's ablation, same backbone and data ([arXiv:2209.13508](https://arxiv.org/abs/2209.13508)): latent learnable embedding mAP **0.2633** → static intention query **0.3059** → +iterative refinement 0.3171 → +dense future prediction **0.3437**. MTR++ reproduces: 0.2826 → 0.3379, **+5.53% mAP** purely from swapping latents for anchors.

Trajectron++'s ablation is instructive for a different reason: its largest win is **not** the |Z|=25 categorical latent but the **unicycle dynamics integrator** (nuScenes FDE 0.18 → 0.07 m; KDE NLL 0.81 → −4.28) ([arXiv:2001.03093](https://arxiv.org/abs/2001.03093)). No ablation removing the latent appears in that paper — its necessity is **UNVERIFIED**, which is itself telling.

**Keep the dynamics head. Drop the latent. Use k-means anchors over training endpoints.**

### 6.4 Defer to v2: diffusion

Latency is the whole story, and most of this literature does not report it.

| Method | Steps | Latency | Hardware | Agents / horizon |
|---|---|---|---|---|
| MID (as measured by LED) | 100 / 50 / 10 | ~886 / ~446 / ~87 ms | RTX 3090 | 11 / 4.0 s |
| [LED](https://arxiv.org/abs/2303.10895) τ=3/5/10 | 3 / 5 / 10 | **~30 / ~46 / ~89 ms** | RTX 3090 | 11 / 4.0 s |
| [SingularTrajectory](https://arxiv.org/abs/2403.18452) | 10 | **not reported** | A6000 (train) | — / 4.8 s |
| [MotionDiffuser](https://arxiv.org/abs/2306.03083) | 32 (Heun) | **not reported** | not reported | — / ≤8 s |
| [SICNav-Diffusion](https://arxiv.org/abs/2503.08858) | **2 (DDIM)** | **<100 ms** | RTX 4080 | ≤8 peds / 4.8 s |
| [MoFlow](https://arxiv.org/abs/2503.09950) | 100 → **1** | 100× ratio only, no ms (**UNVERIFIED**) | UNVERIFIED | 11 / 4.0 s |
| [HPTR](https://arxiv.org/abs/2310.12970) (non-diffusion) | n/a | **37 ms fp32 / 25 ms fp16** | RTX 2080Ti, batch 1 | **64** / 8 s |

**Step count, not agent count, is the budget.** Every real-time result is 1–5 effective steps. But HPTR does 64 agents in 25 ms with no diffusion at all. For v1 a deterministic query decoder gives strictly more.

*Ablation that earns it:* does diffusion improve **calibration** (NLL, coverage of the true trajectory by the predicted set) over an anchor-based mixture head **at matched latency**? Not minADE. If not, the multimodality is decorative.

### 6.5 Keep, but small: transformer trajectory model

Sobering context: a **constant velocity model** scores 0.39/0.83 on ETH/UCY, and CVM with angular sampling under best-of-20 scores **0.28/0.56** ([arXiv:1903.07933](https://arxiv.org/abs/1903.07933)), replicated 2024 ([arXiv:2308.05194](https://arxiv.org/abs/2308.05194)). Six years of architecture work moved average ADE from Trajectron++'s 0.19 to ~0.16 m ([arXiv:2503.24272](https://arxiv.org/html/2503.24272v1)) — about **3 cm**. And the metric is gameable: a hand-crafted **uniform predictor** matches SOTA minADE₂₀ while producing 3.3–15.7% collisions ([arXiv:2209.12243](https://arxiv.org/abs/2209.12243)).

Sizes: MTR is 65.8M params at 193 ms for 32 agents (RTX 8000); MTR++ is 86.6M at 118 ms. Wayformer's transferable result: **latent query attention gives 2×–16× speedup with minimal quality loss**, and above ~32 ms the fusion choice stops mattering. Note Waymo ran **no Motion Prediction challenge in 2025 or 2026** ([challenges](https://waymo.com/open/challenges/)); last contested standings are 2024's (MTR v3, Soft mAP 0.4967).

**Recommendation:** a **1–5M parameter** agent-token transformer, not a 65M one. Evaluate on **JRDB-Traj** ([arXiv:2311.02736](https://arxiv.org/abs/2311.02736)) — forecasting from raw robot sensor streams, the only benchmark matching the deployment condition — not ETH/UCY, which is saturated and metric-compromised.

*Ablation:* transformer vs CVM-with-sampling on JRDB-Traj under **collision rate and NLL**. If it cannot beat CVM on a calibration metric, it is not earning its parameters.

### 6.6 Keep — this is the core: action-conditioned prediction, one model, three conditions

Δ_H is an **individual treatment effect under a continuous treatment** (the robot's future action sequence), with the null arm being "no robot."

**Two separate models is statistically unsound.** A robot-free prior fit on ETH/UCY and a robot-conditioned model fit on your own logs differ in scene, sensor, tracker, crowd density, and time of day. `D(p_cond, p_free)` then contains a **dataset-shift bias confounded with the causal effect**, and that bias does *not* shrink with more data. You also sum two independent approximation errors instead of cancelling them.

**One model is a paired design, and that is right.** Evaluating `f(h_past, r_past, r_future)` at the real plan and again at the null shares encoder, scene features, and every systematic bias — which largely cancel in the *difference*, for the same reason a paired t-test beats an unpaired one. Variance of the contrast is far lower and bias is first-order cancelled.

**But one model creates a positivity failure.** In robot-present logs `r_future = ∅` never occurs; the model's output there is unconstrained extrapolation and nothing in training penalizes it for being wrong. SACSoN sidesteps this with **zero future robot motion**, which does occur in data — at the cost of the systematic, signed bias described in §3.1.

**The sound design:**
1. Train **one** model on a **mixture** of robot-present and robot-absent episodes with an explicit robot-presence indicator, so the null arm is genuinely observed and positivity holds. PeRoI's PD / PD-SR / PD-MR structure is exactly this.
2. **Randomize the robot's actions during data collection.** The robot's policy *is* the treatment-assignment mechanism. If it slows in dense crowds, then "robot slow" correlates with "crowd slow" and the model attributes crowd slowness to the robot. Injecting exploration noise is the standard off-policy-evaluation fix. (Whether HuRoN did this is **UNVERIFIED**; SACSoN's `J_int = min_i |r_{t+i} − h_{t+i}|` interaction-seeking term exists precisely to manufacture interventional variation.)
3. **Run the placebo test.** Delete a random non-interacting pedestrian; confirm Δ_H ≈ 0.

### 6.7 Outer loop: MPPI

MPPI is derivative-free in the cost — it samples K control perturbations, rolls each forward, evaluates a **scalar** cost S(V) per rollout, and forms an `exp(−S/λ)`-weighted update. The cost is only ever queried, never differentiated, never required convex or continuous. Exactly what a neural Δ_H needs.

Primaries (the usual ICRA titles are IEEE-only): Williams, Aldrich & Theodorou ([arXiv:1509.01149](https://arxiv.org/abs/1509.01149)); Williams et al., *Information Theoretic MPC* ([arXiv:1707.02342](https://arxiv.org/abs/1707.02342)).

| Criterion | Sampling MPPI | Gradient MPC | Deep RL |
|---|---|---|---|
| Δ_H must be differentiable | **No** | Yes (or surrogate) | No at deploy |
| Handles non-convex Δ_H | **Yes, natively** | Poorly | Absorbed |
| Latency | 50+ Hz CPU @1000×56; 125 Hz GPU (STORM) | 10 Hz, 1–3 humans (SICNav) | Sub-ms |
| Safety guarantees | None intrinsic — needs a filter | Hard constraints if feasible | None |
| λ-tuning | **Edit weights, no retrain** | Easy, can break feasibility | **Requires retraining** |

**MPPI's decisive research advantage: λ_g, λ_c, λ_h are runtime knobs.** The ablation that justifies the entire paper — λ_h = 0 vs λ_h > 0 — is a config change, not a retraining run. Under RL those weights are baked in at training time.

Reference implementations: **Nav2 MPPI Controller** — `batch_size=1000`, `time_steps=56`, `model_dt=0.05` (2.8 s horizon), `iteration_count=1`, `temperature=0.3`, `gamma=0.015`, **CPU-only, vectorized, "50+ Hz on a modest Intel 4th-gen i5"** ([README](https://raw.githubusercontent.com/ros-navigation/navigation2/main/nav2_mppi_controller/README.md)). Added 2023-03-01 (Iron) — mature, not experimental. **STORM** ([arXiv:2104.13542](https://arxiv.org/abs/2104.13542)) — **<8 ms (125 Hz)** on GPU with explicit "learned cost functions from raw sensor data." **MPPI-Generic** ([arXiv:2409.07563](https://arxiv.org/abs/2409.07563), [repo](https://github.com/ACDSLab/MPPI-Generic)) — header-only CUDA with a custom-cost API, examples at 2048 rollouts × 100 steps. cuRobo ([arXiv:2310.17274](https://arxiv.org/abs/2310.17274)) is partly L-BFGS and less suited to a black-box cost.

### 6.8 Safety layer: keep Δ_H soft

Lu et al. ([arXiv:2404.05952](https://arxiv.org/abs/2404.05952)) document the crowd failure directly: *"in crowded scenarios, effective solutions may not be obtained due to infeasibility problems"* — fixed by softening CBF constraints with an exact penalty (validated on an MR1000). The closest architectural analogue to MIRN is Xue, Zhang, Åkesson & Figueroa ([arXiv:2601.10233](https://arxiv.org/abs/2601.10233), Jan 2026): GP + NN motion prediction feeding **modulated CBFs** via a prediction-to-barrier online learning pipeline.

**Design rule: enforce only `C_collision` through the CBF filter; keep Δ_H as a soft MPPI cost.** A miscalibrated learned cost inside a hard constraint produces exactly the infeasibility above.

Counterweight worth reading: *"Is Your Safe Controller Actually Safe? A Critical Review of CBF Tautologies and Hidden Assumptions"* (arXiv:2603.06954, includes a crowd-navigation study; listing-only, **UNVERIFIED**).

### 6.9 Latency budget — the constraint that dictates the design

**Nav2's defaults imply ~56,000 predictor queries per control cycle** (1000 rollouts × 56 timesteps) if Δ_H is evaluated per state. At even 66 µs each that is **3.7 seconds per cycle**. Not close.

The literature splits cleanly:
- *Path A — robot-independent, predict once.* DRA-MPPI: K=400, 4.0 s horizon, 5 Hz, 96.9 ms (4 agents) / 114.2 ms (12 peds) on i7 + RTX 2080 ([arXiv:2506.21205](https://arxiv.org/abs/2506.21205)) — but predictions are constant-velocity-plus-Gaussian computed once outside the rollout loop. PGIF-MPPI: K=512 at 10 Hz in **3.06–3.42 ms on an RTX 3050** ([arXiv:2608.08323](https://arxiv.org/html/2608.08323)) because its human cost is closed-form Gaussian. **These numbers do not transfer to MIRN.**
- *Path B — robot-conditioned, K passes actually paid.* IANN-MPPI ([arXiv:2507.11940](https://arxiv.org/abs/2507.11940)): K=1500, 5.1 s planning / 2.4 s prediction, Δt=0.3 s → **~3.3 Hz** on i9-12900HK + RTX 3080 Ti Mobile. Their timing table is the money quote: **constant velocity 0.026 s; distilled Student-SGAN 0.10 s; original SGAN 0.34 s.** They reached real time only by *distilling*.

**The amortization pattern to copy is DTPP** ([arXiv:2310.05885](https://arxiv.org/abs/2310.05885), ICRA 2024): query-centric transformer where "the encoder is only called once and the decoder is only called once per planning stage." 30 candidate ego branches then top-5 × 6, 8 s horizon, ≤10 neighbors: **98.0 ms total on RTX 3080** (encode 6.8, expand 8.2, predict 34.9, expand 14.8, predict 33.3) — a **6.1× speedup over early fusion (599.3 ms)**.

**Two architectural fixes:**
1. **Evaluate Δ_H on clustered whole trajectories, not per state.** Δ_H is a property of a *plan*, not a state. Cluster MPPI's K samples into **20–50 representative plan modes** (k-means over control sequences), decode Δ_H once per mode, assign each rollout its cluster's value. 56,000 queries → 20–50.
2. **Encode once, decode many**, DTPP-style.

**Realistic 100 ms budget:** ~7 ms shared scene encode, ~35–45 ms conditional decode across plan modes, ~45 ms for cost evaluation and solver. **The binding constraint is the number of distinct plan modes — not agents, not noise samples.**

No verified Jetson Orin latency for a multi-agent conditional predictor was found (**UNVERIFIED**); every real-time crowd-nav result above ran on a laptop or desktop discrete GPU. Plan for a tethered/backpack GPU or budget a distillation step.

### 6.10 Final architecture

```
Pedestrian tracks + robot state
        │
        ▼
  Agent-token transformer encoder  (1–5M params, dense self-attention,
        │                           NO graph, NO CVAE latent)          ← encode ONCE per cycle
        ├──────────────────────────────────────────┐
        ▼                                          ▼
  Decode | r_future = π_MdR (reference)     Decode | r_future = plan mode k
        │                                          │                  ← decode PER MODE (20–50)
        └──────────────┬───────────────────────────┘
                       ▼
              W₂ divergence  →  Δ_H(mode k)      [+ Responsibility, empowerment terms]
                       │
                       ▼
        MPPI  (K=1000 rollouts → k-means → 20–50 modes;  λ_g, λ_c, λ_h runtime knobs)
                       │
                       ▼
             CBF safety filter  (collision ONLY — Δ_H stays soft)
                       │
                       ▼
                  Robot action → replan
```
Anchor-based mixture decoder head with an explicit **unicycle dynamics integrator** (Trajectron++'s actual win). Diffusion deferred to v2.

---

## 7. Counterfactual methodology

Six routes, with the assumptions each requires.

**(1) Paired simulation rollouts with common random numbers.** Verified practitioners: Agrawal et al. toggle the SRFM robot-force term off and re-run the deterministic benchmark ([arXiv:2409.14844](https://arxiv.org/abs/2409.14844)); Zhou et al. simulate a *"parallel spacetime"* ([arXiv:2312.17076](https://arxiv.org/abs/2312.17076)). *Assumptions:* the crowd simulator is the true data-generating process; determinism/CRN so pairing is valid; robot influence is separably additive (SRFM literally assumes an additive robot force). Cheapest and defensible for first results — **as long as the paper does not claim real-world validity.**

**(2) Causal inference / potential outcomes.** CausalAgents' delete-the-agent perturbation is the direct analogue of "remove the robot from the scene tensor," and its **25–38% relative minADE shift under a causally-null perturbation** is the strongest evidence that naive deletion yields a corrupted counterfactual. Mitigations: CausalMotion's invariant/style/spurious decomposition; CICR's front-door criterion. *Assumptions:* no unmeasured confounding between robot presence and pedestrian intent — violated in practice, since robots are deployed *where* people are, and people who dislike robots reroute before entering the sensed region (selection on the counterfactual).

**(3) Learned robot-free natural-motion prior + robot-conditioned predictor, take the divergence.** **No paper does this**; it was searched for directly. Adjacent: NeuRoSFM and SRFM learn explicit robot-induced forces atop learned inter-human dynamics. *This is a real remaining novelty claim* — but the assumption is severe: the two predictors must be **calibrated on a common footing**, or the divergence measures dataset shift (site, density, camera, annotation pipeline) rather than robot effect. Any honest version needs a same-site, same-sensor paired corpus. **PeRoI is that corpus.**

**(4) Randomized robot behavior / interventional collection.** SACSoN's HuRoN is the exemplar (75 h, 4000+ interactions, explicit interaction-seeking `J_int`). *Assumptions:* the probe policy's action distribution has support over actions you will later evaluate (positivity); plus an ethics/IRB posture, since the method deliberately perturbs bystanders who did not consent.

**(5) Offline datasets with and without robot presence.** **PeRoI is the only verified dataset with an explicit no-robot / stationary-robot / moving-robot controlled design.** See §8.2.

**(6) Structural causal models.** CICR's front-door formulation and CausalMotion's latent decomposition are the two verified instances; both model the *social environment* as confounder, neither models a *robot intervention node*. An SCM with an explicit `do(robot = absent)` operator over a multi-agent interaction graph appears unclaimed — **UNVERIFIED as an exhaustive negative.**

**Recommended identification strategy.** In simulation: **common random numbers** — same crowd seed with and without the robot, giving an exact paired counterfactual with variance reduction. In the real world: **randomized robot dispatch** (PeRoI-style PD vs PD-MR blocks) for an unbiased distributional ATE **with no predictor in the loop**.

**The measurement dilemma, stated honestly:** replay benchmarks give real humans but no counterfactual; reactive simulators give a counterfactual but measure your own crowd model. Only randomized real-world dispatch escapes both, and only PeRoI has it at any scale.

---

## 8. Simulation and data stack

### 8.1 Simulators

| Simulator | Pedestrian model | React to robot? | ROS 2 | Paired w/wo rollouts | Maintenance | License |
|---|---|---|---|---|---|---|
| **HuNavSim 2.0** | SFM (`lightsfm`) + 6 BT behaviors | **Yes — design goal** | Humble | **Yes — `Impassive` behavior** | Active, 2026-01-08 | MIT |
| **Arena 4.0 / 5.0** | pedsim SFM fork w/ `robotForce()` | Yes | Humble | Not first-class; no seeding | `rosnav-rl` 2026-08-16 | MIT |
| **CrowdNav / DSRNN / ++** | Python-RVO2 (ORCA) | **No by default** | No | **Best — one boolean + seed** | 2022 / 2025-01 / 2024-12 | MIT |
| **SocNavGym** | `sfm`\|`orca`\|`random` | **Tunable — `prob_to_avoid_robot`** | No | **Excellent (continuous dose)** | 2026-06-16 | GPL-3.0 |
| Isaac Sim 6.0 / Lab 3.0 | `omni.anim.people` → IRA, scripted | Only via manual `dynamic_obstacle.py` | Humble, Jazzy | Trivially (scripted) | Very active | Apache-2.0 code + **proprietary Kit SDK** |
| Gazebo Harmonic/Jetty actors | SDF scripted tracks | **No** — no physics | Jazzy→Harmonic | N/A | Active | Apache-2.0 |
| pedsim_ros | SFM + **process noise** | Yes | **ROS 1 only** | No deterministic seeding | Stale 2023-08 | BSD-2 |
| SocNavBench | ETH/UCY **replay** | **No** | No | Yes — `without_robot` flag | **Dead (2022-03)** | MIT |
| SocialGym 2.0 | MARL over *robots* | Robots, not humans | ROS 1 only | UNVERIFIED | 2024-04 | MIT |
| SEAN 2.0 | Unity SFM w/ `robotRepulsion` | Yes, stochastic preferred distances | ROS 1 only | Partial | 2024; SEAN 3.0 unreleased | BSD-3 |
| JuPedSim 1.4.2 | CFSM, GCFM, AVM (**no ORCA**) | Only via direct steering injection | No | Manual | Active 2026-08-14 | LGPLv3 |
| Vadere | OSM, GNM, SFM, BHM | **No robot concept** | No | Manual | 2026-04 | LGPLv3 |
| Habitat 3.0 | SMPL-X + one AMASS walk cycle | **No** | Unofficial bridge | Degenerate | Active 2026-05 | MIT |
| MetaUrban | ORCA + BEDLAM motion | **UNVERIFIED** (`ego=False` default) | No | Not documented | 2026-07-17 | Apache-2.0 |
| NavIsaacLab | **Diffusion + adversarial motion priors** | Yes | UNVERIFIED | Not documented | **No code released** | n/a |

**Corrections to common assumptions:**
- **Arena is 4.0 in docs, 5.0 in publication.** [Docs](https://arena-rosnav.readthedocs.io/en/latest/) cover Arena 4.0 with Unity/Gazebo/Flatland backends ([arXiv:2409.12471](https://arxiv.org/abs/2409.12471), ICRA 2025); [Arena 5.0](https://5.arena-rosnav.org/) adds Isaac (RSS 2025 demo). **JuPedSim is not integrated**; CrowdNav appears only as a *planner* baseline.
- **Gazebo Classic 11 reached EOL January 2025.** Current LTS: Fortress (2027-05), Harmonic (2029-05), Jetty (2031-05). HuNavSim wrappers cover Classic 11, Fortress, Isaac, Webots — **Harmonic not supported** (UNVERIFIED whether planned).
- **Isaac Sim is open source but the crowd system is not.** LICENSE: *"Building or using the software requires additional components licenced under other terms… the Omniverse Kit SDK."* A code search for `anim.people` returns **0 hits** — the people system lives in closed Kit extensions and is **being deprecated** in favor of Isaacsim.Replicator.Agent. Parallelism trap: Isaac Lab's 10³–10⁴ vectorized envs apply to *tensorized robot physics*; IRA is a USD-stage Behavior Script system and is almost certainly **not** GPU-parallelizable alongside `num_envs` (strongly implied by NavIsaacLab's existence, otherwise UNVERIFIED).
- **Habitat 3.0 caps at one humanoid.** `oracle_social_nav_actions.py` asserts `len(agents_mgr) == 2`; humanoids are `KinematicHumanoid` and can interpenetrate the robot. Fast (1100–2290 FPS at 16 envs), useless for crowds.
- **The "HuNav Challenge" does not exist** — `hunavc.github.io` redirects to an unrelated venture studio.

### 8.2 Pedestrian realism — which environments make MIRN circular

MIRN is trivialized when (i) the counterfactual is a single deterministic trajectory, (ii) `h_{t+1} = f(h_t, r_t)` is closed-form and planner-invertible, (iii) latent state is fully observable. There is an **opposite** degenerate failure: if humans never see the robot, Δ_H ≡ 0 and every policy is optimal.

| Model | Deterministic? | Robot-reactive? | Verdict |
|---|---|---|---|
| `lightsfm` (HuNavSim core) | Fully — grep `rand\|noise\|fluctuat` in `sfm.hpp` returns **zero matches** | Yes | **TRIVIALIZES** |
| pedsim_ros SFM | **Process noise** (`randomforce.cpp`, U(0,360°) × N(0,1), 1 s fade, `forceRandom=0.1`) | Yes (`robotPosDiffScalingFactor=5`) | **PARTIALLY** |
| Helbing original | Langevin — fluctuation term **is** in the paper ([cond-mat/9805244](https://arxiv.org/abs/cond-mat/9805244)); robotics ports drop it | n/a | **PARTIALLY** |
| ORCA / RVO2 | Fully — `Agent.cc` has zero RNG; 2-D LP with hardcoded `0.5F * u` reciprocity | **Default invisible** in CrowdNav | **TRIVIALIZES both directions** |
| HuNavSim behaviors | Params drawn once per episode then frozen | Yes — 6 behaviors | **PARTIALLY** |
| JuPedSim | Fully — RNG only for tie-breaks | No robot concept | **TRIVIALIZES** |
| Vadere | Per-agent param noise at construction | No robot concept | **TRIVIALIZES** |
| omni.anim.people / IRA | Scripted GoTo/Idle/Sit | Only via manual attach | **TRIVIALIZES (degenerate)** |
| Habitat 3.0 | One AMASS clip + random waypoints | **No** | **TRIVIALIZES (zero signal)** |
| SocNavBench replay | Docs: agents *"cannot… change course to avoid obstacles"* | **No** | **TRIVIALIZES (zero signal)** |
| Trajectron++ (ego-conditioned CVAE) | Stochastic | **Yes by construction** | **DOES NOT trivialize** |
| CrowdES / SPDiff (diffusion) | Stochastic | Needs robot term added | **DOES NOT trivialize** |
| NavIsaacLab | Stochastic | Yes | **DOES NOT trivialize** (no code) |

**The single most important source line found in this review**, in [CrowdNav_Prediction_AttnGraph](https://github.com/Shuijing725/CrowdNav_Prediction_AttnGraph):
```python
# whether robot is visible to humans (whether humans respond to the robot's motion)
robot.visible = False
```
All three CrowdNav-lineage repos ship `visible = False` by default. Combined with `env.seed` and 500 fixed test cases, this is the cheapest exact paired-counterfactual primitive anywhere — **and simultaneously a trap**, because in the default configuration the MIRN objective is **exactly zero by construction**.

**State it plainly in the paper:** a simulator whose humans ignore the robot gives a perfect counterfactual *and* a worthless one — the two arms are identical because the model *cannot* differ, not because the robot was unobtrusive. The scientifically interesting design is a simulator where humans *can* react and you *disable* it: CrowdNav's `visible`, SocNavGym's `prob_to_avoid_robot`, HuNavSim's `Impassive`.

On realism: SFM matches *aggregate* flow statistics but produces unrealistic *individual* trajectories — the Headed SFM paper documents jerk **10–15× higher** than the headed variant, with "vibrations, sudden changes of direction and even 'bounces'." MIRN cares about individual trajectories, so this gap is load-bearing.

### 8.3 Datasets

| Dataset | Rate | Robot? | **Robot-free baseline, same env?** | Size | License |
|---|---|---|---|---|---|
| **PeRoI** | 15 Hz | 3 platforms | **YES — 3-way PD / PD-SR / PD-MR** | 18,669 traj., 142 h | **CC-BY-4.0** |
| **THÖR-MAGNI** | mocap 100 Hz | DARKO + NAO | **NO** — static vs mobile only | 3.5 h, 40 subj., 22.3 GB | CC-BY-4.0 |
| THÖR | mocap 100 Hz | Linde forklift, **non-reactive** | **NO** — static vs moving | 60 min, 600+ traj. | Non-commercial |
| **JRDB** | RGB 15 fps | JackRabbot | **Partial** — 22 stationary vs 32 moving at repeating locations, same time of day | 54 seq., 64 min | CC BY-NC-SA 3.0 |
| SACSoN / HuRoN | ~3 fps | Yes, autonomous | No | 75 h, 58.7 km, 4000+ interactions | MIT |
| CrowdBot_v2 | LiDAR 20 Hz | Qolo | No | ~250k frames | CC-BY-4.0 |
| SCAND | LiDAR 10 Hz | Jackal + Spot, teleop | No — **demonstrator walks 2 m behind at all times** | 138 traj., 8.7 h | Texas Data Repo |
| MuSoHu | UNVERIFIED | **No robot** (helmet-worn rig) | Robot-free only | ~100 km, 20 h | CC-BY-4.0 |
| ATC mall | UNVERIFIED | Not stated | Cross-session via ATR `approach_robot` | 92 days, 42.3 GB | Research-only |
| ETH/UCY | **annot. 2.5 Hz** | No | n/a | ~1,500 peds | ETH none stated |
| SDD | 30 fps | No | n/a | 60 videos, ~69 GB | CC BY-NC-SA 3.0 |
| Edinburgh Forum | **9 fps** | No | n/a | ~92,000 traj. | **None stated** |

**Two verifications that matter:**

**THÖR-MAGNI does NOT have a robot-absent condition.** Read directly from [arXiv:2403.09285](https://arxiv.org/html/2403.09285): Scenarios 1 and 2 contain *"static obstacles such as tables, **stationary robots**, and goal points."* Scenario 3 is where *"the stationary DARKO robot of Scenarios 1 and 2 becomes mobile"* (teleoperated; 3A differential, 3B omnidirectional). Scenarios 4–5 add semi-autonomous DARKO + NAO. So the A/B is **robot-static vs robot-mobile**, same room, same layout, same seven goals — an excellent design, but a **lower bound** on perturbation: whatever a parked robot contributes is silently subtracted. Same for original THÖR. Extension: THÖR-MAGNI Act ([arXiv:2412.13729](https://arxiv.org/abs/2412.13729), HRI'25). (`thor.oru.se` unreachable; release variants **UNVERIFIED**.)

**PeRoI is the dataset MIRN needs, and it is released.** Zenodo record confirmed via API: [DOI 10.5281/zenodo.18876411](https://doi.org/10.5281/zenodo.18876411), published 2026-06-01, CC-BY-4.0, open access, Agrawal / Ostermann-Myrau / Dengler / Bennewitz (University of Bonn). **The arXiv PDF's "will be made available after publication" text is stale — the data is live.** Weaknesses to state: PD-MR is thin at 260 trajectories, one platform, single institution, outdoor only, and trajectories filtered to ≥3.5 m and ≤2.7 m/s (runners/cyclists excluded — a real selection effect on speed tails).

**Ranked answer to the key question:**
- **Tier 1 — true robot-free + robot-present, same site:** **PeRoI only.**
- **Tier 2 — robot-static vs robot-mobile (lower-bound perturbation):** THÖR-MAGNI (best instrumentation in existence — 100 Hz mocap at 1 mm, plus gaze); JRDB (real uncontrolled traffic; paper states data at repeating locations is acquired *"stationary vs. moving setups, in the same time of the day"* — a genuine quasi-experiment that appears **underexploited**; which locations recur is **UNVERIFIED**, buried in appendix Fig. A.3); original THÖR (tiny, but the forklift is provably non-reactive, making it a clean instrument).
- **Tier 3 — cross-session pairing, same space:** ATC (92 days) + ATR [`approach_robot`](https://dil.atr.jp/ISL/sets/approach_robot/) (130 trajectories, Robovie in Static and Simply-Proactive modes, same hall, same sensors) — years apart, temporally confounded, but the only real public space at scale.
- **Tier 4 — single condition:** SACSoN/HuRoN, CrowdBot_v2, SCAND, CODa (robot-present); MuSoHu, SANPO, ETH/UCY, SDD, inD, Edinburgh (robot-free).

**The trap to avoid:** MuSoHu (robot-free, GMU) and SCAND (robot-present, UT Austin) look pairable — same lab lineage, complementary conditions. **They are not.** Different campuses, sensor heights, and years: environment is fully confounded with condition. This is exactly the dataset-shift bias of §6.6.

---

## 9. Baseline suite

| Baseline | Repo | License | Last commit | Notes |
|---|---|---|---|---|
| **Nav2** | [ros-navigation/navigation2](https://github.com/ros-navigation/navigation2) | NOASSERTION (per-package) | 2026-08-15 | Jazzy = safe LTS |
| **MPPI** | `nav2_mppi_controller` | **MIT** | 2026-07-27 | Added 2023-03-01 (Iron). **Use this, not DWB** |
| DWB / RPP / Smac Hybrid-A* | in-tree | Apache-2.0 | current | `apt install`; DWB is the null hypothesis |
| TEB | [teb_local_planner](https://github.com/rst-tu-dortmund/teb_local_planner) | BSD-3 | `ros2-master` 2024-11-10 | **No buildfarm binaries for Humble/Jazzy** — source build, expect to build g2o by hand |
| ORCA/RVO2 | [snape/RVO2](https://github.com/snape/RVO2) | Apache-2.0 | 2026-08-14 | Alive; ships `package.xml`, Dockerfile. **Pin a commit, not the 2016 tag** |
| Python-RVO2 | [sybrenstuvel/Python-RVO2](https://github.com/sybrenstuvel/Python-RVO2) | Apache-2.0 | **2020-08-07** | **#1 source of setup failure.** Hard dep of CrowdNav *and* SICNav; pin Cython 0.29.33 |
| SFM | [robotics-upo/lightsfm](https://github.com/robotics-upo/lightsfm) | BSD-3 | 2026-01-08 | Header-only C++ |
| CADRL / GA3C-CADRL | [mit-acl/cadrl_ros](https://github.com/mit-acl/cadrl_ros) | **NONE** | 2021-12-23 | No license = all rights reserved. TF 1.4 + ROS Kinetic. **Cite, don't rerun** |
| SARL / CrowdNav | [vita-epfl/CrowdNav](https://github.com/vita-epfl/CrowdNav) | MIT | 2022-08 | Needs Python-RVO2 |
| DSRNN / CrowdNav++ | [DSRNN](https://github.com/Shuijing725/CrowdNav_DSRNN) / [AttnGraph](https://github.com/Shuijing725/CrowdNav_Prediction_AttnGraph) | MIT | 2025-01 / 2024-12 | `num_processes=12` |
| **SICNav + CrowdSimPlus** | [sepsamavi/safe-interactive-crowdnav](https://github.com/sepsamavi/safe-interactive-crowdnav) | MIT | 2025-07-02 | Public. Hardest install here: Python 3.8.13, Python-RVO2 from source, IPOPT+HSL, Acados v0.2.6. **Budget a day** |
| **GenSafeNav (CoRL 2025)** | [tasl-lab/GenSafeNav](https://github.com/tasl-lab/GenSafeNav) | MIT | 2026-01-09 | **Ships a Dockerfile**; [ROS 2 port](https://github.com/tasl-lab/GenSafeNav-ROS2). **The mandatory recency baseline** |
| Falcon (ICRA 2025) | [Zeying-Gong/Falcon](https://github.com/Zeying-Gong/Falcon) | MIT | 2026-02-15 | Habitat-based |
| DR-MPC (RA-L 2025) | [James-R-Han/DR-MPC](https://github.com/James-R-Han/DR-MPC) | **NONE** | 2025-10-01 | |
| DRL-VO | [TempleRAIL/drl_vo_nav](https://github.com/TempleRAIL/drl_vo_nav) | **GPL-3.0** (viral) | 2025-09-12 | Nav2 plugin exists |
| SACSoN | [NHirose/SACSoN](https://github.com/NHirose/SACSoN) | MIT | 2024-01-29 | Deployment code, not a benchmark. Needs ROS Noetic + RICOH THETA S at 0.35 m, 3 fps |
| NoMaD / ViNT / GNM | [visualnav-transformer](https://github.com/robodhruv/visualnav-transformer) | MIT | 2024-09-15 | Goal-conditioned *visual* nav, **not social nav** — different axis |

**Minimum credible suite:** Nav2 MPPI (not DWB), ORCA, SFM, SARL/CrowdNav++, **SICNav** (interactive-MPC comparison), **GenSafeNav** (2025 recency), and **an ablated MIRN with λ_h = 0** — the last is the most important row in the table, since it isolates the contribution.

**There is no standard metrics package.** A GitHub index search returns nothing above 1 star besides SocNavBench. Francis et al. is normative with **no reference implementation**. The de facto runnable standard is **`hunav_evaluator`** — ROS 2 node, `metrics.yaml`-driven, `/hunav_start_recording` service, **CSV output**, ~30 metrics including `social_work`, `social_force_on_agents`, intimate/personal/social intrusions, jerk, danger/fear/panic costs.

---

## 10. Evaluation methodology

### 10.1 Metrics to report

**Human-side (the contribution):**
- W₂-Δ_H against the MdR reference, in metres, per-pedestrian and scene-aggregated
- **Human forced stops** (>3 s) — currently unmeasured by any benchmark, discrete, high face validity
- Human GPS, Human PI, Human AA (Stratton et al. definitions, for comparability)
- Responsibility `R_robot` (share-normalized, `Σ_x R_x = 1`)
- Human empowerment change ΔEmp (blocking detector)
- Group fragmentation (HuNavSim group intrusions; CoMet cohesion, [arXiv:2108.09848](https://arxiv.org/abs/2108.09848))

**Robot-side (the cost):** success rate, time to goal, path-length ratio, collisions, robot freeze rate, min distance to human (for comparability with the literature, *not* as a target).

**Reference anchors:** `Δ_H(π) − Δ_H(π_human)` and `Δ_H(π) − Δ_H(π_naive)` on identical seeds.

### 10.2 Statistical protocol

- **Paired designs throughout** — common random numbers in sim; matched scenario blocks on real data. The paired contrast is the whole reason to prefer one model over two (§6.6).
- **Power analysis before running anything.** Agrawal et al.'s effect sizes (0.69±0.05 vs 0.76±0.04) imply you need large n to detect planner differences at all. Compute required n from those numbers.
- Paired bootstrap for metric-comparison claims (H1); Kendall τ with confidence intervals for ranking claims (H3).
- Pre-register the ε sweep grid and the scenario suite before looking at results.
- Report the **Δ_H(ε) frontier** and compare policies by **Pareto dominance**, not by a scalarized score.

### 10.3 Human validation

The literature is discouraging for hand-crafted metrics, which is the opportunity:
- SN26 ([arXiv:2509.01251](https://arxiv.org/abs/2509.01251)) — 4-layer GRU + MLP, MSE against human scores, 4,402 trajectories, test MSE 0.0457; learned r = 0.797 vs min-distance r = 0.009.
- Kretzschmar et al., IJRR 2016 ([doi:10.1177/0278364915619772](https://doi.org/10.1177/0278364915619772)) — the field's cleanest perceptual validation: a Turing test where 10 subjects × 40 runs correctly identified 79% of real human trajectories but mistook **68%** of the IRL model's, 40% of Kuderer 2012, 35% of social forces.
- Preference learning: **SortCMA** ([arXiv:2308.04571](https://arxiv.org/abs/2308.04571), IROS 2023) — human A/B queries as the CMA-ES comparator; Prolific, 150 recruited / 113 analysed, 95% Clopper–Pearson (Hotel: CMA over Default 77% [68,84]; Zara: CMA over GP 91% [84,96]). **NaviSTAR** ([arXiv:2304.05979](https://arxiv.org/abs/2304.05979)) — Bradley–Terry reward from ~5,000 preferences, 10+ supervisors, explicit indifference label. **SoLo T-DIRL** ([arXiv:2209.07996](https://arxiv.org/abs/2209.07996)) ranks by *sudden velocity change of pedestrians around the robot* — essentially a crude intervention metric.
- **Two lookalikes that are not human data:** EnQuery ([arXiv:2404.04852](https://arxiv.org/abs/2404.04852)) states verbatim that it simulates preferences with an oracle preferring higher minimum human distance; SPLC ([arXiv:2607.01925](https://arxiv.org/abs/2607.01925)) replaces annotators with hand-designed criteria.
- **Methodological warning:** SEAN-EP ([arXiv:2012.12336](https://arxiv.org/abs/2012.12336)) found human perceptions **differ depending on whether people interact with the robot in simulation or watch videos of it.** Fix and report this modality.
- **Genuinely open ground:** no study regressing RoSAS or Godspeed subscales against trajectory-level metrics was found.

**Validation design for H1:** collect pairwise preferences over trajectory pairs (video or interactive — declare which), then compare each candidate metric's pairwise-preference accuracy. Target n from a power analysis against SN26's r = 0.797 as the ceiling and min-distance's ρ = 0.397 as the floor.

---

## 11. MVP experiment

**The smallest experiment that determines whether MIRN is promising. Two weeks. No planner. No simulator infrastructure.**

**Setup.** Download PeRoI ([Zenodo](https://doi.org/10.5281/zenodo.18876411)). Train one agent-token transformer on the PD + PD-SR + PD-MR mixture with an explicit robot-presence indicator. ~1–5M params. No graph, no latent, no diffusion.

**Run six measurements. The first two require no model at all and should be done first.**

1. **The noise floor (B3/E2) — no model needed.** Split PeRoI's 15,461 robot-free PD trajectories in half and compute your divergence statistic between the halves. That **is** the null distribution of trajectory divergence under no intervention. Define **minimum detectable perturbation (MDP)** as the effect size resolvable above it. *Nobody has published this, and everything downstream is uninterpretable without it.* Then re-express existing published perturbation deltas — Agrawal et al.'s 0.69 vs 0.76 m, for instance — in MDP units and see how many clear it.

2. **The stationary-robot bias (H5/E1) — no model needed.** PD vs PD-SR is exactly the parked-robot effect, and PD-SR splits across three embodiments (HSR / MPO700 / Go1). Report the bias per embodiment. **This alone is a workshop paper**, and it quantifies the gap SACSoN's authors explicitly named and declined to measure.

3. **Does Δ_H exist and how big is it?** W₂ between predicted pedestrian distributions under the observed robot condition and under PD. Report the full **distribution**, not the mean, against the MDP from (1). *The number nobody has published.*

4. **The placebo test (H0).** Delete a random non-interacting pedestrian instead of the robot. Δ_H should be ≈ 0. Compare against the robot-deletion effect size. **If the placebo effect is comparable, the objective is measuring model sensitivity, and that finding is itself the paper.**

5. **Estimator confounding (H4/E3) — the killer plot.** In simulation, where ground-truth counterfactuals are free: hold **true perturbation fixed at zero** and sweep predictor quality. If reported Δ_H tracks predictor error, every published perturbation number is partly an artifact of model accuracy. Cheap, fast, and a direct critique of a published loss function.

6. **Does Δ_H decouple from proxemics?** Correlate Δ_H against min-distance-to-human on the same trajectories. **If r > 0.9, MIRN is a reparameterization of proxemics and the project should stop.** Break out by geometry (open plaza vs constrained crossing) to locate where they decouple.

**Decision rule.** Proceed to the planner only if: Δ_H exceeds the MDP from (1), the placebo test passes, reported Δ_H is not dominated by predictor error in (5), and Δ_H is not near-collinear with min-distance. **Any one failure kills or redirects the project — cheaply, at two weeks instead of six months.**

**Note the ordering.** Measurements (1) and (2) need no trained model and no simulator. They are pure data analysis on a released CC-BY-4.0 dataset, they are publishable on their own, and they are the highest-value-per-hour work in this entire document. Do them first.

**Known limitation to state up front:** PD-MR has only 260 trajectories from one platform. Power will be tight. Compute required n first; if underpowered, the honest MVP conclusion is "PeRoI is insufficient and new data collection is the project."

---

## 12. Path toward a publishable result

**Stage 1 — MVP (weeks 1–3).** §11. Deliverable: a decision, plus the first published characterization of Δ_H's empirical distribution. *Venue if it stops here: a workshop paper on the measurement question.*

**Stage 2 — the validity study (weeks 4–12).** Extend the MVP into a full causal-validity analysis: placebo tests across predictor architectures, sensitivity to the choice of reference behavior (absent / stationary / MdR), calibration against PeRoI ground truth, and the correlation structure against existing social metrics. Add human preference collection for H1. *Deliverable: RA-L or an HRI/ICRA paper titled roughly "Is Counterfactual Perturbation a Valid Objective for Social Navigation?" This is the strongest standalone contribution available and it does not require a planner.*

**Stage 3 — the planner (weeks 13–22).** MPPI with clustered plan modes and encode-once/decode-many. λ_h = 0 vs λ_h > 0 as the central ablation. Sweep ε, report the Pareto frontier. Evaluate in SocNavGym across the `prob_to_avoid_robot` dose-response curve, plus HuNavSim `Impassive` as the robot-blind arm. *Deliverable: ICRA/IROS submission.*

**Stage 4 — the credibility experiment (weeks 23–30).** H3: show a policy trained against deterministic SFM collapses onto the analytic solution and transfers poorly to PeRoI, while a policy trained against a learned stochastic ego-conditioned model does not. **This converts the biggest methodological vulnerability into the paper's central experiment.** *Deliverable: upgrades Stage 3 to CoRL/RSS quality.*

**Stage 5 — hardware (optional, months 8+).** ROS 2 + a Jackal-class base. Teaches integration, not research. Defer until Stages 2–4 have a result worth demonstrating.

---

## 13. Real-world robotics utility

Assessed skeptically, sector by sector.

### Sidewalk delivery — **STRONG. The best and possibly only case.**

The regulatory hook is **statutory**. Personal-delivery-device laws grant PDDs pedestrian rights "except that a personal delivery device shall yield the right-of-way to human pedestrians on sidewalks and crosswalks" ([DDOT](https://ddot.dc.gov/page/personaldeliverydevices), [Virginia §46.2-908.1:1](https://law.lis.virginia.gov/vacode/title46.2/chapter8/section46.2-908.1:1/)). Yielding is a **legal obligation**, and MIRN is a principled formalization of it. Speed/weight caps vary (6 mph WA, 10 mph Reading OH, 12 mph PA, 15 mph FL, generally <250 lb); several statutes require an operator to resume control within 60 s if the device cannot safely yield.

Accessibility pressure is documented and consequential. **Toronto City Council banned sidewalk robots on 17 December 2021**, after its Accessibility Advisory Committee and Infrastructure Committee both recommended it and the AODA Alliance called the technology "a substantial and worrisome new disability barrier impeding people with disabilities in their safe use of public sidewalks" ([AODA Alliance](https://www.aodaalliance.org/whats-new/tell-toronto-city-council-to-ban-robots-from-sidewalks-because-they-endanger-people-with-disabilities-seniors-children-and-others/), [CBC](https://www.cbc.ca/news/canada/toronto/toronto-robot-ban-1.6275532)). **Ottawa followed in February 2022** ([Policy Options, Jan 2025](https://policyoptions.irpp.org/2025/01/sidewalk-robot-delivery-safety/)), which also reports research finding robots "impede pedestrian flow," "cause discomfort," and "amplify navigation challenges in crowded pedestrian environments," and cites a 2021 Northern Arizona University study logging 40 dangerous near-misses in five days plus 60 moderate-risk interactions, robots typically at fault (secondary source; underlying study **UNVERIFIED**).

**The single most useful artifact found in this entire review:** a September 2025 West Hollywood incident in which a delivery robot repeatedly blocked and then collided with **Mark Chaney**, a disability advocate with cerebral palsy on a mobility scooter. The company's own explanation: *"our safety system designed to predict pedestrians' intentions and yield right of way instead caused the robot to impede their way"* ([Futurism, 27 Sep 2025](https://futurism.com/robots-and-machines/delivery-robot-torments-disabled-man), citing the *LA Times*). **Source conflict: Futurism names "Swerve Robotics" while other reporting names Serve Robotics — operator attribution UNVERIFIED.** Regardless: that sentence is a deployed operator publicly diagnosing a failure as *a prediction-and-yield system that perturbed a pedestrian*. It is MIRN's problem statement, written by industry.

First-party framing corroborates. Serve markets robots that "move seamlessly with pedestrian traffic" ([serverobotics.com](https://www.serverobotics.com/)). Starship's published behavior model is maximal passivity — "if a vehicle, car or pedestrian is detected nearby, the situation may be assessed to be unsafe and the robots will continue to wait for the right opportunity" ([Starship, Sep 2022](https://www.starship.xyz/news/robots-and-road-users/)) — with an accessibility commitment developed with the American Foundation for the Blind ([accessibility page](https://www.starship.xyz/autonomous-robots-accessibility/)). **Note that Starship's answer to "don't disturb people" is stop-and-wait — precisely the degenerate solution MIRN must beat.**

### Warehouse — **WEAK**
Amazon's first-party framing optimizes *robot* efficiency: DeepFleet "will improve travel time of our robotic fleet by 10%," while human interaction is framed purely as safety — Proteus "can safely navigate around employees in open and unrestricted areas" ([aboutamazon.com](https://www.aboutamazon.com/news/operations/amazon-million-robots-ai-foundation-model)). Nobody publishes worker-path-perturbation or throughput-impact metrics.

### Hospital — **WEAK, and the vendor claims the opposite**
Aethon claims TUGs *alleviate* hallway congestion, citing a VTT Finland study at Seinäjoki Central Hospital; 25 robots at UCSF Mission Bay cover ~100 miles/day, 160,000+ deliveries/year at 3 mph ([aethon.com](https://aethon.com/study-affirms-benefits-of-robotics-in-healthcare/)). Independent HRI work finds acceptance drops "in settings with high interpersonal caregiver-patient relationship needs, low interruption tolerance, and high work dynamics" ([Int. J. Social Robotics, 2025](https://link.springer.com/article/10.1007/s12369-025-01270-1)) — but that is *workflow* interruption, a different construct from motion perturbation.

### Humanoids — **NOT YET APPLICABLE**
Digit operates in sectioned-off zones behind safety fencing; uncaged shared-space operation is the *announced next barrier*, not a shipped capability ([Agility Robotics](https://www.agilityrobotics.com/), [Forbes, Aug 2026](https://www.forbes.com/sites/johnkoetsier/2026/08/10/digit-v5-first-humanoid-robot-out-of-the-cage/)). Revisit in 2–3 years.

### Airports / retail / restaurants / museums / assistive wheelchairs — **NOT INVESTIGATED, UNVERIFIED**
Search budget exhausted before Bear Robotics, Pudu, Simbe, LUCI, WHILL. Do not assume either way.

### Autonomous vehicles — **the pain point is the OPPOSITE**
Waymo's published safety-research portfolio is injury risk and collision avoidance ([waymo.com/safety/research](https://waymo.com/safety/research/)); their behavioral-benchmarking blog contains no discussion of impact on other road users' behavior. The closest first-party support is the **"Drivership"** framework, naming "socially-aware behaviors (where there are no clear safety stakes)" and "Furtherance Expectations" ([arXiv:2502.08121](https://arxiv.org/abs/2502.08121)) — real but vague and unoperationalized.

Against that, the documented failures all run the other way: SFFD logged **55 incidents of driverless vehicles interfering with emergency responses in 2023 as of late August**, and the CPUC record shows AVs driving over fire hoses and impeding first responders **50+ times as of 7 August 2023** ([CPUC filing](https://docs.cpuc.ca.gov/PublishedDocs/Efile/G000/M520/K495/520495874.PDF), [Forbes](https://www.forbes.com/sites/cyrusfarivar/2023/08/30/cruise-robotaxis-waymo-san-francisco-firefighters/)); ten Cruise vehicles stalled and jammed North Beach traffic in August 2023 ([CNN](https://www.cnn.com/2023/08/14/business/driverless-cars-san-francisco-cruise/index.html)); Waymos honked at each other nightly in a SoMa lot, waking residents, with the fix failing to hold ([SF Standard](https://sfstandard.com/2024/08/19/waymo-honking-despite-promised-fix-neighbors-still-being-woken-up/)). **These are failures of excessive passivity and blocking, not of excessive influence.**

### Verdict, and the adjacent formulation

**Minimum-intervention is a real, legally-backed pain point in exactly one sector — sidewalk robots among pedestrians. Everywhere else it is an aesthetic preference, and in AVs the market wants the opposite.** Framed generically as "robots should be polite," MIRN is weak.

**Two stronger adjacent formulations:**

1. **Accessibility-aware asymmetric yielding.** Weight Δ_H by *the cost of deviation to the specific pedestrian*: perturbing a wheelchair user, cane user, or someone with reduced mobility costs far more than perturbing an unencumbered adult, because they cannot easily step aside — Chaney reported having to step into the street on crutches. This maps onto PDD statutes' yield requirement, onto the Toronto and Ottawa bans, and onto a constituency with legal standing. It also **fixes the sign problem** (§4.3 D4) by making the weighting asymmetric and effort-based rather than a symmetric divergence. **This is the version worth building.**
2. **Throughput preservation in dense flows.** "Do not degrade aggregate human flow" is directly measurable, matters in airports, stations, and warehouses, and structurally avoids the pathology that a stationary robot scores perfectly on a give-way null while physically blocking a corridor.

---

## 14. Major technical and research risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **Prior art is a complete duplicate.** Moder & Pauli may already be exactly MIRN. Survey refs [17]/[30] in [arXiv:2406.17151](https://arxiv.org/abs/2406.17151) unresolved. | **Critical** | Resolve all three citations **before writing a line of code.** Milestone 1. |
| R1b | **The predictor-error confounding argument may already be published.** It is now the project's headline and was verified only by a short search during arXiv rate-limiting. | **Critical** | Dedicated search at milestone 1, before building on it. |
| R2 | **Δ_H is not causal** — it measures predictor input-sensitivity (CausalAgents' 25–38%) and is confounded with predictor error (§4.4b). | **Critical** | The placebo test and the estimator-confounding sweep, both in the MVP. If they fail, that failure **is** the paper — pivot to the measurement critique. |
| R2b | **Robot-induced perturbation may not clear its own detection floor**, making the whole objective unmeasurable at realistic n. | **Critical** | Milestone 5, no model required. If true, publish the floor — it is a service to the field and it invalidates several existing claims. |
| R3 | **Δ_H is collinear with proxemics** — a reparameterization, not a new objective. | High | MVP measurement 4. Kill criterion: r > 0.9. |
| R4 | **Degeneracy** — argmin collapses to freeze/detour; zero level set is a set. | High | MdR reference + Responsibility normalization + hard time constraint (§4.4). |
| R5 | **Simulator circularity** — training against `lightsfm` makes minimizing Δ_H an analytic control problem, not a finding about people. HuNavSim's own `social_force_on_agents` metric **already is** the closed-form perturbation. | High | Make deterministic simulators an **ablation ladder**, not the substrate. Use SocNavGym's continuous `prob_to_avoid_robot` dose-response. Train against a learned stochastic ego-conditioned model. |
| R6 | **Δ_H is heavy-tailed and inert** (Tolstaya's interactivity histogram). λ_h becomes untunable and effects statistically insignificant. | High | Characterize the distribution in the MVP *before* building the planner. Power analysis. |
| R7 | **Insufficient power.** Agrawal's planner differences (0.69±0.05 vs 0.76±0.04) are small relative to variance; PeRoI PD-MR has only 260 trajectories. | High | Power analysis before every comparison. Paired designs + CRN for variance reduction. |
| R8 | **Latency.** 56,000 predictor queries/cycle at Nav2 defaults. | Medium | Clustered plan modes (20–50) + encode-once/decode-many. Budget a distillation step. |
| R9 | **Sign problem** — symmetric divergence penalizes curiosity-approach (PeRoI: 1.6–7.96% attraction). | Medium | Asymmetric, effort-weighted Δ_H (Courteous AV's hinge as precedent). |
| R10 | **Myopia** — per-step Δ_H picks late-large over early-small intervention, contradicting Sadigh/Courteous AV. | Medium | Δ_H as an episode integral, not a per-step cost. |
| R11 | **No standard benchmark will produce your metric**; Arena's metrics pipeline is stale and paper/code disagree. | Medium | Write your own evaluation code; report the mapping onto Francis et al.'s eight principles as the defensible substitute. |
| R12 | **Utility is narrow** — one sector. | Medium | Adopt the accessibility framing (§13). |
| R13 | **Install friction.** Python-RVO2 (2020, Cython pinning) is a hard dep of both CrowdNav and SICNav; SICNav needs IPOPT+HSL+Acados. | Low | Budget a day for SICNav. Prefer GenSafeNav (ships a Dockerfile). |

---

## 15. Skills developed

Ordered by when the research forces them, not by resume value.

| Phase | Skills |
|---|---|
| 1. Evaluation harness on JRDB-Traj/PeRoI; reproduce CVM and the uniform-predictor exploit | Probabilistic prediction, evaluation metrics, **research methodology**, benchmark literacy |
| 2. Agent-token transformer, anchor queries, unicycle dynamics head | Sequence modeling, transformers, PyTorch, deep learning |
| 3. Robot-conditioning, Δ_H distribution characterization, placebo tests, CausalAgents-style dropout | **Causal inference**, experimental design, probabilistic modeling |
| 4. MPPI, plan-mode clustering, DTPP-style amortization, `torch.profiler`, TensorRT, CBF filter | Optimization, model-based decision making, **MPC/controls**, ML systems engineering |
| 5. Closed-loop eval across the reactivity dose-response; sim-to-real on PeRoI | Simulation, causal evaluation, statistics |
| 6. (Optional) ROS 2 + Jackal | Robotics integration |

**Drop as unnecessary complexity for this project:**
- **Learned world models** — 30.3 s/trajectory, mode collapse, dynamics known in closed form, and "delete the robot" is ill-defined in pixel space
- **GNNs as infrastructure** — ablation row only; evidence says dense attention wins
- **CVAE latents** — MTR measures −5.5% mAP vs anchors
- **Deep RL as the outer loop** — no safety guarantees, weak sim-to-real record, and it makes λ_h un-ablatable without retraining
- **Diffusion in v1** — add 2-step DDIM in v2 only if calibrated multimodality proves necessary
- **ETH/UCY as a target metric** — saturated and gameable; comparability tables only
- **Explicit SCM machinery** — you need three causal *tests* (mixture training, action randomization, placebo), not a structural causal model

---

## 15b. Build scope — what you are and are not building

**You are not building simulation technology.** That competition is lost before it starts: NavIsaacLab has diffusion-based pedestrians and GPU parallelism, Arena has a five-version head start and a funded team, HuNavSim has an active maintainer and ROS 2 packaging. A year spent rebuilding infrastructure ends with a worse version of something that exists. **You are a consumer of simulators.**

You are building a **measurement instrument**, plus a small policy that proves the instrument changes conclusions.

**Five artifacts, in descending order of value:**

1. **The estimator.** A Python library taking (pedestrian trajectories, robot trajectory, environment) → perturbation estimate **with a confidence interval and an explicit identification assumption**. This is the paper. ~2,000 lines.
2. **The calibration procedure.** PeRoI robot-free split → null distribution of trajectory divergence → published **minimum detectable perturbation** for standard metrics. A table and a plot. **This is the thing other people will cite.**
3. **The paired-rollout harness.** A few hundred lines of adapter wrapping existing sims (SocNavGym, HuNavSim, CrowdNav++) so the same seed, same goals, same crowd runs twice — with and without the robot. **The only "simulation" work, and it is plumbing.** HuNavSim's `Impassive` behavior and CrowdNav's `robot.visible` flag are the hooks.
4. **The policy.** MIRN itself — an MPPI cost term on `nav2_mppi_controller`, or a reward in CrowdNav++. **Deliberately unambitious.** Its job is to show that optimizing the corrected estimand yields different behavior than optimizing SACSoN's, not to top a leaderboard.
5. **The empirical results.** PeRoI bias measurement, the predictor-error confounding plot, the simulator ablation ladder.

**Explicitly absent:** no new environments, no new physics, no crowd rendering, no dataset collection, no ROS packages beyond the harness.

### What changes about "perturbation"

Current practice: *run a trajectory predictor with the robot's future zeroed, subtract what the human actually did, take the squared norm.* Four things change.

| | Current practice | MIRN |
|---|---|---|
| **Control condition** | Robot **stationary** — SACSoN zeros the robot's future actions but leaves it in the scene | Robot **absent**, with the gap between the two *measured* via PeRoI PD vs PD-SR |
| **Estimator** | Prediction residual: a point forecast minus an observation | Divergence between **paired rollout distributions**, **debiased for predictor error** so the metric does not reward being predictable |
| **Scope** | Dyadic, one-step, nearest pedestrian | Closed-loop over the full rollout, including **second-order propagation** |
| **Units** | Raw metres, uncalibrated | Effect size against a **measured null distribution**, with a stated detection floor |

**Row 2 is the load-bearing move.** The field currently measures perturbation with an instrument whose error bar is the size of the effect. Published numbers are substantially prediction error wearing a causal label — and a policy trained to minimize that number is partly trained to move in ways the forecaster finds easy to predict, which is not the same thing as being unobtrusive and is sometimes its opposite.

Fix that, and "how much did the robot disturb people" stops being a loss term bolted onto a planner and becomes a quantity with **an estimand, an identification strategy, a null, and an error bar.** That is the contribution.

> **You are building the ruler, not the room.** Everyone else measures perturbation with a broken ruler and then argues about whose robot is smaller.

---

## 16. First 10 implementation milestones

**No code before milestone 3.**

1. **Resolve the prior-art threats.** Obtain and read Moder & Pauli (RO-MAN 2022) in full. Resolve refs [17] and [30] of [arXiv:2406.17151](https://arxiv.org/abs/2406.17151). **Search hard for prior statements of the predictor-error confounding argument (§4.4b B2)** — it is now load-bearing and was verified only weakly. Read SACSoN, Zhou et al., and Courteous AV end to end. **Write a one-page honest delta statement.** *(1 week, reading only.)*

2. **Write the related-work section first.** Before any implementation. If you cannot write a paragraph that survives "how is this not SACSoN?", there is no project. *(3 days.)*

3. **Download and characterize PeRoI.** Verify the Zenodo release, confirm the PD / PD-SR / PD-MR split sizes, inspect trajectory quality, quantify the selection effects (≥3.5 m, ≤2.7 m/s filters). Compute the power available from 260 PD-MR trajectories. *(1 week.)*

4. **Build the evaluation harness.** W₂ (Sinkhorn), Fréchet, ADE/FDE, human forced stops, Human GPS/PI/AA, Responsibility. Reproduce CVM and the uniform-predictor exploit on JRDB-Traj to see the metric break in your own hands. *(1.5 weeks.)*

5. **Establish the detection floor and the control-condition bias — no model.** PD split-half null distribution → minimum detectable perturbation; PD vs PD-SR parked-robot bias per embodiment; re-express published literature deltas in MDP units. **Two publishable results, neither requiring a trained model. This is the highest-value work in the plan — do it before milestone 6.** *(1.5 weeks.)*

6. **Train the single mixture predictor.** 1–5M param agent-token transformer, anchor queries, unicycle head, robot-presence indicator, trained on PD + PD-SR + PD-MR. *(2 weeks.)*

7. **Run the MVP decision battery** (§11): Δ_H distribution against the MDP, placebo test, **estimator-confounding sweep in simulation (the killer plot)**, ground-truth calibration, proxemics collinearity. **Go/no-go gate.** *(1.5 weeks.)*

8. **Ablation ladder on the predictor.** Agent-mixing operator {none, mean-pool, k-NN graph, dense attention}; latent vs anchors; with vs without dynamics head. Report collision rate and NLL, not just ADE. *(1.5 weeks.)*

9. **Human preference collection for H1.** Pairwise comparisons over trajectory pairs; declare the interaction modality (SEAN-EP warning). Compare candidate metrics by pairwise-preference accuracy against min-distance, social work, PSC, and SN26. *(2–3 weeks including recruitment.)*

10. **Only now: the MPPI loop.** Nav2 MPPI as reference, plan-mode clustering, encode-once/decode-many, CBF filter on collision only. First experiment is λ_h = 0 vs λ_h > 0 in the Δ_H-vs-proxemics decoupling scenarios from milestone 7. *(3 weeks.)*

---

## 17. Unverified items and open threads

Resolve these before citing them.

**Blocking (resolve first):**
- Moder & Pauli RO-MAN 2022 full text (TechRxiv 403)
- Refs [17] and [30] in [arXiv:2406.17151](https://arxiv.org/abs/2406.17151) — may be exact duplicates of MIRN
- Zhou et al. ICRA 2022 predecessor author list ([IEEE 9739572](https://ieeexplore.ieee.org/abstract/document/9739572) returned HTTP 418)

**Data and simulation:**
- THÖR-MAGNI release variants (`thor.oru.se` unreachable)
- Which of JRDB's 54 sequences recur across stationary and moving setups (appendix Fig. A.3) — an underexploited quasi-experiment
- Whether HuRoN randomized robot actions during collection
- MetaUrban robot-reactivity (`ego=False` default)
- Isaac Sim `omni.anim.people` current status — not in the docs index, possibly relocated or deprecated
- Whether IRA is GPU-parallelizable alongside Isaac Lab's `num_envs`
- Whether HuNavSim plans Gazebo Harmonic support
- DynaBARN — no primary paper found
- Arena 4.0's navigation metric set (never re-enumerated in the paper)
- Public source for Arena 3.0's three social metrics (not found in any repo)
- "Demonstrating Arena 5.0" (`openreview.net/pdf?id=PNbhzQecVO`) — not fetched
- NavWareSet robot-free condition

**Latency and models:**
- MoFlow, SingularTrajectory, MotionDiffuser absolute latencies
- MPPI-Generic per-GPU rates
- Jetson Orin figures for a multi-agent conditional predictor
- Trajectron++ latent-removal ablation (appears absent from the paper)
- SACSoN's peer-reviewed venue details
- NavThinker — not independently verified this session

**Metrics and human studies:**
- Francis et al. "M1–M7" numbering (one extraction showed it, a second did not — taxonomy and validation recommendation are verified)
- PLEdestrians (Guy et al., SCA 2010), Hoogendoorn & Bovy, Seethapathi & Srinivasan exact functional forms — **do not cite formulas without reading the originals**
- Mavrogiannis topological complexity index exact form
- *Metrics vs Surveys* participant nationalities (Italy/Spain/France vs Italy/Spain/Poland across two fetches)
- Bi3 ([arXiv:2605.06863](https://arxiv.org/abs/2605.06863), ICRA 2026) survey instrument
- "Is Your Safe Controller Actually Safe?" (arXiv:2603.06954) — listing only

**Utility:**
- West Hollywood incident operator identity (Serve vs "Swerve")
- The 2021 Northern Arizona University near-miss study (only a secondary source found)
- Airports, retail, restaurants, museums, assistive wheelchairs — **entirely uninvestigated**

**Methodological caveat on negatives:** the arXiv API returned HTTP 429 throughout one agent's session and a WebSearch 200-call cap was hit in another. Several "no paper does this" claims — especially §7(3) (robot-free prior × robot-conditioned divergence) and §7(6) (SCM with a robot intervention node) — should be re-searched before being asserted in a submission.

---

## Judgment: MODIFY

**Do not build MIRN as specified.** The objective `argmin_a [λ_g C_goal + λ_c C_collision + λ_h Δ_H(a)]` with a robot-absent counterfactual is SACSoN with a different null, Moder & Pauli with a different backbone, and Zhou et al. without the flow term. The proposed architecture is NavThinker plus a counterfactual branch, and it is roughly 3× more complex than the evidence supports.

**Build this instead — the measurement, not the planner.**

> **Robot-induced perturbation of pedestrian motion is a causal estimand that the field currently misestimates in three ways** — wrong control condition (robot-stationary rather than robot-absent), an estimator that confounds causal effect with predictor error, and no established detection floor. **We give an identification strategy, quantify all three biases against paired real data, and show that a policy optimized against the corrected estimand behaves differently from one optimized against the naive estimand.**

The planner becomes the **demonstration that the measurement change matters**, not the headline. That inversion is much harder to reject, because **the measurement critique stands even if the policy underperforms.**

Concretely, five components:

1. **The detection floor.** Null distribution of trajectory divergence from PeRoI's robot-free split-halves; minimum detectable perturbation as a published yardstick; existing literature deltas re-expressed in those units. No model required.
2. **The control-condition bias.** PD vs PD-SR quantifies the parked-robot effect across three embodiments — the gap SACSoN's authors named and declined to measure. No model required.
3. **The estimator-confounding result.** Sweep predictor quality with true perturbation pinned at zero; show reported perturbation tracks model error. A direct, cheap critique of a published loss function.
4. **A causally-tested estimator.** One mixture-trained agent-token transformer; W₂ against a Move-de-Rigueur reference rather than an arbitrary absence; **placebo test as the gate**; constrained rather than scalarized, reported as a Pareto frontier over ε with Responsibility normalization so freezing scores maximally badly rather than perfectly; **accessibility-weighted asymmetry** to fix the sign problem and anchor the work to the one sector with statutory grounding.
5. **Then** the MPPI planner — clustered plan modes, λ_h as a runtime knob, CBF filter on collision only — plus the deliberate circularity ablation (train against deterministic SFM vs noisy SFM vs learned ego-conditioned model) so you run that attack on yourself rather than waiting to be accused of it.

Optional and unclaimed if you want a second visual result: **second-order perturbation propagation** — the robot deflects A, A deflects B, B never saw the robot. Every existing metric is dyadic. This is the thing that most distinguishes "minimum intervention" from "keep your distance," because a robot can be locally polite and globally disruptive.

**Why this version.** It inverts the risk. The expensive six-month failure mode is building a planner around a cost function you cannot demonstrate measures anything real. This version's first two results need **no model, no simulator, and no planner** — just analysis of a released CC-BY-4.0 dataset — and they are publishable on their own. Everything after them is licensed by them.

**The four questions that decide everything, in order:**
1. Is Moder & Pauli a duplicate? *(reading, days)*
2. Has anyone already published the predictor-error confounding argument? *(searching, days — this is now load-bearing and was verified only weakly)*
3. Does robot-induced perturbation clear its own detection floor? *(data analysis, one week, no model)*
4. Is Δ_H collinear with min-distance? *(data analysis, days)*

None requires a simulator. Any one of them can end or redirect the project cheaply.
