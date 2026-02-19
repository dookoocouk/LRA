"""
RealFood? — Scoring Engine
Module: src.scoring.engine

Deterministic scoring engine for UK food product labels.
Computes a composite score from ingredient quality analysis
and nutritional profile, mapped to a traffic-light rating.

All weights and thresholds are loaded from config/scoring_config.yaml.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class TrafficLight(str, Enum):
    GREEN = "green"
    AMBER = "amber"
    RED = "red"


class UPFSeverity(str, Enum):
    A = "A"  # Critical
    B = "B"  # High
    C = "C"  # Moderate
    D = "D"  # Low
    NONE = "NONE"


UPF_BASE_WEIGHTS: dict[UPFSeverity, float] = {
    UPFSeverity.A: 8.0,
    UPFSeverity.B: 5.0,
    UPFSeverity.C: 3.0,
    UPFSeverity.D: 1.5,
    UPFSeverity.NONE: 0.0,
}


@dataclass
class IngredientFlag:
    """A flagged ingredient from the semantic label analysis."""

    name: str
    position: int  # 1-indexed position in ingredient list
    severity: UPFSeverity
    category: str  # e.g., "artificial_sweetener", "emulsifier"


@dataclass
class NutritionData:
    """Nutritional values per 100g (or per 100ml for drinks)."""

    energy_kj: float = 0.0
    fat_g: float = 0.0
    saturates_g: float = 0.0
    sugars_g: float = 0.0
    salt_g: float = 0.0
    fibre_g: float = 0.0
    protein_g: float = 0.0
    energy_kcal: float = 0.0
    is_drink: bool = False


@dataclass
class LabelTrick:
    """A detected deceptive labelling practice."""

    trick_type: str  # e.g., "broken_out_sugars", "health_halo"
    description: str
    evidence: str  # The specific text from the label
    penalty: float


@dataclass
class PositiveFactor:
    """A positive attribute of the product."""

    factor_type: str
    description: str
    bonus: float


@dataclass
class ScoringResult:
    """Complete scoring result for a product."""

    score: float
    traffic_light: TrafficLight
    s_upf: float
    s_nutrition: float
    s_additives: float
    s_label_tricks: float
    s_positives: float
    upf_breakdown: list[dict[str, Any]] = field(default_factory=list)
    nutrition_breakdown: list[dict[str, Any]] = field(default_factory=list)
    override_applied: str | None = None


# ---------------------------------------------------------------------------
# FSA Thresholds
# ---------------------------------------------------------------------------

FSA_THRESHOLDS_FOOD: dict[str, dict[str, float]] = {
    "fat_g": {"green_max": 3.0, "red_min": 17.5, "max_penalty": 5.0},
    "saturates_g": {"green_max": 1.5, "red_min": 5.0, "max_penalty": 5.0},
    "sugars_g": {"green_max": 5.0, "red_min": 22.5, "max_penalty": 6.0},
    "salt_g": {"green_max": 0.3, "red_min": 1.5, "max_penalty": 6.0},
}

FSA_THRESHOLDS_DRINK: dict[str, dict[str, float]] = {
    "fat_g": {"green_max": 1.5, "red_min": 8.75, "max_penalty": 5.0},
    "saturates_g": {"green_max": 0.75, "red_min": 2.5, "max_penalty": 5.0},
    "sugars_g": {"green_max": 2.5, "red_min": 11.25, "max_penalty": 6.0},
    "salt_g": {"green_max": 0.3, "red_min": 1.5, "max_penalty": 6.0},
}

# Label trick penalties
LABEL_TRICK_PENALTIES: dict[str, float] = {
    "broken_out_sugars": 5.0,
    "flavouring_ambiguity": 2.0,
    "clean_label_swap": 3.0,
    "percentage_game": 4.0,
    "health_halo": 3.0,
}

MAX_ADDITIVE_PENALTY: float = 15.0
MAX_LABEL_TRICK_PENALTY: float = 12.0
MAX_POSITIVE_BONUS: float = 10.0
POSITION_DECAY_EXPONENT: float = 0.5


# ---------------------------------------------------------------------------
# Core Scoring Functions
# ---------------------------------------------------------------------------


def _position_decay(position: int, total: int) -> float:
    """
    Compute the position-based decay factor.

    Ingredients listed first (higher quantity) receive a higher penalty.
    w = (1 - (pos-1)/N) ^ 0.5
    """
    if total <= 0:
        return 1.0
    ratio = (position - 1) / total
    return math.pow(max(0.0, 1.0 - ratio), POSITION_DECAY_EXPONENT)


def compute_upf_penalty(
    flags: list[IngredientFlag],
    total_ingredients: int,
) -> tuple[float, list[dict[str, Any]]]:
    """
    Compute the total UPF penalty from flagged ingredients.

    Returns the total penalty and a breakdown list for auditability.
    """
    total = 0.0
    breakdown = []

    for flag in flags:
        if flag.severity == UPFSeverity.NONE:
            continue

        base_weight = UPF_BASE_WEIGHTS[flag.severity]
        decay = _position_decay(flag.position, total_ingredients)
        penalty = base_weight * decay

        breakdown.append({
            "ingredient": flag.name,
            "position": flag.position,
            "severity": flag.severity.value,
            "base_weight": base_weight,
            "decay_factor": round(decay, 3),
            "penalty": round(penalty, 2),
        })
        total += penalty

    return round(total, 2), breakdown


def _nutrient_delta(value: float, green_max: float, red_min: float) -> float:
    """
    Compute the linear interpolation factor for a nutrient value.

    Returns 0 if green, 1 if red, linear between.
    """
    if value <= green_max:
        return 0.0
    if value >= red_min:
        return 1.0
    return (value - green_max) / (red_min - green_max)


def compute_nutrition_penalty(
    nutrition: NutritionData,
) -> tuple[float, list[dict[str, Any]]]:
    """
    Compute the nutritional penalty using FSA thresholds.

    Returns the total penalty and a breakdown list.
    """
    thresholds = FSA_THRESHOLDS_DRINK if nutrition.is_drink else FSA_THRESHOLDS_FOOD
    total = 0.0
    breakdown = []

    nutrient_map = {
        "fat_g": nutrition.fat_g,
        "saturates_g": nutrition.saturates_g,
        "sugars_g": nutrition.sugars_g,
        "salt_g": nutrition.salt_g,
    }

    for nutrient_key, value in nutrient_map.items():
        t = thresholds[nutrient_key]
        delta = _nutrient_delta(value, t["green_max"], t["red_min"])
        penalty = t["max_penalty"] * delta

        band = "green" if delta == 0 else ("red" if delta >= 1 else "amber")
        breakdown.append({
            "nutrient": nutrient_key,
            "value": value,
            "band": band,
            "delta": round(delta, 3),
            "penalty": round(penalty, 2),
        })
        total += penalty

    return round(total, 2), breakdown


def compute_additive_penalty(additive_penalties: list[float]) -> float:
    """
    Sum additive penalties, capped at MAX_ADDITIVE_PENALTY.
    """
    return min(sum(additive_penalties), MAX_ADDITIVE_PENALTY)


def compute_label_trick_penalty(tricks: list[LabelTrick]) -> float:
    """
    Sum label trick penalties, capped at MAX_LABEL_TRICK_PENALTY.
    """
    return min(
        sum(t.penalty for t in tricks),
        MAX_LABEL_TRICK_PENALTY,
    )


def compute_positive_bonus(positives: list[PositiveFactor]) -> float:
    """
    Sum positive bonuses, capped at MAX_POSITIVE_BONUS.
    """
    return min(
        sum(p.bonus for p in positives),
        MAX_POSITIVE_BONUS,
    )


def _determine_traffic_light(score: float) -> TrafficLight:
    """Map a numeric score to a traffic-light rating."""
    if score >= 75:
        return TrafficLight.GREEN
    if score >= 45:
        return TrafficLight.AMBER
    return TrafficLight.RED


# ---------------------------------------------------------------------------
# Override Rules
# ---------------------------------------------------------------------------

HYDROGENATED_CATEGORIES = {"hydrogenated_fat", "partially_hydrogenated_fat"}


def _check_overrides(
    flags: list[IngredientFlag],
    nutrition: NutritionData,
    score: float,
) -> tuple[TrafficLight, str | None]:
    """
    Apply hard override rules that force a traffic-light regardless of score.

    Returns the traffic light and an override reason (or None).
    """
    # Override: trans fat present
    for flag in flags:
        if flag.category in HYDROGENATED_CATEGORIES:
            return TrafficLight.RED, "Contains trans fat (WHO elimination target)"

    # Override: 5+ UPF markers
    upf_count = sum(1 for f in flags if f.severity != UPFSeverity.NONE)
    if upf_count >= 5:
        return TrafficLight.RED, f"{upf_count} UPF markers detected"

    # Override: single whole ingredient → force green
    if len(flags) == 0 and score >= 95:
        return TrafficLight.GREEN, "Single whole ingredient (NOVA Group 1)"

    # Override: FSA red on 3+ of 4 nutrients → cannot be green
    thresholds = FSA_THRESHOLDS_DRINK if nutrition.is_drink else FSA_THRESHOLDS_FOOD
    nutrient_map = {
        "fat_g": nutrition.fat_g,
        "saturates_g": nutrition.saturates_g,
        "sugars_g": nutrition.sugars_g,
        "salt_g": nutrition.salt_g,
    }
    red_count = sum(
        1 for k, v in nutrient_map.items()
        if v >= thresholds[k]["red_min"]
    )
    if red_count >= 3:
        tl = _determine_traffic_light(score)
        if tl == TrafficLight.GREEN:
            return TrafficLight.AMBER, "FSA red on 3+ of 4 nutrients"
        return tl, None

    return _determine_traffic_light(score), None


# ---------------------------------------------------------------------------
# Main Scoring Function
# ---------------------------------------------------------------------------


def score_product(
    ingredient_flags: list[IngredientFlag],
    total_ingredients: int,
    nutrition: NutritionData,
    additive_penalties: list[float] | None = None,
    label_tricks: list[LabelTrick] | None = None,
    positives: list[PositiveFactor] | None = None,
) -> ScoringResult:
    """
    Compute the final product score.

    This function is deterministic: identical inputs always produce
    identical outputs.

    Args:
        ingredient_flags: List of flagged ingredients with UPF severity.
        total_ingredients: Total number of ingredients in the product.
        nutrition: Nutritional values per 100g/100ml.
        additive_penalties: List of individual additive penalty values.
        label_tricks: List of detected label tricks.
        positives: List of positive factors.

    Returns:
        ScoringResult with the composite score, traffic light, and breakdown.
    """
    # UPF penalty
    s_upf, upf_breakdown = compute_upf_penalty(
        ingredient_flags, total_ingredients,
    )

    # Nutrition penalty
    s_nutrition, nutrition_breakdown = compute_nutrition_penalty(nutrition)

    # Additive penalty
    s_additives = compute_additive_penalty(additive_penalties or [])

    # Label trick penalty
    s_label_tricks = compute_label_trick_penalty(label_tricks or [])

    # Positive bonus
    s_positives = compute_positive_bonus(positives or [])

    # Composite score
    raw_score = 100 - s_upf - s_nutrition - s_additives - s_label_tricks + s_positives
    score = max(0.0, min(100.0, raw_score))
    score = round(score, 1)

    # Traffic light with override checks
    traffic_light, override_reason = _check_overrides(
        ingredient_flags, nutrition, score,
    )

    return ScoringResult(
        score=score,
        traffic_light=traffic_light,
        s_upf=s_upf,
        s_nutrition=s_nutrition,
        s_additives=s_additives,
        s_label_tricks=s_label_tricks,
        s_positives=s_positives,
        upf_breakdown=upf_breakdown,
        nutrition_breakdown=nutrition_breakdown,
        override_applied=override_reason,
    )
