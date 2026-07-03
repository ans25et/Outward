import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBedSummary, buildConnectionSummary, buildHomeSummary, buildRecoveryProof, buildSuggestions, derivePreferences } from '../src/lib/insights';
import { computeEffortScore } from '../src/lib/scoring';
import type { ActivityLog } from '../src/types';

function buildLog(overrides: Partial<ActivityLog> = {}): ActivityLog {
  return {
    id: overrides.id ?? `log-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    category: overrides.category ?? 'walk',
    title: overrides.title ?? 'Went for a walk',
    effortTier: overrides.effortTier ?? 'outside',
    destinationStatus: overrides.destinationStatus ?? 'outside-only',
    triedSomethingNew: overrides.triedSomethingNew ?? false,
    rating: overrides.rating ?? 'neutral',
    contextTags: overrides.contextTags ?? [],
    note: overrides.note ?? '',
    reflections: overrides.reflections ?? {
      whyGotUpToday: '',
      reasonToGetUpTomorrow: '',
      whoDidYouAsk: '',
      howDidTheyHelp: '',
      easierThanExpected: '',
      almostStoppedMe: '',
      tryDifferently: '',
      learnedAboutThem: '',
      sharedAboutMe: '',
    },
  };
}

test('computeEffortScore rewards effort tier and novelty bonus', () => {
  const log = buildLog({ effortTier: 'partial', triedSomethingNew: true });
  assert.equal(computeEffortScore(log), 4);
});

test('derivePreferences favors repeated liked contexts and repeated difficult contexts', () => {
  const logs = [
    buildLog({ rating: 'liked', contextTags: ['quiet', 'solo', 'morning'] }),
    buildLog({ rating: 'liked', contextTags: ['quiet', 'morning'] }),
    buildLog({ rating: 'neutral', contextTags: ['crowded'] }),
    buildLog({ rating: 'disliked', contextTags: ['crowded', 'evening'] }),
  ];

  const preferences = derivePreferences(logs);

  assert.deepEqual(preferences.favoriteContexts.slice(0, 2), ['quiet', 'morning']);
  assert.equal(preferences.avoidContexts[0], 'crowded');
});

test('buildSuggestions steers away from crowded contexts and preserves credit for partial outings', () => {
  const logs = [
    buildLog({ title: 'Library visit', rating: 'liked', contextTags: ['quiet', 'solo', 'morning'] }),
    buildLog({ title: 'Cafe attempt', rating: 'disliked', contextTags: ['crowded'] }),
    buildLog({ title: 'Busy grocery run', rating: 'neutral', contextTags: ['crowded', 'evening'] }),
    buildLog({ title: 'Sat in the car', effortTier: 'partial', rating: 'neutral' }),
  ];

  const suggestions = buildSuggestions(logs);
  const suggestionCopy = suggestions.map((item) => `${item.title} ${item.reason}`).join(' ');

  assert.match(suggestionCopy, /quieter destination/i);
  assert.match(suggestionCopy, /partial step|getting there/i);
});

test('buildHomeSummary counts today and consecutive days with effort', () => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const logs = [
    buildLog({ createdAt: today.toISOString(), effortTier: 'outing' }),
    buildLog({ createdAt: yesterday.toISOString(), effortTier: 'tiny' }),
  ];

  const summary = buildHomeSummary(logs);

  assert.equal(summary.todayScore, 4);
  assert.equal(summary.consistencyDays, 2);
});

test('buildSuggestions encourages light social interaction when social effort is present', () => {
  const logs = [
    buildLog({
      category: 'greeted-someone',
      title: 'Said hi in the grocery line',
      effortTier: 'tiny',
      rating: 'liked',
      contextTags: ['quick', 'social'],
    }),
  ];

  const suggestions = buildSuggestions(logs);
  const suggestionCopy = suggestions.map((item) => `${item.title} ${item.reason}`).join(' ');

  assert.match(suggestionCopy, /human interaction|light conversation|hello|good morning/i);
});

test('buildConnectionSummary counts weekly social effort and reflection depth', () => {
  const logs = [
    buildLog({
      category: 'greeted-someone',
      title: 'Said hi to the cashier',
      effortTier: 'tiny',
      rating: 'liked',
      contextTags: ['quick', 'social', 'morning'],
      reflections: {
        whyGotUpToday: '',
        reasonToGetUpTomorrow: '',
        whoDidYouAsk: '',
        howDidTheyHelp: '',
        easierThanExpected: '',
        almostStoppedMe: '',
        tryDifferently: '',
        learnedAboutThem: 'They just started working there.',
        sharedAboutMe: 'I said I was picking up breakfast.',
      },
    }),
    buildLog({
      category: 'small-talk',
      title: 'Talked in line',
      effortTier: 'outside',
      rating: 'neutral',
      contextTags: ['social', 'stranger'],
    }),
  ];

  const summary = buildConnectionSummary(logs);

  assert.equal(summary.weekSocialCount, 2);
  assert.equal(summary.greetingCount, 1);
  assert.equal(summary.conversationCount, 1);
  assert.equal(summary.learnedEntriesCount, 1);
  assert.equal(summary.sharedEntriesCount, 1);
});

test('buildBedSummary surfaces today and tomorrow bed-to-action reasons', () => {
  const logs = [
    buildLog({
      category: 'got-out-of-bed',
      title: 'Got out of bed',
      effortTier: 'tiny',
      reflections: {
        whyGotUpToday: 'I wanted coffee and sunlight.',
        reasonToGetUpTomorrow: 'I want to take a short walk.',
        whoDidYouAsk: '',
        howDidTheyHelp: '',
        easierThanExpected: '',
        almostStoppedMe: '',
        tryDifferently: '',
        learnedAboutThem: '',
        sharedAboutMe: '',
      },
    }),
  ];

  const summary = buildBedSummary(logs);

  assert.equal(summary.hasBedLogToday, true);
  assert.equal(summary.weekBedCount, 1);
  assert.match(summary.todayMessage, /coffee and sunlight/i);
  assert.match(summary.tomorrowMessage, /short walk/i);
});

test('buildRecoveryProof turns logs into plain-language evidence of progress', () => {
  const logs = [
    buildLog({ category: 'got-out-of-bed', title: 'Got out of bed', effortTier: 'tiny' }),
    buildLog({ category: 'reached-out', title: 'Texted my sister', effortTier: 'tiny' }),
    buildLog({ category: 'greeted-someone', title: 'Said hi in line', effortTier: 'tiny' }),
    buildLog({ category: 'errand', title: 'Drove to the store', effortTier: 'partial' }),
  ];

  const proof = buildRecoveryProof(logs);
  const copy = proof.proofs.join(' ');

  assert.match(copy, /got out of bed/i);
  assert.match(copy, /reached for support/i);
  assert.match(copy, /human connection/i);
  assert.match(copy, /partial attempts/i);
});
