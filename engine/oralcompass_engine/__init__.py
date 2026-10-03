"""OralCompass deterministic benefit engine (no AI, no advice). See docs/CODELINC_DENTAL_PRODUCT_SPEC.md §5.4."""
from .models import (Citation, ClassRule, Evidence, EstimateLine, FrequencyRule, Ledger, LedgerLine, MemberState, PlanModel, Step, V,
                     AlternateBenefit)
from .ledger import compute_ledger, compute_line, benefit_year
from .ranges import range_and_movers, candidate_values
from .comparison import compare, grid, TOPICS
from .loader import load_plan, load_estimate, load_state, load_fixture_set, FIXTURES

__all__ = ["Citation", "ClassRule", "Evidence", "EstimateLine", "FrequencyRule", "Ledger", "LedgerLine", "MemberState", "PlanModel",
           "Step", "V", "AlternateBenefit", "compute_ledger", "compute_line", "benefit_year", "range_and_movers", "candidate_values",
           "compare", "grid", "TOPICS", "load_plan", "load_estimate", "load_state", "load_fixture_set", "FIXTURES"]
