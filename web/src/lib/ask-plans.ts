/**
 * The prompt box's plan dropdown (owner, ORCHESTRATOR_NOTES item 30): exactly three plans, one per answer, never side by side.
 * The API mirrors this list in api/app/ask_plans.py (label → plan code); the request carries only the letter (AssistIn.plan_choice).
 */
export type AskPlanChoice = "A" | "B" | "C";

export interface AskPlan { choice: AskPlanChoice; label: string; code: string; name: string }

export const ASK_PLANS: readonly AskPlan[] = [
  { choice: "A", label: "Plan A", code: "DD24", name: "Delta Dental PPO High" },
  { choice: "B", label: "Plan B", code: "DD24L", name: "Delta Dental PPO Low" },
  { choice: "C", label: "Plan C", code: "FD26H", name: "Delta Dental Federal High" },
] as const;

export const DEFAULT_ASK_PLAN: AskPlanChoice = "A";

export const askPlanFor = (choice: string | null | undefined): AskPlan => ASK_PLANS.find((p) => p.choice === choice) ?? ASK_PLANS[0];

/** "Plan A · Delta Dental PPO High" */
export const askPlanText = (p: AskPlan): string => `${p.label} · ${p.name}`;

const KEY = "oc.ask.plan";

/** The chosen plan is remembered for this browser session only (a per-viewer convenience; storage may be blocked). */
export function readAskPlan(): AskPlanChoice {
  try {
    const v = window.sessionStorage.getItem(KEY);
    return ASK_PLANS.some((p) => p.choice === v) ? (v as AskPlanChoice) : DEFAULT_ASK_PLAN;
  } catch { return DEFAULT_ASK_PLAN; }
}

export function writeAskPlan(choice: AskPlanChoice): void {
  try { window.sessionStorage.setItem(KEY, choice); } catch { /* storage blocked: the choice lasts until the sheet closes */ }
}
