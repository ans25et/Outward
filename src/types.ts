export type AppTab = 'home' | 'history' | 'insights' | 'settings';

export type ActivityCategory =
  | 'got-out-of-bed'
  | 'asked-for-help'
  | 'reached-out'
  | 'made-appointment'
  | 'walk'
  | 'cafe'
  | 'gym'
  | 'errand'
  | 'drive'
  | 'library'
  | 'park'
  | 'greeted-someone'
  | 'small-talk'
  | 'new-friend'
  | 'tiny-step'
  | 'other';

export type EffortTier = 'tiny' | 'outside' | 'partial' | 'outing';

export type LogRating = 'liked' | 'neutral' | 'disliked';

export type ContextTag =
  | 'quiet'
  | 'crowded'
  | 'solo'
  | 'social'
  | 'stranger'
  | 'familiar'
  | 'morning'
  | 'evening'
  | 'quick'
  | 'structured'
  | 'outdoors'
  | 'indoors';

export type ReflectionKey =
  | 'whyGotUpToday'
  | 'reasonToGetUpTomorrow'
  | 'whoDidYouAsk'
  | 'howDidTheyHelp'
  | 'easierThanExpected'
  | 'almostStoppedMe'
  | 'tryDifferently'
  | 'learnedAboutThem'
  | 'sharedAboutMe';

export type Reflections = Record<ReflectionKey, string>;

export type DestinationStatus = 'at-home' | 'outside-only' | 'did-not-go-in' | 'went-in';

export type ActivityLog = {
  id: string;
  createdAt: string;
  category: ActivityCategory;
  title: string;
  effortTier: EffortTier;
  destinationStatus: DestinationStatus;
  triedSomethingNew: boolean;
  rating: LogRating;
  contextTags: ContextTag[];
  note: string;
  reflections: Reflections;
};

export type ActivityDraft = {
  category: ActivityCategory;
  title: string;
  effortTier: EffortTier;
  destinationStatus: DestinationStatus;
  triedSomethingNew: boolean;
  rating: LogRating;
  contextTags: ContextTag[];
  note: string;
  reflections: Reflections;
};

export type UserSettings = {
  tone: EffortTone;
  showConsistency: boolean;
  locale: 'US';
};

export type EffortTone = 'gentle' | 'steady';

export type AppData = {
  hasOnboarded: boolean;
  logs: ActivityLog[];
  settings: UserSettings;
};
