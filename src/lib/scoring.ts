import type { ActivityLog, EffortTier } from '../types';

const BASE_SCORES: Record<EffortTier, number> = {
  tiny: 1,
  outside: 2,
  partial: 3,
  outing: 4,
};

export function computeEffortScore(log: ActivityLog) {
  return BASE_SCORES[log.effortTier] + (log.triedSomethingNew ? 1 : 0);
}

export function formatEffortLabel(tier: EffortTier) {
  switch (tier) {
    case 'tiny':
      return 'Tiny action';
    case 'outside':
      return 'Outside briefly';
    case 'partial':
      return 'Got there / partial';
    case 'outing':
      return 'Full outing';
    default:
      return 'Effort';
  }
}
