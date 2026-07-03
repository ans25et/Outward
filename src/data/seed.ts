import type { ActivityCategory, ContextTag, EffortTier, ReflectionKey } from '../types';

export const ACTIVITY_OPTIONS: { id: ActivityCategory; label: string }[] = [
  { id: 'got-out-of-bed', label: 'Got out of bed' },
  { id: 'walk', label: 'Went for a walk' },
  { id: 'cafe', label: 'Sat at a cafe' },
  { id: 'gym', label: 'Went to the gym' },
  { id: 'errand', label: 'Ran an errand' },
  { id: 'drive', label: 'Drove somewhere' },
  { id: 'library', label: 'Visited a library' },
  { id: 'park', label: 'Went to a park' },
  { id: 'greeted-someone', label: 'Said hi or good morning' },
  { id: 'small-talk', label: 'Had a small conversation' },
  { id: 'new-friend', label: 'Made a new friend or connection' },
  { id: 'tiny-step', label: 'Took a tiny step' },
  { id: 'other', label: 'Something else' },
];

export const CONTEXT_TAG_OPTIONS: ContextTag[] = [
  'quiet',
  'crowded',
  'solo',
  'social',
  'stranger',
  'familiar',
  'morning',
  'evening',
  'quick',
  'structured',
  'outdoors',
  'indoors',
];

export const REFLECTION_PROMPTS: { key: ReflectionKey; prompt: string }[] = [
  { key: 'whyGotUpToday', prompt: 'Why did you get up from bed today?' },
  { key: 'reasonToGetUpTomorrow', prompt: 'What could be one reason to get out of bed tomorrow?' },
  { key: 'easierThanExpected', prompt: 'What made this easier than expected?' },
  { key: 'almostStoppedMe', prompt: 'What almost stopped you?' },
  { key: 'tryDifferently', prompt: 'Would you try this again differently?' },
  { key: 'learnedAboutThem', prompt: 'What did you learn about them?' },
  { key: 'sharedAboutMe', prompt: 'What did they learn about you?' },
];

export const LOW_ENERGY_IDEAS: {
  id: string;
  title: string;
  reason: string;
  category: ActivityCategory;
  effortTier: EffortTier;
  contextTags: ContextTag[];
}[] = [
  {
    id: 'out-of-bed',
    title: 'Get out of bed and sit up',
    reason: 'Getting up from bed is already the first action. It counts, even if that is all you do next.',
    category: 'got-out-of-bed',
    effortTier: 'tiny',
    contextTags: ['quick', 'indoors'],
  },
  {
    id: 'mailbox',
    title: 'Walk to the mailbox',
    reason: 'A tiny outing with a clear end point can lower the starting resistance.',
    category: 'tiny-step',
    effortTier: 'tiny',
    contextTags: ['quick', 'outdoors'],
  },
  {
    id: 'car',
    title: 'Sit in the car for a minute',
    reason: 'Sometimes pausing in the car is enough to make the next step feel possible.',
    category: 'drive',
    effortTier: 'partial',
    contextTags: ['solo', 'quick'],
  },
  {
    id: 'doorstep',
    title: 'Step outside for one minute',
    reason: 'One minute counts. It is enough to mark the day as active.',
    category: 'tiny-step',
    effortTier: 'outside',
    contextTags: ['quick', 'outdoors'],
  },
  {
    id: 'say-hi',
    title: 'Say hi to one person',
    reason: 'A tiny human interaction still counts. A hello at the store or a quick good morning is real effort.',
    category: 'greeted-someone',
    effortTier: 'tiny',
    contextTags: ['quick', 'social'],
  },
];
