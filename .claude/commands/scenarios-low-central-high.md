---
description: Run low / central / high cost scenarios through the full engine independently and show them as a range with their bases (master prompt §7)
---
1. Engine: `compute_scenarios(plan, lines_by_scenario, state)` runs the whole ledger three times (each scenario's fees/allowed amounts), never scales a single total;
   caps and deductibles apply per run. Output {low, central, high} ledgers + a `basis` per scenario (quoted price, published median, demo assumption).
2. API: `POST /me/estimates` accepts `scenario_fees` per treatment item (low/central/high cents with basis + source); default is the single entered fee as central.
3. UI: the lighthouse shows the central trail and a "Range across scenarios" line with the three totals and their bases; never label a midpoint an average.
4. Tests: nonlinear caps (a maximum that binds only in the high scenario), deductible met only in one scenario, penny reconciliation per scenario.
