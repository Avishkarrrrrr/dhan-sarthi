import type { Goal } from "@/lib/data/types";

const THIS_YEAR = 2026;

/**
 * Future value with monthly compounding:
 *   FV = corpus*(1+r)^n + monthly * ((1+r)^n - 1)/r
 * where r = annual%/100/12, n = years*12.
 */
export function retirementProjection(
  currentCorpus: number,
  monthly: number,
  years: number,
  annualReturnPct: number,
): number {
  const r = annualReturnPct / 100 / 12;
  const n = Math.round(years * 12);
  if (r === 0) return Math.round(currentCorpus + monthly * n);
  const growth = Math.pow(1 + r, n);
  const fv = currentCorpus * growth + monthly * ((growth - 1) / r);
  return Math.round(fv);
}

export interface ProjectionRow {
  year: number;
  value: number;
}

/** Year-by-year projected value of a goal from now to its target year. */
export function projectGoal(
  goal: Goal,
  monthlyContribution: number,
  annualReturnPct: number,
): ProjectionRow[] {
  const years = Math.max(0, goal.targetYear - THIS_YEAR);
  const rows: ProjectionRow[] = [];
  for (let y = 0; y <= years; y++) {
    rows.push({
      year: THIS_YEAR + y,
      value: retirementProjection(goal.current, monthlyContribution, y, annualReturnPct),
    });
  }
  return rows;
}

export interface GoalVerdict {
  projected: number;
  target: number;
  onTrack: boolean;
  shortfall: number; // positive if short, 0 if on track
}

export function goalVerdict(
  goal: Goal,
  monthlyContribution: number,
  annualReturnPct: number,
): GoalVerdict {
  const years = Math.max(0, goal.targetYear - THIS_YEAR);
  const projected = retirementProjection(goal.current, monthlyContribution, years, annualReturnPct);
  const onTrack = projected >= goal.targetAmount;
  return {
    projected,
    target: goal.targetAmount,
    onTrack,
    shortfall: onTrack ? 0 : goal.targetAmount - projected,
  };
}
