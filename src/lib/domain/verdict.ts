export const VERDICTS = ['Good', 'Uncertain', 'Bad'] as const;

export type Verdict = (typeof VERDICTS)[number];

const verdictRank: Record<Verdict, number> = {
  Good: 3,
  Uncertain: 2,
  Bad: 1
};

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === 'string' && VERDICTS.includes(value as Verdict);
}

export function hasVerdictChanged(
  previous: Verdict | null | undefined,
  current: Verdict
): boolean {
  return previous !== null && previous !== undefined && previous !== current;
}

export function rankVerdict(verdict: Verdict): number {
  return verdictRank[verdict];
}

export function compareVerdictsForDashboard(
  left: Verdict,
  right: Verdict
): number {
  return rankVerdict(right) - rankVerdict(left);
}

export function compareVerdicts(left: Verdict, right: Verdict): number {
  return compareVerdictsForDashboard(left, right);
}

export function worstVerdict(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.length === 0) {
    throw new Error('At least one verdict is required.');
  }

  return verdicts.reduce((worst, verdict) =>
    rankVerdict(verdict) < rankVerdict(worst) ? verdict : worst
  );
}
