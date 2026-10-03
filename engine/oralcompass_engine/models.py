"""OralCompass deterministic engine — data model.

Every value that reaches the UI carries an evidence status. Money is integer cents. Dates are ISO strings or
datetime.date. Nothing here calls a model; nothing here recommends anything.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import date
from enum import Enum
from typing import Any, Optional


class Evidence(str, Enum):
    DOC = "DOC"            # explicitly supported by the document (citation required)
    USER = "USER"          # supplied by the user
    ASSUMED = "ASSUMED"    # hypothetical the user explicitly enabled
    AMBIGUOUS = "AMBIGUOUS"
    UNKNOWN = "UNKNOWN"    # not provided / not stated in this document
    CONFLICT = "CONFLICT"  # sources disagree


@dataclass
class Citation:
    doc_sha256: str
    doc_version_label: str   # e.g. "HB26", "DD24", "ML26", "ML20c"
    page_start: int
    page_end: int
    quote: str

    def label(self) -> str:
        return f"{self.doc_version_label} p.{self.page_start}"


@dataclass
class V:
    """A value with evidence. `value` may be None when status is UNKNOWN."""
    value: Any
    status: Evidence
    cite: Optional[Citation] = None
    note: str = ""

    @property
    def known(self) -> bool:
        return self.status not in (Evidence.UNKNOWN,) and self.value is not None


@dataclass
class ClassRule:
    name: str
    plan_share_bp_in: V           # basis points the PLAN pays in-network (8000 = 80%)
    plan_share_bp_out: V          # out-of-network
    procedures_text: list[str]    # how the document names the procedures in this class
    cite: Optional[Citation] = None


@dataclass
class FrequencyRule:
    procedure_key: str
    clock: str                    # calendar_count | interval_months | rolling12_count | per_tooth_months | lifetime
    n: int
    cite: Optional[Citation] = None


@dataclass
class AlternateBenefit:
    """Alternate-benefit / least-expensive-alternative clause.
    conditions: list of {procedure_key, condition (molar|mandibular_molar|posterior|any), basis_key|None}
    A None basis_key with status DOC means: the clause applies but the document does not state the alternate allowance."""
    status: Evidence
    conditions: list[dict] = field(default_factory=list)
    cite: Optional[Citation] = None


@dataclass
class PlanModel:
    plan_code: str                # scope tag prefix, e.g. "HB26"
    title: str
    carrier_text: str
    is_fictional: bool
    benefit_year_start_month: V   # 1 = calendar year
    deductible_individual: V      # cents
    deductible_waived_classes: list[str]
    annual_max: V                 # cents
    classes: list[ClassRule]
    class_of: dict[str, V]        # procedure_key -> V(class name)
    allowed_amounts: dict[str, V] # procedure_key -> V(cents); UNKNOWN when the document has no schedule
    alternate_benefit: AlternateBenefit
    waiting_months: V             # V(dict[class -> months]) or UNKNOWN
    frequency: list[FrequencyRule] = field(default_factory=list)
    excluded: dict[str, V] = field(default_factory=dict)   # procedure_key -> V(True) excluded
    oon_rule: V = field(default_factory=lambda: V(None, Evidence.UNKNOWN))
    dos_rule: V = field(default_factory=lambda: V("completion", Evidence.UNKNOWN))
    premium_monthly: dict[str, V] = field(default_factory=dict)   # category -> V(cents)
    unsupported_rules: list[dict] = field(default_factory=list)
    max_exempt_classes: list[str] = field(default_factory=list)   # classes that do not count toward / are not capped by the annual maximum (document-stated)
    deductible_family: V = field(default_factory=lambda: V(None, Evidence.UNKNOWN))
    # Plans whose out-of-network deductible / maximum differ from the in-network figures (e.g. FEDVIP brochures). UNKNOWN means
    # "the document states one figure for both" or "not stated"; when known and different, out-of-network math needs the member's
    # separate out-of-network usage figures (MemberState.remaining_deductible_out / remaining_max_out) or it stays unresolved.
    deductible_individual_out: V = field(default_factory=lambda: V(None, Evidence.UNKNOWN))
    annual_max_out: V = field(default_factory=lambda: V(None, Evidence.UNKNOWN))
    annual_max_unlimited: bool = False     # document states no annual maximum (e.g. "Unlimited") for in-network services
    annual_max_out_unlimited: bool = False
    procedure_codes: dict[str, dict] = field(default_factory=dict)   # procedure_key -> {code, descriptor_as_printed, cite} as printed in THIS document

    def class_rule(self, name: str) -> Optional[ClassRule]:
        return next((c for c in self.classes if c.name == name), None)


@dataclass
class EstimateLine:
    key: str                      # procedure_key used to look up class/allowed/frequency
    label: str                    # as written on the estimate
    tooth: Optional[str]
    charge_cents: int
    completion: Optional[date] = None
    prep: Optional[date] = None
    listed_fees: list[dict] = field(default_factory=list)   # [{label, cents}] copied from the estimate, never invented


@dataclass
class MemberState:
    """Plan-specific. Never copied between plans."""
    remaining_deductible: V       # cents or UNKNOWN
    remaining_max: V              # cents or UNKNOWN
    network: V                    # "in" | "out" | UNKNOWN
    enrolled_months: V            # int or UNKNOWN
    history: dict[str, list[date]] = field(default_factory=dict)     # procedure_key -> service dates
    allowed_overrides: dict[str, V] = field(default_factory=dict)    # procedure_key -> V(cents) USER/ASSUMED
    tooth_overrides: dict[str, str] = field(default_factory=dict)
    remaining_deductible_out: V = field(default_factory=lambda: V(None, Evidence.UNKNOWN))   # only for plans with a separate out-of-network deductible
    remaining_max_out: V = field(default_factory=lambda: V(None, Evidence.UNKNOWN))          # only for plans with a separate out-of-network maximum


@dataclass
class Step:
    label: str
    cents: int
    owner: str          # patient | plan | nobody | plan_pre | basis
    rule: str           # D deductible | CO coinsurance | M max | AB alternate | N network | W waiting | F frequency | X exclusion
    stitch: Optional[str] = None   # scoped stitch id, e.g. "HB26#9"


@dataclass
class LedgerLine:
    label: str
    status: str                       # estimate | unresolved | not_covered
    steps: list[Step] = field(default_factory=list)
    patient_cents: Optional[int] = None
    plan_cents: Optional[int] = None
    plan_is_upper_bound: bool = False
    flags: list[str] = field(default_factory=list)
    remaining_after: dict = field(default_factory=dict)
    benefit_year: Optional[int] = None


@dataclass
class Ledger:
    status: str                       # estimate | unresolved
    lines: list[LedgerLine]
    patient_total_cents: Optional[int]
    plan_total_cents: Optional[int]
    plan_total_is_upper_bound: bool
    flags: list[str]
    not_provided: list[str]
    assumptions: list[str]
    order_note: str
    could_change: str = ("Claims already submitted but not yet processed, services since your statement date, and the plan's own "
                         "determination can change these amounts. This is an estimate, not the plan's decision.")

    def to_dict(self) -> dict:
        return asdict(self)
