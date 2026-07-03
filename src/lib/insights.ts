import { buildLastNDates, getDateKey } from './date';
import { computeEffortScore } from './scoring';
import type { ActivityLog, ContextTag } from '../types';

type Suggestion = {
  id: string;
  title: string;
  reason: string;
};

const SOCIAL_CATEGORIES = new Set(['greeted-someone', 'small-talk', 'new-friend']);
const HELP_CATEGORIES = new Set(['asked-for-help', 'reached-out', 'made-appointment']);

function isSocialLog(log: ActivityLog) {
  return SOCIAL_CATEGORIES.has(log.category);
}

function isHelpLog(log: ActivityLog) {
  return HELP_CATEGORIES.has(log.category);
}

function countTags(logs: ActivityLog[], predicate: (log: ActivityLog) => boolean) {
  const counts = new Map<ContextTag, number>();

  logs.forEach((log) => {
    if (!predicate(log)) {
      return;
    }

    log.contextTags.forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });

  return counts;
}

function topTags(counts: Map<ContextTag, number>) {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .filter(([, count]) => count > 0)
    .map(([tag]) => tag);
}

export function derivePreferences(logs: ActivityLog[]) {
  const likedCounts = countTags(logs, (log) => log.rating === 'liked');
  const dislikedCounts = countTags(logs, (log) => log.rating !== 'liked');

  return {
    favoriteContexts: topTags(likedCounts).slice(0, 4),
    avoidContexts: topTags(dislikedCounts)
      .filter((tag) => (dislikedCounts.get(tag) ?? 0) >= 2)
      .slice(0, 4),
  };
}

export function buildHomeSummary(logs: ActivityLog[]) {
  const todayKey = getDateKey(new Date());
  const lastSevenDays = new Set(buildLastNDates(7).map((date) => getDateKey(date)));

  const todayScore = logs
    .filter((log) => getDateKey(log.createdAt) === todayKey)
    .reduce((sum, log) => sum + computeEffortScore(log), 0);

  const weekScore = logs
    .filter((log) => lastSevenDays.has(getDateKey(log.createdAt)))
    .reduce((sum, log) => sum + computeEffortScore(log), 0);

  const uniqueDays = [...new Set(logs.map((log) => getDateKey(log.createdAt)))].sort().reverse();

  let consistencyDays = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (const day of uniqueDays) {
    if (getDateKey(cursor) !== day) {
      break;
    }
    consistencyDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    consistencyDays,
    todayScore,
    totalLogs: logs.length,
    weekScore,
  };
}

export function buildWeeklyTrend(logs: ActivityLog[]) {
  const scoresByDay = logs.reduce<Record<string, number>>((accumulator, log) => {
    const key = getDateKey(log.createdAt);
    accumulator[key] = (accumulator[key] ?? 0) + computeEffortScore(log);
    return accumulator;
  }, {});

  const dates = buildLastNDates(7);
  const maxScore = Math.max(
    1,
    ...dates.map((date) => scoresByDay[getDateKey(date)] ?? 0)
  );

  return dates.map((date) => {
    const score = scoresByDay[getDateKey(date)] ?? 0;

    return {
      date: getDateKey(date),
      normalizedHeight: (score / maxScore) * 100,
      score,
      shortLabel: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2),
    };
  });
}

export function buildSuggestions(logs: ActivityLog[]): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const preferences = derivePreferences(logs);
  const likedLogs = logs.filter((log) => log.rating === 'liked');
  const neutralLogs = logs.filter((log) => log.rating === 'neutral');
  const partialLogs = logs.filter((log) => log.effortTier === 'partial');
  const socialLogs = logs.filter(isSocialLog);
  const helpLogs = logs.filter(isHelpLog);

  const repeatableLog = likedLogs[0];
  if (repeatableLog) {
    suggestions.push({
      id: 'repeat-liked',
      title: `Try "${repeatableLog.title}" again`,
      reason: 'You rated this positively before, so it may be a steady option when you want something familiar.',
    });
  }

  if (preferences.favoriteContexts.includes('morning')) {
    suggestions.push({
      id: 'morning-window',
      title: 'Plan your next outing earlier in the day',
      reason: 'Morning showed up in your positive logs more often than other time windows.',
    });
  }

  if (preferences.avoidContexts.includes('crowded')) {
    suggestions.push({
      id: 'quiet-place',
      title: 'Try a quieter destination',
      reason: 'Crowded settings often looked draining in your notes, so a library, park, or off-peak cafe may fit better.',
    });
  }

  if (partialLogs.length > 0) {
    suggestions.push({
      id: 'partial-credit',
      title: 'Use a drive-by outing as a starting point',
      reason: 'You have already logged getting there. Repeating that partial step can make the full outing feel more reachable.',
    });
  }

  if (preferences.favoriteContexts.includes('solo')) {
    suggestions.push({
      id: 'solo-repeat',
      title: 'Keep the next activity solo-friendly',
      reason: 'Solo settings seem easier for you right now, which can make it simpler to get out the door.',
    });
  }

  if (socialLogs.length > 0) {
    suggestions.push({
      id: 'social-momentum',
      title: 'Try one small human interaction again',
      reason: 'A hello, good morning, or short check-in still counts as outward effort and can make the day feel less isolated.',
    });
  }

  if (likedLogs.some((log) => log.category === 'greeted-someone' || log.category === 'small-talk')) {
    suggestions.push({
      id: 'social-repeat',
      title: 'Repeat a light conversation',
      reason: 'Brief interactions seem to be workable for you, so a cashier chat or greeting someone nearby may be a gentle next step.',
    });
  }

  if (helpLogs.length > 0) {
    suggestions.push({
      id: 'help-repeat',
      title: 'Ask for support one more time',
      reason: 'Reaching out is part of recovery too. A short text, check-in, or appointment still counts as progress.',
    });
  }

  if (!suggestions.length && neutralLogs[0]) {
    suggestions.push({
      id: 'neutral-adjust',
      title: `Try a smaller version of "${neutralLogs[0].title}"`,
      reason: 'A shorter or quieter version may help you learn whether the activity itself works better with less pressure.',
    });
  }

  if (!suggestions.length) {
    suggestions.push({
      id: 'starter',
      title: 'Start with one tiny action',
      reason: 'A one-minute step outside or a short pause in the car is enough to begin building your own patterns.',
    });
  }

  return suggestions.slice(0, 4);
}

export function getVisibleLogs(logs: ActivityLog[], query: string) {
  if (!query.trim()) {
    return logs;
  }

  const normalizedQuery = query.trim().toLowerCase();

  return logs.filter((log) => {
    const haystacks = [
      log.title,
      log.note,
      log.rating,
      ...log.contextTags,
      ...Object.values(log.reflections),
    ];

    return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
  });
}

export function buildConnectionSummary(logs: ActivityLog[]) {
  const recentKeys = new Set(buildLastNDates(7).map((date) => getDateKey(date)));
  const socialLogs = logs.filter(isSocialLog);
  const weekSocialLogs = socialLogs.filter((log) => recentKeys.has(getDateKey(log.createdAt)));
  const likedSocialLogs = socialLogs.filter((log) => log.rating === 'liked');
  const learnedEntries = socialLogs.filter((log) => log.reflections.learnedAboutThem.trim().length > 0);
  const sharedEntries = socialLogs.filter((log) => log.reflections.sharedAboutMe.trim().length > 0);
  const newFriendLogs = socialLogs.filter((log) => log.category === 'new-friend');
  const greetingCount = socialLogs.filter((log) => log.category === 'greeted-someone').length;
  const conversationCount = socialLogs.filter((log) => log.category === 'small-talk').length;

  let topSocialContext = '';
  const socialTagCounts = countTags(socialLogs, () => true);
  const rankedSocialTags = topTags(socialTagCounts).filter((tag) => tag === 'social' || tag === 'quick' || tag === 'familiar' || tag === 'stranger' || tag === 'morning');
  if (rankedSocialTags.length > 0) {
    topSocialContext = rankedSocialTags[0];
  }

  const gentleMessage =
    weekSocialLogs.length === 0
      ? 'A single hello still counts. Connection can begin very small.'
      : weekSocialLogs.length === 1
        ? 'You reached outward once this week. That still matters.'
        : `You logged ${weekSocialLogs.length} moments of connection this week.`;

  return {
    conversationCount,
    gentleMessage,
    greetingCount,
    learnedEntriesCount: learnedEntries.length,
    likedSocialCount: likedSocialLogs.length,
    newFriendCount: newFriendLogs.length,
    sharedEntriesCount: sharedEntries.length,
    topSocialContext,
    weekSocialCount: weekSocialLogs.length,
  };
}

export function buildBedSummary(logs: ActivityLog[]) {
  const recentKeys = new Set(buildLastNDates(7).map((date) => getDateKey(date)));
  const bedLogs = logs.filter(
    (log) =>
      log.category === 'got-out-of-bed' ||
      log.reflections.whyGotUpToday.trim().length > 0 ||
      log.reflections.reasonToGetUpTomorrow.trim().length > 0
  );
  const weekBedLogs = bedLogs.filter((log) => recentKeys.has(getDateKey(log.createdAt)));
  const todayKey = getDateKey(new Date());
  const todayBedLog = bedLogs.find((log) => getDateKey(log.createdAt) === todayKey);
  const reasonsForTomorrow = bedLogs.filter((log) => log.reflections.reasonToGetUpTomorrow.trim().length > 0);

  const todayMessage = todayBedLog?.reflections.whyGotUpToday.trim()
    ? todayBedLog.reflections.whyGotUpToday.trim()
    : todayBedLog
      ? 'You got up today, and that already counts as action.'
      : 'You can count getting out of bed as the first win of the day.';

  const tomorrowMessage =
    reasonsForTomorrow[0]?.reflections.reasonToGetUpTomorrow.trim() ||
    'A shower, sunlight, coffee, music, or a short hello can be enough reason for tomorrow.';

  return {
    hasBedLogToday: Boolean(todayBedLog),
    todayMessage,
    tomorrowMessage,
    weekBedCount: weekBedLogs.length,
  };
}

export function buildRecoveryProof(logs: ActivityLog[]) {
  const recentKeys = new Set(buildLastNDates(7).map((date) => getDateKey(date)));
  const weekLogs = logs.filter((log) => recentKeys.has(getDateKey(log.createdAt)));
  const outsideCount = weekLogs.filter((log) => ['outside', 'partial', 'outing'].includes(log.effortTier)).length;
  const bedCount = weekLogs.filter((log) => log.category === 'got-out-of-bed').length;
  const socialCount = weekLogs.filter(isSocialLog).length;
  const helpCount = weekLogs.filter(isHelpLog).length;
  const partialCount = weekLogs.filter((log) => log.effortTier === 'partial').length;

  const proofs: string[] = [];

  if (bedCount > 0) {
    proofs.push(`You got out of bed ${bedCount} time${bedCount === 1 ? '' : 's'} this week.`);
  }
  if (outsideCount > 0) {
    proofs.push(`You moved outward ${outsideCount} time${outsideCount === 1 ? '' : 's'} this week.`);
  }
  if (socialCount > 0) {
    proofs.push(`You made ${socialCount} human connection${socialCount === 1 ? '' : 's'} this week.`);
  }
  if (helpCount > 0) {
    proofs.push(`You reached for support ${helpCount} time${helpCount === 1 ? '' : 's'} this week.`);
  }
  if (partialCount > 0) {
    proofs.push(`Even partial attempts happened ${partialCount} time${partialCount === 1 ? '' : 's'} and still counted.`);
  }
  if (proofs.length === 0) {
    proofs.push('Recovery evidence can start very small. Getting out of bed, saying hi, or texting one person all count.');
  }

  return {
    bedCount,
    helpCount,
    outsideCount,
    partialCount,
    proofs: proofs.slice(0, 5),
    socialCount,
    title: proofs.length > 1 ? 'Proof You’re Improving' : 'Small signs still count',
  };
}
