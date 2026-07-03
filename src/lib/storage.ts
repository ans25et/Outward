import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppData, Reflections } from '../types';

export const STORAGE_KEY = 'outward.v1.app-data';

const DEFAULT_DATA: AppData = {
  hasOnboarded: false,
  logs: [],
  settings: {
    locale: 'US',
    showConsistency: true,
    tone: 'gentle',
  },
};

export function emptyReflections(): Reflections {
  return {
    whyGotUpToday: '',
    reasonToGetUpTomorrow: '',
    whoDidYouAsk: '',
    howDidTheyHelp: '',
    easierThanExpected: '',
    almostStoppedMe: '',
    tryDifferently: '',
    learnedAboutThem: '',
    sharedAboutMe: '',
  };
}

export async function loadAppData(): Promise<AppData> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_DATA;
  }

  const parsed = JSON.parse(raw) as Partial<AppData>;

  return {
    hasOnboarded: parsed.hasOnboarded ?? DEFAULT_DATA.hasOnboarded,
    logs: (parsed.logs ?? DEFAULT_DATA.logs).map((log) => ({
      ...log,
      reflections: {
        ...emptyReflections(),
        ...(log.reflections ?? {}),
      },
    })),
    settings: {
      ...DEFAULT_DATA.settings,
      ...(parsed.settings ?? {}),
    },
  };
}
