---
description: Engine extensions from the master prompt §7: bundled services with duplicate prevention, per-unit quantities (tooth/quadrant/arch/visit), orthodontic lifetime maximum and installment accounting, benefit-year rollover across a multi-stage journey
---
Add to `engine/oralcompass_engine`: `bundle_id` on estimate lines (members of a bundle are priced once; follow-ups inside a bundle carry no charge), unit types with quantity
multiplication and per-unit frequency clocks, `lifetime_max` rules by class (orthodontics) with remaining lifetime balance in MemberState, installment schedules that never
double count the contract total, and benefit-year rollover (a line dated in the next benefit year resets the deductible and maximum per the plan's benefit-year start month).
Every rule carries its cite; unknown stays unresolved. Tests for each (master prompt §12 list), plus revisiting stages never consumes benefits twice (idempotent recalculation).
