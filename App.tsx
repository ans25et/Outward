import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  ACTIVITY_OPTIONS,
  CONTEXT_TAG_OPTIONS,
  LOW_ENERGY_IDEAS,
  REFLECTION_PROMPTS,
} from './src/data/seed';
import { emptyReflections, loadAppData, STORAGE_KEY } from './src/lib/storage';
import {
  buildBedSummary,
  buildHomeSummary,
  buildConnectionSummary,
  buildRecoveryProof,
  buildSuggestions,
  buildWeeklyTrend,
  derivePreferences,
  getVisibleLogs,
} from './src/lib/insights';
import { computeEffortScore, formatEffortLabel } from './src/lib/scoring';
import type {
  ActivityCategory,
  ActivityDraft,
  ActivityLog,
  AppTab,
  ContextTag,
  EffortTier,
  EffortTone,
  LogRating,
  ReflectionKey,
  UserSettings,
} from './src/types';

const TAB_LABELS: Record<AppTab, string> = {
  home: 'Home',
  history: 'History',
  insights: 'Insights',
  settings: 'Settings',
};

const DEFAULT_SETTINGS: UserSettings = {
  tone: 'gentle',
  showConsistency: true,
  locale: 'US',
};

const DEFAULT_DRAFT: ActivityDraft = {
  category: 'walk',
  title: 'Went for a walk',
  effortTier: 'outside',
  destinationStatus: 'outside-only',
  triedSomethingNew: false,
  rating: 'neutral',
  contextTags: [],
  note: '',
  reflections: emptyReflections(),
};

function buildDraft(log?: ActivityLog): ActivityDraft {
  if (!log) {
    return {
      ...DEFAULT_DRAFT,
      reflections: emptyReflections(),
      contextTags: [],
    };
  }

  return {
    category: log.category,
    title: log.title,
    effortTier: log.effortTier,
    destinationStatus: log.destinationStatus,
    triedSomethingNew: log.triedSomethingNew,
    rating: log.rating,
    contextTags: [...log.contextTags],
    note: log.note,
    reflections: {
      whyGotUpToday: log.reflections.whyGotUpToday,
      reasonToGetUpTomorrow: log.reflections.reasonToGetUpTomorrow,
      whoDidYouAsk: log.reflections.whoDidYouAsk,
      howDidTheyHelp: log.reflections.howDidTheyHelp,
      easierThanExpected: log.reflections.easierThanExpected,
      almostStoppedMe: log.reflections.almostStoppedMe,
      tryDifferently: log.reflections.tryDifferently,
      learnedAboutThem: log.reflections.learnedAboutThem,
      sharedAboutMe: log.reflections.sharedAboutMe,
    },
  };
}

function toDestinationStatus(effortTier: EffortTier): ActivityLog['destinationStatus'] {
  switch (effortTier) {
    case 'tiny':
      return 'at-home';
    case 'outside':
      return 'outside-only';
    case 'partial':
      return 'did-not-go-in';
    case 'outing':
      return 'went-in';
    default:
      return 'outside-only';
  }
}

function buildActivityLog(draft: ActivityDraft, existingId?: string): ActivityLog {
  return {
    id: existingId ?? `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    category: draft.category,
    title: draft.title.trim() || ACTIVITY_OPTIONS.find((option) => option.id === draft.category)?.label || 'Effort log',
    effortTier: draft.effortTier,
    destinationStatus: draft.destinationStatus,
    triedSomethingNew: draft.triedSomethingNew,
    rating: draft.rating,
    contextTags: draft.contextTags,
    note: draft.note.trim(),
    reflections: {
      whyGotUpToday: draft.reflections.whyGotUpToday.trim(),
      reasonToGetUpTomorrow: draft.reflections.reasonToGetUpTomorrow.trim(),
      whoDidYouAsk: draft.reflections.whoDidYouAsk.trim(),
      howDidTheyHelp: draft.reflections.howDidTheyHelp.trim(),
      easierThanExpected: draft.reflections.easierThanExpected.trim(),
      almostStoppedMe: draft.reflections.almostStoppedMe.trim(),
      tryDifferently: draft.reflections.tryDifferently.trim(),
      learnedAboutThem: draft.reflections.learnedAboutThem.trim(),
      sharedAboutMe: draft.reflections.sharedAboutMe.trim(),
    },
  };
}

function describeRating(rating: LogRating) {
  if (rating === 'liked') {
    return 'Liked';
  }
  if (rating === 'disliked') {
    return "Didn't like";
  }
  return 'Neutral';
}

function describeTone(tone: EffortTone) {
  return tone === 'steady' ? 'Steady' : 'Gentle';
}

function capitalize(tag: string) {
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

function getToneCopy(tone: EffortTone, hasLogs: boolean) {
  if (!hasLogs) {
    return tone === 'steady'
      ? 'Small steps still count. You can add one effort log whenever you are ready.'
      : 'A slow day is still a day. One small action is enough to begin.';
  }

  return tone === 'steady'
    ? 'Momentum grows from repetition, not perfection.'
    : 'You are allowed to count every bit of effort, even if it felt incomplete.';
}

function useOutwardStore() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const data = await loadAppData();
        if (!active) {
          return;
        }

        setLogs(data.logs);
        setSettings(data.settings);
        setHasOnboarded(data.hasOnboarded);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load your private data.');
        }
      } finally {
        if (active) {
          setHydrated(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = setTimeout(() => {
      const snapshot = JSON.stringify({
        hasOnboarded,
        logs,
        settings,
      });

      void AsyncStorage.setItem(STORAGE_KEY, snapshot);
    }, 120);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [hydrated, hasOnboarded, logs, settings]);

  const saveLog = (draft: ActivityDraft, editingId?: string) => {
    startTransition(() => {
      setLogs((currentLogs) => {
        const nextLog = buildActivityLog(
          {
            ...draft,
            destinationStatus: toDestinationStatus(draft.effortTier),
          },
          editingId
        );

        if (!editingId) {
          return [nextLog, ...currentLogs];
        }

        return currentLogs.map((log) => {
          if (log.id !== editingId) {
            return log;
          }

          return {
            ...nextLog,
            createdAt: log.createdAt,
          };
        });
      });
    });
  };

  const deleteLog = (id: string) => {
    startTransition(() => {
      setLogs((currentLogs) => currentLogs.filter((log) => log.id !== id));
    });
  };

  const completeOnboarding = () => {
    setHasOnboarded(true);
  };

  const updateSettings = (nextSettings: Partial<UserSettings>) => {
    startTransition(() => {
      setSettings((current) => ({
        ...current,
        ...nextSettings,
      }));
    });
  };

  const resetAllData = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setLogs([]);
    setSettings(DEFAULT_SETTINGS);
    setHasOnboarded(false);
  };

  return {
    deleteLog,
    error,
    hasOnboarded,
    hydrated,
    logs,
    resetAllData,
    saveLog,
    settings,
    completeOnboarding,
    updateSettings,
  };
}

function AppShell() {
  const store = useOutwardStore();
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActivityDraft>(DEFAULT_DRAFT);
  const [historyQuery, setHistoryQuery] = useState('');
  const deferredHistoryQuery = useDeferredValue(historyQuery);

  const preferences = useMemo(() => derivePreferences(store.logs), [store.logs]);
  const bedSummary = useMemo(() => buildBedSummary(store.logs), [store.logs]);
  const connectionSummary = useMemo(() => buildConnectionSummary(store.logs), [store.logs]);
  const recoveryProof = useMemo(() => buildRecoveryProof(store.logs), [store.logs]);
  const summary = useMemo(() => buildHomeSummary(store.logs), [store.logs]);
  const weeklyTrend = useMemo(() => buildWeeklyTrend(store.logs), [store.logs]);
  const suggestions = useMemo(() => buildSuggestions(store.logs), [store.logs]);
  const visibleLogs = useMemo(
    () => getVisibleLogs(store.logs, deferredHistoryQuery),
    [deferredHistoryQuery, store.logs]
  );

  const openNewLog = (preset?: Partial<ActivityDraft>) => {
    setEditingLogId(null);
    setDraft({
      ...DEFAULT_DRAFT,
      reflections: emptyReflections(),
      ...preset,
      contextTags: preset?.contextTags ? [...preset.contextTags] : [],
    });
    setModalVisible(true);
  };

  const openEditLog = (log: ActivityLog) => {
    setEditingLogId(log.id);
    setDraft(buildDraft(log));
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingLogId(null);
    setDraft(DEFAULT_DRAFT);
  };

  const onSave = () => {
    store.saveLog(draft, editingLogId ?? undefined);
    closeModal();
  };

  const onDelete = (id: string) => {
    Alert.alert('Remove this log?', 'This removes the entry from your private history on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => store.deleteLog(id),
      },
    ]);
  };

  const exportData = async () => {
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Sharing unavailable', 'This device cannot open the share sheet right now.');
        return;
      }

      const uri = `${FileSystem.cacheDirectory}outward-export-${Date.now()}.json`;
      const payload = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          hasOnboarded: store.hasOnboarded,
          logs: store.logs,
          settings: store.settings,
        },
        null,
        2
      );

      await FileSystem.writeAsStringAsync(uri, payload);
      await Sharing.shareAsync(uri, {
        dialogTitle: 'Export Outward data',
        mimeType: 'application/json',
      });
    } catch (exportError) {
      Alert.alert(
        'Export unavailable',
        exportError instanceof Error ? exportError.message : 'Your data could not be exported right now.'
      );
    }
  };

  const confirmReset = () => {
    Alert.alert(
      'Delete all private data?',
      'This clears your activity history and settings from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            void store.resetAllData();
          },
        },
      ]
    );
  };

  if (!store.hydrated) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <View style={styles.loadingWrap}>
          <Text style={styles.eyebrow}>Outward</Text>
          <Text style={styles.loadingTitle}>Loading your private space</Text>
          <Text style={styles.loadingText}>
            Nothing is shared. Outward is preparing your effort log on this device.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!store.hasOnboarded) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.onboardingScroll}>
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>Outward</Text>
            <Text style={styles.heroTitle}>A private recovery companion for depression.</Text>
            <Text style={styles.heroBody}>
              Outward helps you see progress depression tries to hide. Getting out of bed, going outside,
              talking to someone, or asking for help all count here.
            </Text>
            <View style={styles.featureList}>
              <View style={styles.featureItem}>
                <Text style={styles.featureEmoji}>•</Text>
                <Text style={styles.featureText}>Track recovery actions instead of mood scores.</Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureEmoji}>•</Text>
                <Text style={styles.featureText}>See proof you are improving, even when it does not feel like it.</Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureEmoji}>•</Text>
                <Text style={styles.featureText}>Keep everything private on this device by default.</Text>
              </View>
            </View>
            <View style={styles.safetyCard}>
              <Text style={styles.safetyTitle}>Support boundary</Text>
              <Text style={styles.safetyText}>
                Outward is a companion, not therapy or emergency care. If you are in immediate danger, call
                emergency services. In the U.S., you can also call or text 988.
              </Text>
            </View>
            <Pressable style={styles.primaryButton} onPress={store.completeOnboarding}>
              <Text style={styles.primaryButtonText}>Enter Outward</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.shell}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Outward</Text>
            <Text style={styles.headerTitle}>{TAB_LABELS[activeTab]}</Text>
          </View>
          <Pressable style={styles.headerButton} onPress={() => openNewLog()}>
            <Text style={styles.headerButtonText}>+ Log effort</Text>
          </Pressable>
        </View>

        {store.error ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{store.error}</Text>
          </View>
        ) : null}

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {activeTab === 'home' ? (
            <HomeTab
              onQuickLog={openNewLog}
              preferences={preferences}
              connectionSummary={connectionSummary}
              bedSummary={bedSummary}
              recoveryProof={recoveryProof}
              settings={store.settings}
              suggestions={suggestions}
              summary={summary}
              weeklyTrend={weeklyTrend}
            />
          ) : null}

          {activeTab === 'history' ? (
            <HistoryTab
              logs={visibleLogs}
              onDelete={onDelete}
              onEdit={openEditLog}
              query={historyQuery}
              setQuery={setHistoryQuery}
            />
          ) : null}

          {activeTab === 'insights' ? (
            <InsightsTab
              connectionSummary={connectionSummary}
              logs={store.logs}
              preferences={preferences}
              suggestions={suggestions}
            />
          ) : null}

          {activeTab === 'settings' ? (
            <SettingsTab
              onExport={exportData}
              onReset={confirmReset}
              settings={store.settings}
              updateSettings={store.updateSettings}
            />
          ) : null}
        </ScrollView>

        <View style={styles.tabBar}>
          {(Object.keys(TAB_LABELS) as AppTab[]).map((tab) => {
            const selected = activeTab === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.tabButton, selected ? styles.tabButtonSelected : null]}
              >
                <Text style={[styles.tabButtonText, selected ? styles.tabButtonTextSelected : null]}>
                  {TAB_LABELS[tab]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ActivityModal
        draft={draft}
        editing={Boolean(editingLogId)}
        onChange={setDraft}
        onClose={closeModal}
        onSave={onSave}
        visible={modalVisible}
      />
    </SafeAreaView>
  );
}

function HomeTab({
  bedSummary,
  connectionSummary,
  onQuickLog,
  preferences,
  recoveryProof,
  settings,
  suggestions,
  summary,
  weeklyTrend,
}: {
  bedSummary: ReturnType<typeof buildBedSummary>;
  connectionSummary: ReturnType<typeof buildConnectionSummary>;
  onQuickLog: (preset?: Partial<ActivityDraft>) => void;
  preferences: ReturnType<typeof derivePreferences>;
  recoveryProof: ReturnType<typeof buildRecoveryProof>;
  settings: UserSettings;
  suggestions: ReturnType<typeof buildSuggestions>;
  summary: ReturnType<typeof buildHomeSummary>;
  weeklyTrend: ReturnType<typeof buildWeeklyTrend>;
}) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.gradientCard}>
        <Text style={styles.cardEyebrow}>Recovery Today</Text>
        <Text style={styles.heroMetric}>{summary.todayScore}</Text>
        <Text style={styles.heroMetricLabel}>effort points</Text>
        <Text style={styles.heroSupportCopy}>{getToneCopy(settings.tone, summary.totalLogs > 0)}</Text>
        <View style={styles.metricRow}>
          <View style={styles.metricChip}>
            <Text style={styles.metricChipLabel}>This week</Text>
            <Text style={styles.metricChipValue}>{summary.weekScore}</Text>
          </View>
          <View style={styles.metricChip}>
            <Text style={styles.metricChipLabel}>Consistency</Text>
            <Text style={styles.metricChipValue}>
              {settings.showConsistency ? `${summary.consistencyDays} days` : 'Hidden'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>What Outward Tracks</Text>
          <Text style={styles.sectionHint}>Recovery pillars</Text>
        </View>
        <View style={styles.pillarCard}>
          <View style={styles.pillarRow}>
            <View style={styles.pillarChip}>
              <Text style={styles.pillarChipTitle}>I got up</Text>
              <Text style={styles.pillarChipBody}>bed, shower, first step</Text>
            </View>
            <View style={styles.pillarChip}>
              <Text style={styles.pillarChipTitle}>I went outward</Text>
              <Text style={styles.pillarChipBody}>outside, drive, outing</Text>
            </View>
          </View>
          <View style={styles.pillarRow}>
            <View style={styles.pillarChip}>
              <Text style={styles.pillarChipTitle}>I connected</Text>
              <Text style={styles.pillarChipBody}>hi, small talk, new friend</Text>
            </View>
            <View style={styles.pillarChip}>
              <Text style={styles.pillarChipTitle}>I asked for help</Text>
              <Text style={styles.pillarChipBody}>text, support, appointment</Text>
            </View>
          </View>
        </View>
      </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recovery actions</Text>
            <Text style={styles.sectionHint}>Low-friction logging</Text>
          </View>
          <View style={styles.quickGrid}>
            {[
              { label: 'Got out of bed', tier: 'tiny' as EffortTier, category: 'got-out-of-bed' as ActivityCategory },
              { label: 'Reached out', tier: 'tiny' as EffortTier, category: 'reached-out' as ActivityCategory },
              { label: 'Tiny action', tier: 'tiny' as EffortTier, category: 'tiny-step' as ActivityCategory },
              { label: 'Step outside', tier: 'outside' as EffortTier, category: 'walk' as ActivityCategory },
              { label: 'Drove there', tier: 'partial' as EffortTier, category: 'errand' as ActivityCategory },
              { label: 'Said hi', tier: 'tiny' as EffortTier, category: 'greeted-someone' as ActivityCategory },
              { label: 'Asked for help', tier: 'outside' as EffortTier, category: 'asked-for-help' as ActivityCategory },
              { label: 'Small talk', tier: 'outside' as EffortTier, category: 'small-talk' as ActivityCategory },
            ].map((item) => (
              <Pressable
                key={item.label}
                style={styles.quickCard}
                onPress={() =>
                onQuickLog({
                  category: item.category,
                  effortTier: item.tier,
                  title: item.label,
                })
              }
            >
              <Text style={styles.quickCardTitle}>{item.label}</Text>
              <Text style={styles.quickCardText}>{formatEffortLabel(item.tier)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{recoveryProof.title}</Text>
          <Text style={styles.sectionHint}>Visible recovery</Text>
        </View>
        <View style={styles.proofCard}>
          {recoveryProof.proofs.map((proof) => (
            <View key={proof} style={styles.proofLine}>
              <Text style={styles.proofBullet}>•</Text>
              <Text style={styles.proofText}>{proof}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Weekly trend</Text>
          <Text style={styles.sectionHint}>7-day view</Text>
        </View>
        <View style={styles.chartCard}>
          {weeklyTrend.map((day) => (
            <View key={day.date} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { height: `${Math.max(10, day.normalizedHeight)}%` },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{day.shortLabel}</Text>
              <Text style={styles.barValue}>{day.score}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Bed to action</Text>
          <Text style={styles.sectionHint}>First win of the day</Text>
        </View>
        <View style={styles.bedCard}>
          <View style={styles.bedStatRow}>
            <View style={styles.bedStat}>
              <Text style={styles.bedStatValue}>{bedSummary.weekBedCount}</Text>
              <Text style={styles.bedStatLabel}>bed wins this week</Text>
            </View>
            <View style={styles.bedStat}>
              <Text style={styles.bedStatValue}>{bedSummary.hasBedLogToday ? 'Yes' : 'Not yet'}</Text>
              <Text style={styles.bedStatLabel}>up today</Text>
            </View>
          </View>
          <Text style={styles.bedCardTitle}>Why you got up today</Text>
          <Text style={styles.bedCardBody}>{bedSummary.todayMessage}</Text>
          <Text style={styles.bedCardTitle}>One reason for tomorrow</Text>
          <Text style={styles.bedCardBody}>{bedSummary.tomorrowMessage}</Text>
          <Pressable
            style={styles.bedCardButton}
            onPress={() =>
              onQuickLog({
                category: 'got-out-of-bed',
                title: 'Got out of bed',
                effortTier: 'tiny',
                contextTags: ['quick', 'indoors'],
              })
            }
          >
            <Text style={styles.bedCardButtonText}>Log getting out of bed</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Low-Energy Mode</Text>
          <Text style={styles.sectionHint}>Tiny actions count</Text>
        </View>
        <View style={styles.stack}>
          {LOW_ENERGY_IDEAS.map((idea) => (
            <Pressable
              key={idea.id}
              style={styles.listCard}
              onPress={() =>
                onQuickLog({
                  category: idea.category,
                  title: idea.title,
                  effortTier: idea.effortTier,
                  contextTags: idea.contextTags,
                })
              }
            >
              <Text style={styles.listCardTitle}>{idea.title}</Text>
              <Text style={styles.listCardBody}>{idea.reason}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Connection counts too</Text>
          <Text style={styles.sectionHint}>Gentle social effort</Text>
        </View>
        <View style={styles.connectionCard}>
          <View style={styles.connectionStatsRow}>
            <View style={styles.connectionStat}>
              <Text style={styles.connectionStatValue}>{connectionSummary.weekSocialCount}</Text>
              <Text style={styles.connectionStatLabel}>this week</Text>
            </View>
            <View style={styles.connectionStat}>
              <Text style={styles.connectionStatValue}>{connectionSummary.greetingCount}</Text>
              <Text style={styles.connectionStatLabel}>greetings</Text>
            </View>
            <View style={styles.connectionStat}>
              <Text style={styles.connectionStatValue}>{connectionSummary.conversationCount}</Text>
              <Text style={styles.connectionStatLabel}>conversations</Text>
            </View>
          </View>
          <Text style={styles.connectionCardTitle}>Tiny interactions still matter.</Text>
          <Text style={styles.connectionCardBody}>{connectionSummary.gentleMessage}</Text>
          <Text style={styles.connectionCardFoot}>
            Saying hi in line, telling someone good morning, or learning one small thing about a new person all count as outward effort.
          </Text>
          {connectionSummary.topSocialContext ? (
            <View style={styles.connectionTag}>
              <Text style={styles.connectionTagText}>Social pattern: {capitalize(connectionSummary.topSocialContext)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Next gentle steps</Text>
          <Text style={styles.sectionHint}>{preferences.favoriteContexts.length} helpful patterns</Text>
        </View>
        <View style={styles.stack}>
          {suggestions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardTitle}>Your suggestions will grow with your logs.</Text>
              <Text style={styles.emptyCardBody}>
                Rate a few activities and Outward will start reflecting back what seems easier, calmer, or worth repeating.
              </Text>
            </View>
          ) : (
            suggestions.map((suggestion) => (
              <View key={suggestion.id} style={styles.listCard}>
                <Text style={styles.listCardTitle}>{suggestion.title}</Text>
                <Text style={styles.listCardBody}>{suggestion.reason}</Text>
              </View>
            ))
          )}
        </View>
      </View>
    </View>
  );
}

function HistoryTab({
  logs,
  onDelete,
  onEdit,
  query,
  setQuery,
}: {
  logs: ActivityLog[];
  onDelete: (id: string) => void;
  onEdit: (log: ActivityLog) => void;
  query: string;
  setQuery: (value: string) => void;
}) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Private history</Text>
        <Text style={styles.sectionBody}>Search by activity, notes, or context tags. Everything stays on this device.</Text>
        <TextInput
          onChangeText={setQuery}
          placeholder="Search logs"
          placeholderTextColor="#69738d"
          style={styles.searchInput}
          value={query}
        />
      </View>

      <View style={styles.stack}>
        {logs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>No matching effort logs yet.</Text>
            <Text style={styles.emptyCardBody}>When you add activities, this space will help make your progress visible.</Text>
          </View>
        ) : (
          logs.map((log) => (
            <View key={log.id} style={styles.logCard}>
              <View style={styles.logCardHeader}>
                <View>
                  <Text style={styles.logTitle}>{log.title}</Text>
                  <Text style={styles.logMeta}>
                    {new Date(log.createdAt).toLocaleDateString()} • {formatEffortLabel(log.effortTier)} • {describeRating(log.rating)}
                  </Text>
                </View>
                <Text style={styles.logScore}>+{computeEffortScore(log)}</Text>
              </View>
              {log.note ? <Text style={styles.logNote}>{log.note}</Text> : null}
              <View style={styles.tagWrap}>
                {log.contextTags.map((tag) => (
                  <View key={tag} style={styles.tagPill}>
                    <Text style={styles.tagPillText}>{capitalize(tag)}</Text>
                  </View>
                ))}
                {log.triedSomethingNew ? (
                  <View style={styles.tagPill}>
                    <Text style={styles.tagPillText}>New</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.logActions}>
                <Pressable onPress={() => onEdit(log)} style={styles.ghostButton}>
                  <Text style={styles.ghostButtonText}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => onDelete(log.id)} style={styles.ghostButton}>
                  <Text style={[styles.ghostButtonText, styles.ghostDangerText]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function InsightsTab({
  connectionSummary,
  logs,
  preferences,
  suggestions,
}: {
  connectionSummary: ReturnType<typeof buildConnectionSummary>;
  logs: ActivityLog[];
  preferences: ReturnType<typeof derivePreferences>;
  suggestions: ReturnType<typeof buildSuggestions>;
}) {
  const totalScore = logs.reduce((sum, log) => sum + computeEffortScore(log), 0);
  const recoveryProof = buildRecoveryProof(logs);

  return (
    <View style={styles.tabContent}>
      <View style={styles.metricPanel}>
        <View style={styles.metricPanelItem}>
          <Text style={styles.metricPanelValue}>{logs.length}</Text>
          <Text style={styles.metricPanelLabel}>efforts logged</Text>
        </View>
        <View style={styles.metricPanelItem}>
          <Text style={styles.metricPanelValue}>{totalScore}</Text>
          <Text style={styles.metricPanelLabel}>total effort points</Text>
        </View>
        <View style={styles.metricPanelItem}>
          <Text style={styles.metricPanelValue}>{preferences.favoriteContexts.length}</Text>
          <Text style={styles.metricPanelLabel}>positive context tags</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Proof you’re improving</Text>
        <View style={styles.stack}>
          {recoveryProof.proofs.map((proof) => (
            <View key={proof} style={styles.listCard}>
              <Text style={styles.listCardBody}>{proof}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection insights</Text>
        <View style={styles.connectionInsightGrid}>
          <View style={styles.connectionInsightCard}>
            <Text style={styles.connectionInsightValue}>{connectionSummary.weekSocialCount}</Text>
            <Text style={styles.connectionInsightLabel}>social moments this week</Text>
          </View>
          <View style={styles.connectionInsightCard}>
            <Text style={styles.connectionInsightValue}>{connectionSummary.likedSocialCount}</Text>
            <Text style={styles.connectionInsightLabel}>felt good afterward</Text>
          </View>
          <View style={styles.connectionInsightCard}>
            <Text style={styles.connectionInsightValue}>{connectionSummary.learnedEntriesCount}</Text>
            <Text style={styles.connectionInsightLabel}>times you learned about them</Text>
          </View>
          <View style={styles.connectionInsightCard}>
            <Text style={styles.connectionInsightValue}>{connectionSummary.sharedEntriesCount}</Text>
            <Text style={styles.connectionInsightLabel}>times you shared about yourself</Text>
          </View>
        </View>
        <View style={styles.listCard}>
          <Text style={styles.listCardTitle}>What this means</Text>
          <Text style={styles.listCardBody}>{connectionSummary.gentleMessage}</Text>
          <Text style={styles.connectionInsightNote}>
            {connectionSummary.newFriendCount > 0
              ? `You logged ${connectionSummary.newFriendCount} new connection${connectionSummary.newFriendCount === 1 ? '' : 's'} so far.`
              : 'Even brief greetings count here. A new friendship does not have to start big.'}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What seems easier</Text>
        <View style={styles.tagWrap}>
          {preferences.favoriteContexts.length === 0 ? (
            <Text style={styles.sectionBody}>Log a few rated activities and Outward will start noticing your easier contexts.</Text>
          ) : (
            preferences.favoriteContexts.map((tag) => (
              <View key={tag} style={styles.contextCard}>
                <Text style={styles.contextCardTitle}>{capitalize(tag)}</Text>
                <Text style={styles.contextCardBody}>A context you have rated positively more than once.</Text>
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Watch-outs</Text>
        <View style={styles.tagWrap}>
          {preferences.avoidContexts.length === 0 ? (
            <Text style={styles.sectionBody}>Nothing consistent to avoid yet. Outward will keep adjusting as you log more attempts.</Text>
          ) : (
            preferences.avoidContexts.map((tag) => (
              <View key={tag} style={styles.contextCardMuted}>
                <Text style={styles.contextCardTitle}>{capitalize(tag)}</Text>
                <Text style={styles.contextCardBody}>This context often showed up in neutral or difficult outings.</Text>
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Try next</Text>
        <View style={styles.stack}>
          {suggestions.map((suggestion) => (
            <View key={suggestion.id} style={styles.listCard}>
              <Text style={styles.listCardTitle}>{suggestion.title}</Text>
              <Text style={styles.listCardBody}>{suggestion.reason}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function SettingsTab({
  onExport,
  onReset,
  settings,
  updateSettings,
}: {
  onExport: () => void;
  onReset: () => void;
  settings: UserSettings;
  updateSettings: (nextSettings: Partial<UserSettings>) => void;
}) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy</Text>
        <Text style={styles.sectionBody}>
          Outward keeps your logs on this device only. There are no profiles, no comparisons, and no social feed in this MVP.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Display style</Text>
        <View style={styles.inlineOptions}>
          {(['gentle', 'steady'] as EffortTone[]).map((tone) => (
            <Pressable
              key={tone}
              onPress={() => updateSettings({ tone })}
              style={[styles.inlineOption, settings.tone === tone ? styles.inlineOptionSelected : null]}
            >
              <Text style={[styles.inlineOptionText, settings.tone === tone ? styles.inlineOptionTextSelected : null]}>
                {describeTone(tone)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() => updateSettings({ showConsistency: !settings.showConsistency })}
          style={styles.toggleRow}
        >
          <View>
            <Text style={styles.toggleTitle}>Show consistency on Home</Text>
            <Text style={styles.toggleBody}>Hide the day-count if you want less visible pressure.</Text>
          </View>
          <View style={[styles.togglePill, settings.showConsistency ? styles.togglePillOn : null]}>
            <View style={[styles.toggleKnob, settings.showConsistency ? styles.toggleKnobOn : null]} />
          </View>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support resources</Text>
        <View style={styles.listCard}>
          <Text style={styles.listCardTitle}>Need more support right now?</Text>
          <Text style={styles.listCardBody}>
            Outward is not emergency care. In the U.S., call or text 988 for the Suicide & Crisis Lifeline. If you are in immediate danger, call emergency services.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data controls</Text>
        <Pressable style={styles.primaryButton} onPress={onExport}>
          <Text style={styles.primaryButtonText}>Export private data</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onReset}>
          <Text style={styles.secondaryButtonText}>Delete all local data</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ActivityModal({
  draft,
  editing,
  onChange,
  onClose,
  onSave,
  visible,
}: {
  draft: ActivityDraft;
  editing: boolean;
  onChange: React.Dispatch<React.SetStateAction<ActivityDraft>>;
  onClose: () => void;
  onSave: () => void;
  visible: boolean;
}) {
  const updateDraft = <Key extends keyof ActivityDraft>(key: Key, value: ActivityDraft[Key]) => {
    onChange((currentDraft) => ({
      ...currentDraft,
      [key]: value,
    }));
  };

  const updateReflection = (key: ReflectionKey, value: string) => {
    onChange((currentDraft) => ({
      ...currentDraft,
      reflections: {
        ...currentDraft.reflections,
        [key]: value,
      },
    }));
  };

  const toggleTag = (tag: ContextTag) => {
    const nextTags = draft.contextTags.includes(tag)
      ? draft.contextTags.filter((item) => item !== tag)
      : [...draft.contextTags, tag];

    updateDraft('contextTags', nextTags);
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalScrim}>
        <View style={styles.modalCard}>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.eyebrow}>{editing ? 'Edit effort' : 'Log effort'}</Text>
                <Text style={styles.modalTitle}>Count what you tried today.</Text>
              </View>
              <Pressable onPress={onClose} style={styles.modalCloseButton}>
                <Text style={styles.modalClose}>Close</Text>
              </Pressable>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Activity</Text>
              <View style={styles.choiceWrap}>
                {ACTIVITY_OPTIONS.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() =>
                      onChange((currentDraft) => ({
                        ...currentDraft,
                        category: option.id,
                        title:
                          !currentDraft.title ||
                          ACTIVITY_OPTIONS.some((item) => item.label === currentDraft.title)
                            ? option.label
                            : currentDraft.title,
                      }))
                    }
                    style={[styles.choiceChip, draft.category === option.id ? styles.choiceChipSelected : null]}
                  >
                    <Text style={[styles.choiceChipText, draft.category === option.id ? styles.choiceChipTextSelected : null]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                onChangeText={(value) => updateDraft('title', value)}
                placeholder="Describe what you did"
                placeholderTextColor="#69738d"
                style={styles.input}
                value={draft.title}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Effort level</Text>
              <View style={styles.choiceWrap}>
                {([
                  ['tiny', 'Tiny action'],
                  ['outside', 'Went outside'],
                  ['partial', 'Got there'],
                  ['outing', 'Went somewhere'],
                ] as [EffortTier, string][]).map(([tier, label]) => (
                  <Pressable
                    key={tier}
                    onPress={() => updateDraft('effortTier', tier)}
                    style={[styles.choiceChip, draft.effortTier === tier ? styles.choiceChipSelected : null]}
                  >
                    <Text style={[styles.choiceChipText, draft.effortTier === tier ? styles.choiceChipTextSelected : null]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>How did it land?</Text>
              <View style={styles.inlineOptions}>
                {([
                  ['liked', 'Liked'],
                  ['neutral', 'Neutral'],
                  ['disliked', "Didn't like"],
                ] as [LogRating, string][]).map(([rating, label]) => (
                  <Pressable
                    key={rating}
                    onPress={() => updateDraft('rating', rating)}
                    style={[styles.inlineOption, draft.rating === rating ? styles.inlineOptionSelected : null]}
                  >
                    <Text style={[styles.inlineOptionText, draft.rating === rating ? styles.inlineOptionTextSelected : null]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formSection}>
              <Pressable
                onPress={() => updateDraft('triedSomethingNew', !draft.triedSomethingNew)}
                style={styles.toggleRow}
              >
                <View>
                  <Text style={styles.toggleTitle}>Tried something new</Text>
                  <Text style={styles.toggleBody}>Add a gentle bonus for stretching beyond routine.</Text>
                </View>
                <View style={[styles.togglePill, draft.triedSomethingNew ? styles.togglePillOn : null]}>
                  <View style={[styles.toggleKnob, draft.triedSomethingNew ? styles.toggleKnobOn : null]} />
                </View>
              </Pressable>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Context tags</Text>
              <View style={styles.choiceWrap}>
                {CONTEXT_TAG_OPTIONS.map((tag) => (
                  <Pressable
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    style={[styles.choiceChip, draft.contextTags.includes(tag) ? styles.choiceChipSelected : null]}
                  >
                    <Text
                      style={[
                        styles.choiceChipText,
                        draft.contextTags.includes(tag) ? styles.choiceChipTextSelected : null,
                      ]}
                    >
                      {capitalize(tag)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Notes</Text>
              <TextInput
                multiline
                onChangeText={(value) => updateDraft('note', value)}
                placeholder="Too crowded, easier in the morning, felt calmer after ten minutes..."
                placeholderTextColor="#69738d"
                style={[styles.input, styles.multilineInput]}
                value={draft.note}
              />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Private reflection</Text>
              {REFLECTION_PROMPTS.map((prompt) => (
                <View key={prompt.key} style={styles.reflectionBlock}>
                  <Text style={styles.reflectionPrompt}>{prompt.prompt}</Text>
                  <TextInput
                    multiline
                    onChangeText={(value) => updateReflection(prompt.key, value)}
                    placeholder="Optional"
                    placeholderTextColor="#69738d"
                    style={[styles.input, styles.multilineInput]}
                    value={draft.reflections[prompt.key]}
                  />
                </View>
              ))}
            </View>

            <Pressable style={styles.primaryButton} onPress={onSave}>
              <Text style={styles.primaryButtonText}>{editing ? 'Save changes' : 'Save effort log'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function App() {
  return <AppShell />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#102033',
    paddingTop: RNStatusBar.currentHeight ?? 0,
  },
  shell: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingTitle: {
    color: '#f2f5fb',
    fontFamily: 'Georgia',
    fontSize: 34,
    marginBottom: 12,
  },
  loadingText: {
    color: '#c6d2e3',
    fontSize: 16,
    lineHeight: 24,
  },
  onboardingScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  heroCard: {
    backgroundColor: '#e8efe2',
    borderRadius: 28,
    padding: 24,
    shadowColor: '#09111c',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  eyebrow: {
    color: '#7c4d2e',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.8,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#17324f',
    fontFamily: 'Georgia',
    fontSize: 38,
    lineHeight: 44,
    marginBottom: 12,
  },
  heroBody: {
    color: '#2d475f',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 22,
  },
  featureList: {
    gap: 12,
    marginBottom: 22,
  },
  featureItem: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  featureEmoji: {
    color: '#7c4d2e',
    fontSize: 18,
    marginRight: 10,
  },
  featureText: {
    color: '#17324f',
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  safetyCard: {
    backgroundColor: '#fff6dc',
    borderColor: '#e9d7a4',
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 20,
    padding: 16,
  },
  safetyTitle: {
    color: '#5d481d',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  safetyText: {
    color: '#5d481d',
    fontSize: 14,
    lineHeight: 21,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1e5b4f',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#f4faf7',
    fontSize: 16,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  headerTitle: {
    color: '#f4f7fb',
    fontFamily: 'Georgia',
    fontSize: 28,
  },
  headerButton: {
    backgroundColor: '#f7bb6e',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerButtonText: {
    color: '#4b2d10',
    fontSize: 14,
    fontWeight: '700',
  },
  banner: {
    backgroundColor: '#a13939',
    borderRadius: 18,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
  },
  bannerText: {
    color: '#fff4f4',
    fontSize: 13,
  },
  scrollContent: {
    paddingBottom: 110,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  tabContent: {
    gap: 20,
  },
  gradientCard: {
    backgroundColor: '#d8e7d5',
    borderRadius: 28,
    padding: 22,
  },
  cardEyebrow: {
    color: '#5f7447',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  heroMetric: {
    color: '#132f4a',
    fontFamily: 'Georgia',
    fontSize: 64,
    lineHeight: 68,
  },
  heroMetricLabel: {
    color: '#35536f',
    fontSize: 18,
    marginBottom: 12,
  },
  heroSupportCopy: {
    color: '#26435e',
    fontSize: 16,
    lineHeight: 23,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  metricChip: {
    backgroundColor: '#f7fbff',
    borderRadius: 20,
    flex: 1,
    padding: 14,
  },
  metricChipLabel: {
    color: '#6a7890',
    fontSize: 13,
    marginBottom: 6,
  },
  metricChipValue: {
    color: '#102033',
    fontSize: 24,
    fontWeight: '700',
  },
  section: {
    gap: 10,
  },
  sectionHeaderRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#edf2f8',
    fontFamily: 'Georgia',
    fontSize: 24,
  },
  sectionHint: {
    color: '#a4b4c6',
    fontSize: 13,
  },
  sectionBody: {
    color: '#c7d4e2',
    fontSize: 15,
    lineHeight: 22,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickCard: {
    backgroundColor: '#17324f',
    borderColor: '#27496b',
    borderRadius: 22,
    borderWidth: 1,
    minWidth: '47%',
    padding: 16,
  },
  quickCardTitle: {
    color: '#f7fbff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  quickCardText: {
    color: '#a5bdd5',
    fontSize: 14,
  },
  chartCard: {
    alignItems: 'flex-end',
    backgroundColor: '#15273d',
    borderRadius: 22,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 186,
    padding: 18,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  barTrack: {
    backgroundColor: '#203954',
    borderRadius: 999,
    height: 110,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: 20,
  },
  barFill: {
    backgroundColor: '#f7bb6e',
    borderRadius: 999,
    width: '100%',
  },
  barLabel: {
    color: '#dde8f3',
    fontSize: 12,
  },
  barValue: {
    color: '#8ca6c1',
    fontSize: 12,
  },
  stack: {
    gap: 12,
  },
  listCard: {
    backgroundColor: '#f5f0e5',
    borderRadius: 22,
    padding: 18,
  },
  listCardTitle: {
    color: '#1e344f',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  listCardBody: {
    color: '#4f6782',
    fontSize: 14,
    lineHeight: 21,
  },
  emptyCard: {
    backgroundColor: '#17324f',
    borderColor: '#294968',
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  emptyCardTitle: {
    color: '#eef6ff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyCardBody: {
    color: '#b0c1d4',
    fontSize: 14,
    lineHeight: 21,
  },
  searchInput: {
    backgroundColor: '#17324f',
    borderColor: '#325273',
    borderRadius: 18,
    borderWidth: 1,
    color: '#f5f8fc',
    fontSize: 16,
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  logCard: {
    backgroundColor: '#f8f4ea',
    borderRadius: 24,
    padding: 18,
  },
  logCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  logTitle: {
    color: '#19314b',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  logMeta: {
    color: '#69809a',
    fontSize: 13,
  },
  logScore: {
    color: '#1e5b4f',
    fontSize: 22,
    fontWeight: '700',
  },
  logNote: {
    color: '#4d647d',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    backgroundColor: '#e4edf8',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagPillText: {
    color: '#33506c',
    fontSize: 12,
    fontWeight: '700',
  },
  logActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  ghostButton: {
    borderColor: '#cdd8e5',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ghostButtonText: {
    color: '#23425f',
    fontWeight: '700',
  },
  ghostDangerText: {
    color: '#9f3c3c',
  },
  metricPanel: {
    backgroundColor: '#dbe7d5',
    borderRadius: 26,
    flexDirection: 'row',
    gap: 12,
    padding: 18,
  },
  metricPanelItem: {
    flex: 1,
  },
  metricPanelValue: {
    color: '#16324d',
    fontFamily: 'Georgia',
    fontSize: 34,
    marginBottom: 6,
  },
  metricPanelLabel: {
    color: '#3d5874',
    fontSize: 12,
  },
  contextCard: {
    backgroundColor: '#eff6e9',
    borderRadius: 18,
    minWidth: '47%',
    padding: 14,
  },
  contextCardMuted: {
    backgroundColor: '#f7eadf',
    borderRadius: 18,
    minWidth: '47%',
    padding: 14,
  },
  contextCardTitle: {
    color: '#17324f',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  contextCardBody: {
    color: '#526a81',
    fontSize: 13,
    lineHeight: 19,
  },
  connectionCard: {
    backgroundColor: '#d8e7d5',
    borderRadius: 24,
    padding: 18,
  },
  connectionStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  connectionStat: {
    backgroundColor: '#f6fbf3',
    borderRadius: 18,
    flex: 1,
    padding: 12,
  },
  connectionStatValue: {
    color: '#17324f',
    fontFamily: 'Georgia',
    fontSize: 28,
    marginBottom: 4,
  },
  connectionStatLabel: {
    color: '#567089',
    fontSize: 12,
  },
  connectionCardTitle: {
    color: '#17324f',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  connectionCardBody: {
    color: '#29445e',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  connectionCardFoot: {
    color: '#4e6780',
    fontSize: 13,
    lineHeight: 20,
  },
  connectionTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#f7bb6e',
    borderRadius: 999,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  connectionTagText: {
    color: '#553313',
    fontSize: 12,
    fontWeight: '700',
  },
  connectionInsightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  connectionInsightCard: {
    backgroundColor: '#eff5e8',
    borderRadius: 20,
    minWidth: '47%',
    padding: 16,
  },
  connectionInsightValue: {
    color: '#18344f',
    fontFamily: 'Georgia',
    fontSize: 30,
    marginBottom: 8,
  },
  connectionInsightLabel: {
    color: '#556f88',
    fontSize: 13,
    lineHeight: 19,
  },
  connectionInsightNote: {
    color: '#50677f',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  proofCard: {
    backgroundColor: '#17324f',
    borderRadius: 24,
    padding: 18,
  },
  proofLine: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginBottom: 10,
  },
  proofBullet: {
    color: '#f7bb6e',
    fontSize: 18,
    marginRight: 10,
  },
  proofText: {
    color: '#eef6ff',
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  pillarCard: {
    backgroundColor: '#f5f0e5',
    borderRadius: 24,
    padding: 16,
  },
  pillarRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  pillarChip: {
    backgroundColor: '#fff9f0',
    borderRadius: 18,
    flex: 1,
    padding: 14,
  },
  pillarChipTitle: {
    color: '#17324f',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  pillarChipBody: {
    color: '#5a7088',
    fontSize: 12,
    lineHeight: 18,
  },
  bedCard: {
    backgroundColor: '#f5eadf',
    borderRadius: 24,
    padding: 18,
  },
  bedStatRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  bedStat: {
    backgroundColor: '#fff8f2',
    borderRadius: 18,
    flex: 1,
    padding: 12,
  },
  bedStatValue: {
    color: '#17324f',
    fontFamily: 'Georgia',
    fontSize: 26,
    marginBottom: 4,
  },
  bedStatLabel: {
    color: '#6b7e92',
    fontSize: 12,
  },
  bedCardTitle: {
    color: '#17324f',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 6,
  },
  bedCardBody: {
    color: '#4d647d',
    fontSize: 14,
    lineHeight: 21,
  },
  bedCardButton: {
    alignItems: 'center',
    backgroundColor: '#17324f',
    borderRadius: 16,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bedCardButtonText: {
    color: '#f7fbff',
    fontSize: 15,
    fontWeight: '700',
  },
  inlineOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  inlineOption: {
    backgroundColor: '#17324f',
    borderColor: '#325273',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inlineOptionSelected: {
    backgroundColor: '#f7bb6e',
    borderColor: '#f7bb6e',
  },
  inlineOptionText: {
    color: '#dbe8f5',
    fontWeight: '700',
  },
  inlineOptionTextSelected: {
    color: '#4c3011',
  },
  toggleRow: {
    alignItems: 'center',
    backgroundColor: '#17324f',
    borderRadius: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    padding: 16,
  },
  toggleTitle: {
    color: '#eef5fc',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  toggleBody: {
    color: '#acc2d8',
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 240,
  },
  togglePill: {
    backgroundColor: '#5a728c',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 4,
    width: 58,
  },
  togglePillOn: {
    backgroundColor: '#1e5b4f',
  },
  toggleKnob: {
    backgroundColor: '#f4f7fb',
    borderRadius: 999,
    height: 24,
    width: 24,
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#b95d5d',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  secondaryButtonText: {
    color: '#efcbcb',
    fontSize: 16,
    fontWeight: '700',
  },
  tabBar: {
    backgroundColor: '#0e1b2a',
    borderTopColor: '#24384d',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 22,
    paddingHorizontal: 12,
    paddingTop: 14,
  },
  tabButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tabButtonSelected: {
    backgroundColor: '#17324f',
  },
  tabButtonText: {
    color: '#9fb5cb',
    fontSize: 13,
    fontWeight: '700',
  },
  tabButtonTextSelected: {
    color: '#f3f8fd',
  },
  modalScrim: {
    backgroundColor: 'rgba(7, 14, 24, 0.7)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#f7f2e7',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    minHeight: '75%',
    paddingTop: 8,
  },
  modalContent: {
    padding: 20,
    paddingBottom: 42,
  },
  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  modalHeaderCopy: {
    flex: 1,
    paddingRight: 12,
  },
  modalTitle: {
    color: '#17324f',
    fontFamily: 'Georgia',
    fontSize: 30,
    lineHeight: 34,
  },
  modalCloseButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#17324f',
    borderRadius: 999,
    minWidth: 74,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalClose: {
    color: '#f8fbff',
    fontSize: 14,
    fontWeight: '700',
  },
  formSection: {
    marginBottom: 18,
  },
  formLabel: {
    color: '#17324f',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  choiceChip: {
    backgroundColor: '#ebdfcf',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  choiceChipSelected: {
    backgroundColor: '#1e5b4f',
  },
  choiceChipText: {
    color: '#415971',
    fontSize: 13,
    fontWeight: '700',
  },
  choiceChipTextSelected: {
    color: '#f7fcf9',
  },
  input: {
    backgroundColor: '#fffdf8',
    borderColor: '#d8ccb9',
    borderRadius: 18,
    borderWidth: 1,
    color: '#16324c',
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  multilineInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  reflectionBlock: {
    marginBottom: 12,
  },
  reflectionPrompt: {
    color: '#4c6178',
    fontSize: 14,
    marginBottom: 8,
  },
});
