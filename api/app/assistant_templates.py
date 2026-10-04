"""Deterministic templates for the grounded assistant (spec section 8.5). Linted by tools/advice_lint.py.

Every amount is a {{ref:n}} placeholder that the client renders from the estimate, plan or benefits payload it already holds.
No template states a number. No template steers. Text in braces without the ref prefix is filled server-side with words only
(category names, procedure names, source words, dates), never with money or percentages.
"""

# Trail explanation strings, one per trail key (ported from the web trail vocabulary; no em dashes).
TRAIL_EXPLANATIONS = {
    "fee": "What the dentist charges, as written on the estimate.",
    "allowed_in": "In network: the dentist accepts the allowed amount; the difference is not owed by you.",
    "allowed_out": "Out of network: the amount above the allowed amount may be billed to you.",
    "allowed_equal": "The allowed amount equals the fee.",
    "alternate": "The plan pays on the less costly alternative's allowance; the difference becomes your share.",
    "deductible_applied": "Applied to your remaining deductible; your share.",
    "deductible_none": "No deductible applied to this line (waived for this class, or already met per your records).",
    "share": "The plan pays its stated percentage of the amount after the deductible; the rest is your share.",
    "max_beyond": "Part of the plan share exceeds the plan's remaining annual maximum; that part is your share.",
    "max_within": "Within the plan's remaining annual maximum (or no maximum applies); no adjustment.",
    "not_covered": "The plan pays nothing for this line; the full fee is your share.",
    "listed": "An item listed on your estimate, copied as written.",
    "waiting": "This line is waiting for information; no amount is shown until the missing input is entered.",
}

# Step key vocabulary: the client sends either a trail key or an engine rule code.
RULE_FROM_STEP_KEY = {
    "fee": "fee", "allowed": "N", "alternate": "AB", "deductible": "D", "share": "CO", "max": "M", "you": "total", "total": "total",
    "N": "N", "AB": "AB", "D": "D", "CO": "CO", "M": "M", "X": "X", "W": "W", "F": "F",
}

# explain_step templates (one per rule code). Placeholders index the sentence's own refs array.
EXPLAIN_STEP = {
    "D_applied_with_records": "This line applied {{ref:0}} to your deductible. Your records list {{ref:1}} remaining at the start of this estimate; the plan document states a deductible of {{ref:2}}.",
    "D_applied_no_records": "This line applied {{ref:0}} to your deductible; the plan document states a deductible of {{ref:1}}.",
    "D_applied_plan_unknown": "This line applied {{ref:0}} to your deductible; the pages read do not state the plan's deductible amount.",
    "D_none": "No deductible was applied to this line: {reason}.",
    "D_reason_waived": "the plan document waives the deductible for {category}",
    "D_reason_met": "your records list {{ref:0}} remaining, so nothing was left to apply",
    "D_reason_absent": "the ledger lists no deductible step for this line",
    "CO_main": "The plan's share for {category} is {{ref:0}} of the amount after the deductible; your share on this line is {{ref:1}}.",
    "CO_plan_pre": "Before the annual maximum is applied, the plan's share comes to {{ref:0}}.",
    "M_beyond": "{{ref:0}} of the plan's share exceeds the remaining annual maximum and is your share; the remaining maximum before this line was {{ref:1}}.",
    "M_within": "This line stays within the remaining annual maximum of {{ref:0}}.",
    "M_unlimited": "The plan document states no annual maximum applies to this line.",
    "M_exempt": "The plan document states that {category} services do not count toward the annual maximum.",
    "AB_applied": "The plan pays on the less costly alternative's allowance for this line; the difference between the allowed amount and that basis, {{ref:0}}, is your share.",
    "AB_upper_bound": "An alternate-benefit clause applies to this line and the document does not state the alternate allowance, so the plan's share shown is an upper bound.",
    "AB_unknown": "The alternate-benefit clause was not found in the pages read for this plan; the plan's share could be lower if one applies.",
    "AB_none": "No alternate benefit changes this line under the plan document.",
    "N_in": "The dentist's fee and the plan's allowed amount differ by {{ref:0}}; in network, that difference is not owed by you.",
    "N_out": "The dentist's fee and the plan's allowed amount differ by {{ref:0}}; out of network, that amount may be billed to you.",
    "N_equal": "The allowed amount for this line equals the dentist's fee, so no network adjustment appears.",
    "fee": "The dentist's fee on this line is {{ref:0}}, as written on your estimate.",
    "total": "What you pay on this line is {{ref:0}}; the plan's share is {{ref:1}}.",
    "not_covered": "This line is not covered under the plan document: {label}. The full fee, {{ref:0}}, is your share.",
    "unresolved": "This line is waiting for information: {inputs}. No amount is shown until it is entered.",
    "unresolved_generic": "This line is waiting for information; the estimate lists what is missing and where it comes from.",
}

EXPLAIN_CLAUSE = {
    "sets": "This sentence sets {topic}.",
    "changes": "In this estimate it changes {{ref:0}} on {line_label}.",
    "no_change": "This sentence does not change any amount in this estimate.",
    "applies_to": "The plan's rules cite this sentence for: {names}.",
    "applies_to_none": "No procedure rule in this plan cites this sentence.",
}

# Topic words for clause field paths (words only).
CLAUSE_TOPICS = {
    "deductible_individual": "the individual deductible",
    "deductible_family": "the family deductible",
    "annual_max": "the annual maximum",
    "benefit_year_start_month": "when the benefit year begins",
    "oon_rule": "the out-of-network payment basis",
    "waiting_months": "the waiting period",
    "alternate_benefit": "the alternate-benefit rule",
    "dos_rule": "the date-of-service rule",
    "premium_monthly": "a premium amount",
    "classes": "the plan's share for {name}",
    "class_of": "the coverage class of {name}",
    "frequency": "a frequency limit for {name}",
    "excluded": "an exclusion for {name}",
    "procedure_codes": "a procedure code as printed for {name}",
    "unsupported_rules": "a rule the engine does not compute",
    "default": "a plan rule",
}

WHERE_FROM = {
    "D_records": "{{ref:0}} comes from your records: the plan document's deductible, {{ref:1}}, less the amount met per your statement dated {date}, {{ref:2}}.",
    "D_not_provided": "The remaining deductible is not provided in your records; the plan document states a deductible of {{ref:0}}.",
    "M_records": "{{ref:0}} comes from your records: the plan document's annual maximum, {{ref:1}}, less the amount the plan paid per your statement dated {date}, {{ref:2}}.",
    "M_not_provided": "The remaining annual maximum is not provided in your records; the plan document states an annual maximum of {{ref:0}}.",
    "CO": "{{ref:0}} comes from the plan document's coverage table for {category}.",
    "N_item": "{{ref:0}} is the allowed amount you entered from {source}.",
    "N_plan": "{{ref:0}} is the allowed amount printed in the plan document.",
    "fee": "{{ref:0}} is the dentist's fee as written on your estimate ({source}).",
    "step": "{{ref:0}} is computed by the engine from the plan's cited rule and your records; the step is stitched to its clause.",
}

WHAT_IF = "A hypothetical is entered on the Harbor Light, not here. Hypotheticals are labelled as such on every estimate."
CLARIFY = "This question could refer to {k} procedures on the route: {names}. Which one?"
OUT_OF_SCOPE = ("This assistant answers about the selected procedure, its checkpoints and the plan clauses behind them. "
                "Clinical questions are for your dental team.")
NO_ESTIMATE_IN_SCOPE = "No estimate is selected. The plan's clauses can still be opened from the Documents view."

# Suggested questions per step key (rule code), shown as chips under the composer.
SUGGESTIONS = {
    "D": ["What deductible amount was applied to this line?", "Where does the remaining deductible figure come from?", "What does the plan document say about the deductible?"],
    "CO": ["What share of this line does the plan pay?", "Where does the coinsurance percentage come from?", "What does the plan document say about this coverage class?"],
    "M": ["Does this line stay within the remaining annual maximum?", "Where does the remaining maximum figure come from?", "What does the plan document say about the annual maximum?"],
    "AB": ["Does an alternate benefit apply to this line?", "What does the plan document say about alternate benefits?", "Which clause is behind this step?"],
    "N": ["Why do the fee and the allowed amount differ?", "Where does the allowed amount come from?", "What does the plan document say about network payment?"],
    "fee": ["Where does the dentist's fee come from?", "Which steps on this line are cited to the plan document?", "What is waiting for information on this line?"],
    "total": ["Which steps make up your share on this line?", "Which clauses are behind this line?", "Where does each figure on this line come from?"],
    "X": ["Which clause excludes this procedure?", "What does the plan document say about this exclusion?", "Which steps on this line are cited?"],
    "clause": ["What does this sentence change in my estimate?", "Which procedures does this sentence apply to?"],
    "default": ["What does this step mean?", "Where does this figure come from?", "What does the plan document say here?"],
}

ADVICE_LABEL = "Information, not a choice"
