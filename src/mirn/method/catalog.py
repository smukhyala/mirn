"""One `MethodCard` per registered component.

Estimator cards read their first assumption from the estimator's own `identification()`, so the
assumption text lives in exactly one place. `tests/test_method.py` fails if any registered
divergence or estimator lacks an entry here.

The LaTeX in these cards is reused verbatim in the paper; keep it publication-clean.
"""

from __future__ import annotations

from mirn.estimator import ESTIMATORS
from mirn.method.cards import MethodCard

_SHARED_ESTIMAND_TEX = (
    "\\Delta_H \\;=\\; \\mathbb{E}\\Big[\\, d\\big(Y^{(\\mathrm{robot})},\\,"
    " Y^{(\\mathrm{no\\ robot})}\\big) \\,\\Big]"
)


def _identification_of(name: str) -> str:
    estimator_cls = ESTIMATORS.get(name)
    instance = estimator_cls()
    return instance.identification()


def _build_cards() -> dict[str, MethodCard]:
    cards: dict[str, MethodCard] = {}
    card_list: list[MethodCard] = []

    card_list.append(
        MethodCard(
            key="ade",
            kind="divergence",
            title="Average displacement",
            one_liner="Mean pointwise separation between two time-aligned paths.",
            estimand_tex="d_{\\mathrm{ADE}}(a, b) \\;\\ge\\; 0",
            formula_tex=(
                "\\begin{aligned}"
                "d_{\\text{path}}(a,b) &= \\tfrac{1}{T}\\sum_{t=1}^{T}\\lVert a_t-b_t\\rVert_2 \\\\"
                "d_{\\text{cloud}}(A,B) &= \\tfrac{1}{2}\\Big("
                "\\tfrac{1}{N}\\sum_i \\min_j \\lVert a_i-b_j\\rVert_2 +"
                "\\tfrac{1}{M}\\sum_j \\min_i \\lVert b_j-a_i\\rVert_2\\Big)"
                "\\end{aligned}"
            ),
            assumptions=(
                "Both paths are sampled on the same time grid and have equal length.",
                "Correspondence is by index, so the two paths must already be time-aligned.",
            ),
            breaks_when=(
                "The two paths are sampled at different rates, which index correspondence "
                "silently misinterprets as displacement.",
                "A single large late deviation is averaged away by many small early ones.",
            ),
            citation=None,
        )
    )

    card_list.append(
        MethodCard(
            key="fde",
            kind="divergence",
            title="Final displacement",
            one_liner="Separation at the last timestep only.",
            estimand_tex="d_{\\mathrm{FDE}}(a, b) \\;\\ge\\; 0",
            formula_tex=(
                "\\begin{aligned}"
                "d_{\\text{path}}(a,b) &= \\lVert a_T - b_T \\rVert_2 \\\\"
                "d_{\\text{cloud}}(A,B) &= \\lVert \\bar{A} - \\bar{B} \\rVert_2"
                "\\end{aligned}"
            ),
            assumptions=(
                "The endpoint is the quantity of interest and the path taken to it is not.",
            ),
            breaks_when=(
                "A robot pushes a pedestrian far off course mid-path but the pedestrian "
                "recovers to the same endpoint, which FDE scores as zero perturbation.",
                "Its cloud form compares centroids, so two populations with identical means "
                "and wildly different spreads score zero.",
            ),
            citation=None,
        )
    )

    card_list.append(
        MethodCard(
            key="frechet",
            kind="divergence",
            title="Discrete Fréchet distance",
            one_liner="The shortest leash length that lets both paths be walked monotonically.",
            estimand_tex="d_F(a, b) \\;\\ge\\; 0",
            formula_tex=(
                "d_F(a,b) \\;=\\; \\min_{\\sigma \\in \\mathcal{M}} \\;"
                "\\max_{(i,j) \\in \\sigma} \\; \\lVert a_i - b_j \\rVert_2"
            ),
            assumptions=(
                "Order along each path is meaningful; \\(\\mathcal{M}\\) ranges over monotone "
                "couplings of the two index sequences.",
                "Computed by an iterative dynamic program over an explicit \\(T \\times T\\) "
                "table.",
            ),
            breaks_when=(
                "It reports a maximum, so one outlier sample dominates the whole statistic.",
                "It is order-dependent and therefore has no meaningful point-cloud form; "
                "between_clouds raises NotImplementedError rather than discarding order silently, "
                "which also makes it unusable for split-half calibration.",
            ),
            citation=None,
        )
    )

    card_list.append(
        MethodCard(
            key="sinkhorn_w2",
            kind="divergence",
            title="Entropic 2-Wasserstein (Sinkhorn)",
            one_liner="Optimal-transport distance between two point clouds with uniform mass.",
            estimand_tex=(
                "W_2(\\alpha, \\beta) \\;=\\; \\Big(\\min_{\\pi \\in \\Pi(\\alpha,\\beta)}"
                " \\textstyle\\sum_{ij} \\pi_{ij} \\lVert x_i - y_j \\rVert_2^2 \\Big)^{1/2}"
            ),
            formula_tex=(
                "W_{2,\\varepsilon}(\\alpha,\\beta) = \\Big("
                "\\min_{\\pi \\in \\Pi(\\alpha,\\beta)} \\textstyle\\sum_{ij}"
                " \\pi_{ij}\\lVert x_i-y_j\\rVert_2^2 \\;-\\; \\varepsilon H(\\pi)"
                "\\Big)^{1/2}, \\quad H(\\pi) = -\\textstyle\\sum_{ij}\\pi_{ij}"
                "(\\log \\pi_{ij} - 1)"
            ),
            assumptions=(
                "Both clouds are treated as empirical measures with uniform marginals.",
                "Solved by log-domain Sinkhorn iterations for numerical stability at small "
                "\\(\\varepsilon\\).",
            ),
            breaks_when=(
                "The entropic regulariser biases the value upward; the bias grows with "
                "\\(\\varepsilon\\) and does not vanish at finite iteration counts.",
                "It is the slowest divergence here by a wide margin, which makes large "
                "split-half calibrations expensive.",
            ),
            citation="Cuturi, NeurIPS 2013",
        )
    )

    card_list.append(
        MethodCard(
            key="cvm_residual",
            kind="estimator",
            title="Constant-velocity forecast residual",
            one_liner="Standard practice, and the estimator this project exists to critique.",
            estimand_tex=_SHARED_ESTIMAND_TEX,
            formula_tex=(
                "\\hat{\\Delta}^{\\mathrm{CVM}} = \\tfrac{1}{N}\\sum_{n}\\tfrac{1}{K_n}"
                "\\sum_{k} d\\big(\\hat{Y}_{n,k},\\, Y^{(\\mathrm{robot})}_{n,k}\\big),"
                "\\quad \\hat{y}_{t} = y_{a} + (t-a)\\,\\Delta t\\; v,"
                "\\quad v = \\tfrac{y_a - y_{a-1}}{\\Delta t}"
            ),
            assumptions=(_identification_of("cvm_residual"),),
            breaks_when=(
                "Always. The residual mixes the robot's causal effect with ordinary forecast "
                "error — turning, acceleration, sensor noise, model misspecification — that "
                "would be present in a robot-free world, so the reported number rises with "
                "predictor error even when the true effect is exactly zero.",
                "The counterfactual arm is never consulted, so nothing in the computation "
                "references the robot's absence at all.",
                "A policy trained to minimise it is partly trained to move predictably, which "
                "is not the same thing as moving unobtrusively.",
            ),
            citation="The SACSoN-style residual; see wayfinder §4.4b",
        )
    )

    card_list.append(
        MethodCard(
            key="paired",
            kind="estimator",
            title="Paired counterfactual",
            one_liner="Divergence between each pedestrian's factual and robot-absent path.",
            estimand_tex=_SHARED_ESTIMAND_TEX,
            formula_tex=(
                "\\hat{\\Delta}^{\\mathrm{paired}} = \\tfrac{1}{N}\\sum_{n}\\tfrac{1}{K_n}"
                "\\sum_{k} d\\big(Y^{(\\mathrm{robot})}_{n,k},\\,"
                " Y^{(\\mathrm{no\\ robot})}_{n,k}\\big)"
            ),
            assumptions=(_identification_of("paired"),),
            breaks_when=(
                "The two arms do not actually share a seed and an exogenous noise realisation, "
                "in which case the divergence picks up ordinary between-rollout variation.",
                "It is reported in raw metres, so it has no scale until it is compared against a "
                "calibrated detection floor.",
                "The divergence is symmetric, so a pedestrian who approaches the robot out of "
                "curiosity scores identically to one who flees it.",
            ),
            citation=None,
        )
    )

    card_list.append(
        MethodCard(
            key="paired_debiased",
            kind="estimator",
            title="Paired counterfactual, in MDP units",
            one_liner="The paired estimate, floor-subtracted and rescaled into detection units.",
            estimand_tex=_SHARED_ESTIMAND_TEX,
            formula_tex=(
                "\\hat{\\Delta}^{\\mathrm{mdp}} = \\frac{1}{\\mathrm{MDP}_{95}}"
                "\\max\\!\\Big(0,\\; \\tfrac{1}{N}\\sum_{n}"
                "\\big(d_n - \\mathrm{MDP}_{95}\\big)\\Big)"
            ),
            assumptions=(_identification_of("paired_debiased"),),
            breaks_when=(
                "The supplied floor was calibrated on a different divergence or a different "
                "population, in which case the subtraction is meaningless.",
                "Clipping at zero makes the estimator biased upward near the floor: a true "
                "effect below the floor cannot be reported as negative and reads as exactly zero.",
            ),
            citation=None,
        )
    )

    card_list.append(
        MethodCard(
            key="noisy_oracle_residual",
            kind="estimator",
            title="Noisy oracle residual (diagnostic)",
            one_liner="A perfect causal predictor corrupted by a known amount of error.",
            estimand_tex=_SHARED_ESTIMAND_TEX,
            formula_tex=(
                "\\hat{Y}_{n,k} = Y^{(\\mathrm{no\\ robot})}_{n,k} + \\varepsilon,"
                " \\quad \\varepsilon \\sim \\mathcal{N}(0, \\sigma^2 I_2), \\qquad"
                " \\hat{\\Delta}^{\\mathrm{oracle}} = \\tfrac{1}{N}\\sum_n \\tfrac{1}{K_n}"
                "\\sum_k d\\big(\\hat{Y}_{n,k}, Y^{(\\mathrm{robot})}_{n,k}\\big)"
            ),
            assumptions=(_identification_of("noisy_oracle_residual"),),
            breaks_when=(
                "Always, by construction. When the true perturbation is zero and \\(d\\) is ADE, "
                "its expectation is \\(\\sigma\\sqrt{\\pi/2}\\) — a straight line through the "
                "origin in predictor error, with no dependence on the robot whatsoever.",
                "It is a diagnostic instrument for exhibiting that failure, and reporting a "
                "number from it as a measurement of perturbation would be a category error.",
                "The counterfactual arm is consulted, but only to be corrupted with noise "
                "before comparison — never as a legitimate forecast input. That is what makes "
                "this look like a residual estimator while testing nothing about the robot.",
            ),
            citation="Wayfinder §11 measurement 5",
        )
    )

    card_list.append(
        MethodCard(
            key="split_half_null",
            kind="calibration",
            title="Split-half null distribution",
            one_liner="What a divergence reports between two halves of a robot-free crowd.",
            estimand_tex=(
                "\\mathcal{N} \\;=\\; \\Big\\{\\, d_{\\text{cloud}}(A_s, B_s) \\,\\Big\\}_{s=1}^{S}"
            ),
            formula_tex=(
                "A_s \\sqcup B_s \\;=\\; \\mathcal{P}, \\quad |A_s| = |B_s| ="
                " \\lfloor |\\mathcal{P}| / 2 \\rfloor, \\quad"
                " A_s \\sim \\mathrm{Unif}\\big(\\text{balanced partitions of } \\mathcal{P}\\big)"
            ),
            assumptions=(
                "\\(\\mathcal{P}\\) is a pedestrian population carrying no robot effect, so any "
                "divergence between two of its halves is pure measurement noise.",
                "Halves are disjoint and drawn afresh on every split from a seeded generator.",
            ),
            breaks_when=(
                "The pool is not genuinely robot-free — a stationary robot in the scene puts a "
                "real effect into what is supposed to be the null.",
                "The population is too small for the halves to be representative, which inflates "
                "the null and hides real effects behind an overstated floor.",
            ),
            citation="Wayfinder §11 measurement 1; not previously published",
        )
    )

    card_list.append(
        MethodCard(
            key="minimum_detectable_perturbation",
            kind="calibration",
            title="Minimum detectable perturbation",
            one_liner="The detection floor: the effect size resolvable above measurement noise.",
            estimand_tex="\\mathrm{MDP}_{1-\\alpha} \\;=\\; Q_{1-\\alpha}\\big(\\mathcal{N}\\big)",
            formula_tex=(
                "\\mathrm{MDP}_{95} \\;=\\; Q_{0.95}\\big(\\mathcal{N}\\big), \\qquad"
                " \\text{report } \\hat{\\Delta} \\text{ in units of } \\mathrm{MDP}_{95}"
            ),
            assumptions=(
                "The null sample is drawn from the same divergence and a comparable population "
                "to the estimate being calibrated.",
            ),
            breaks_when=(
                "It is a one-sided quantile of a finite sample, so it is itself noisy at small "
                "split counts.",
                "An estimate below it is not evidence of no effect, only of no detectable "
                "effect at this sample size.",
            ),
            citation="Wayfinder §11 measurement 1",
        )
    )

    card_list.append(
        MethodCard(
            key="bootstrap_ci",
            kind="calibration",
            title="Percentile bootstrap interval",
            one_liner="The confidence interval every estimate is required to carry.",
            estimand_tex=(
                "\\big[\\, Q_{\\alpha/2}(\\bar{v}^*),\\; Q_{1-\\alpha/2}(\\bar{v}^*) \\,\\big]"
            ),
            formula_tex=(
                "\\bar{v}^{*b} = \\tfrac{1}{N}\\sum_{i=1}^{N} v_{I^b_i}, \\quad"
                " I^b_i \\sim \\mathrm{Unif}\\{1,\\dots,N\\}, \\quad b = 1,\\dots,B"
            ),
            assumptions=(
                "The per-pair values are exchangeable, so resampling pairs with replacement "
                "approximates the sampling distribution of their mean.",
                "B = 1000 resamples at \\(\\alpha = 0.05\\), from a seeded generator.",
            ),
            breaks_when=(
                "N is small, where the percentile bootstrap undercovers.",
                "The per-pair distribution is heavy-tailed, which the wayfinder (§14 R6) flags "
                "as a live risk for perturbation specifically.",
            ),
            citation=None,
        )
    )

    for card in card_list:
        if card.key in cards:
            raise ValueError(f"duplicate MethodCard key '{card.key}' in the catalogue")
        cards[card.key] = card
    return cards


CARDS: dict[str, MethodCard] = _build_cards()


def card_for(key: str) -> MethodCard:
    """Look up one card by key, raising KeyError listing available keys if absent."""
    if key not in CARDS:
        available = ", ".join(sorted(CARDS.keys()))
        raise KeyError(f"unknown method card '{key}'; available: {available}")
    return CARDS[key]


def cards_of_kind(kind: str) -> tuple[MethodCard, ...]:
    """Every card of one kind, ordered by key."""
    if kind not in MethodCard.KINDS:
        raise ValueError(
            f"unknown MethodCard kind '{kind}'; must be one of {', '.join(MethodCard.KINDS)}"
        )
    selected: list[MethodCard] = []
    for key in sorted(CARDS.keys()):
        if CARDS[key].kind == kind:
            selected.append(CARDS[key])
    return tuple(selected)
