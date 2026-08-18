// src/app_core/AppRoot.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  BackHandler,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { bootstrapLaufBuddyCore } from '../core/bootstrapLaufBuddyCore';
import { prepareRunTrackingForStop } from '../core/installRunTrackingBridge';
import {
  clearActiveRunSnapshot,
  initialiseActiveRunRecovery,
  restoreActiveRunSnapshot,
} from '../services/activeRunSnapshotService';
import { clearBufferedRunBackgroundRoutePoints } from '../services/runBackgroundLocationService';
import {
  installLaufBuddyDebugGlobals,
  uninstallLaufBuddyDebugGlobals,
} from '../core/installLaufBuddyDebugGlobals';
import { startHeadphoneConnectionListener } from '../services/headphoneConnectionService';
import {
  addDiagnosticEvent,
  installDiagnosticConsoleWatcher,
  markDiagnosticSessionClean,
  startDiagnosticSession,
} from '../services/diagnostics/diagnosticLogService';
import { useBuddyStatus } from './state/useBuddyStatus';
import { useRunStatus } from './state/useRunStatus';
import { useRunHistory } from './state/useRunHistory';
import { loadReleaseSetupStatus } from '../services/releaseSetupService';
import { loadRunProfileSetupDone } from '../services/runProfileSetupStatusService';
import { HeadphoneStatus } from '../state/headphoneStatus';
import { useHeadphoneStore } from '../state/headphoneStore';
import { useEmergencyContactsStore } from '../state/emergencyContactsStore';
import { useHotwordStore } from '../state/hotwordStore';
import { createEmergencyReadinessState } from './utils/emergencyReadiness';
import { useFullScreenIntentAccessStatus } from './hooks/useFullScreenIntentAccessStatus';
import { buddyWebRTCManager } from './audio/WebRTCManager';

import HomeScreen from './screens/HomeScreen';
import ReleaseSetupScreen from './screens/ReleaseSetupScreen';
import RunProfileSetupScreen from './screens/RunProfileSetupScreen';
import RunScreen, { type RunScreenHandle } from './screens/RunScreen';
import RunHistoryScreen from './screens/RunHistoryScreen';
import BuddyScreen from './screens/BuddyScreen';
import SettingsScreen from './screens/SettingsScreen';
import EmergencyContactsScreen from './screens/EmergencyContactsScreen';
import ShoeScreen from './screens/ShoeScreen';
import ShopScreen from './screens/ShopScreen';
import RunDetailScreen from './screens/RunDetailScreen';
import UnlockScreen from './screens/UnlockScreen';

type ActiveScreen =
  | 'releaseSetup'
  | 'runProfileSetup'
  | 'home'
  | 'run'
  | 'runHistory'
  | 'runDetail'
  | 'buddy'
  | 'settings'
  | 'emergencyContacts'
  | 'unlock'
  | 'shoe'
  | 'shop';

const SWIPE_BACK_HINT_STORAGE_KEY = 'laufbuddy.swipeBackHintLearning.v2';
const SWIPE_BACK_HINT_HIDE_AFTER_USES = 3;
const SWIPE_BACK_HINT_RESHOW_AFTER_MS = 14 * 24 * 60 * 60 * 1000;


function HotwordReadinessBanner() {
  const headphoneStatus = useHeadphoneStore((state) => state.status);
  const hotwordStatus = useHotwordStore((state) => state.status);
  const hotwordInactiveReason = useHotwordStore((state) => state.inactiveReason);
  const fullScreenIntentAccess = useFullScreenIntentAccessStatus();
  const selectedEmergencyContacts = useEmergencyContactsStore(
    (state) => state.selectedContacts,
  );
  const hydrateSelectedEmergencyContacts = useEmergencyContactsStore(
    (state) => state.hydrateSelectedContacts,
  );

  const translateY = React.useRef(new Animated.Value(-92)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;
  const previousMessageRef = React.useRef<string | null>(null);
  const activeAnimationRef = React.useRef<Animated.CompositeAnimation | null>(
    null,
  );

  useEffect(() => {
    void hydrateSelectedEmergencyContacts();
  }, [hydrateSelectedEmergencyContacts]);

  const bannerState = React.useMemo(
    () =>
      createEmergencyReadinessState(
        headphoneStatus,
        selectedEmergencyContacts,
        hotwordStatus,
        hotwordInactiveReason,
        fullScreenIntentAccess ?? undefined,
      ),
    [
      fullScreenIntentAccess,
      headphoneStatus,
      hotwordInactiveReason,
      hotwordStatus,
      selectedEmergencyContacts,
    ],
  );

  const bannerMessageKey =
    `${bannerState.label}|${bannerState.subline}`;

  useEffect(() => {
    if (previousMessageRef.current === bannerMessageKey) {
      return;
    }

    previousMessageRef.current = bannerMessageKey;

    activeAnimationRef.current?.stop();
    translateY.setValue(-92);
    opacity.setValue(0);

    const holdMs = bannerState.tone === 'ready' ? 2400 : 3600;

    const nextAnimation = Animated.sequence([
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(holdMs),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -92,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]);

    activeAnimationRef.current = nextAnimation;
    nextAnimation.start(() => {
      if (activeAnimationRef.current === nextAnimation) {
        activeAnimationRef.current = null;
      }
    });
  }, [bannerMessageKey, bannerState.tone, opacity, translateY]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.hotwordTopBanner,
        bannerState.tone === 'ready'
          ? styles.hotwordTopBannerReady
          : styles.hotwordTopBannerWarning,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Text
        style={[
          styles.hotwordTopBannerText,
          bannerState.tone === 'warning'
            ? styles.hotwordTopBannerTextWarning
            : null,
        ]}
        numberOfLines={1}
      >
        {bannerState.label}
      </Text>

      <Text
        style={styles.hotwordTopBannerSubline}
        numberOfLines={1}
      >
        {bannerState.subline}
      </Text>
    </Animated.View>
  );
}

type SwipeBackFrameProps = {
  children: React.ReactNode;
  onBack: () => void;
  showHint?: boolean;
};

function SwipeBackFrame({ children, onBack, showHint = true }: SwipeBackFrameProps) {
  const [shouldShowSwipeBackHint, setShouldShowSwipeBackHint] =
    React.useState(false);
  const swipeBackUseCountRef = React.useRef(0);

  React.useEffect(() => {
    let isMounted = true;

    async function loadSwipeBackHintLearning() {
      try {
        const rawValue = await AsyncStorage.getItem(SWIPE_BACK_HINT_STORAGE_KEY);
        const parsedValue = rawValue ? JSON.parse(rawValue) : null;
        const useCount =
          typeof parsedValue?.useCount === 'number' ? parsedValue.useCount : 0;
        const lastUsedAt =
          typeof parsedValue?.lastUsedAt === 'number' ? parsedValue.lastUsedAt : null;

        const shouldResetLearning =
          lastUsedAt === null ||
          Date.now() - lastUsedAt >= SWIPE_BACK_HINT_RESHOW_AFTER_MS;
        const effectiveUseCount = shouldResetLearning ? 0 : useCount;
        const learnedRecently =
          effectiveUseCount >= SWIPE_BACK_HINT_HIDE_AFTER_USES;

        swipeBackUseCountRef.current = effectiveUseCount;

        if (isMounted) {
          setShouldShowSwipeBackHint(!learnedRecently);
        }
      } catch {
        if (isMounted) {
          setShouldShowSwipeBackHint(true);
        }
      }
    }

    void loadSwipeBackHintLearning();

    return () => {
      isMounted = false;
    };
  }, []);

  const markSwipeBackHintUsed = React.useCallback(() => {
    const nextUseCount = Math.min(
      SWIPE_BACK_HINT_HIDE_AFTER_USES,
      swipeBackUseCountRef.current + 1,
    );

    swipeBackUseCountRef.current = nextUseCount;
    setShouldShowSwipeBackHint(nextUseCount < SWIPE_BACK_HINT_HIDE_AFTER_USES);

    void AsyncStorage.setItem(
      SWIPE_BACK_HINT_STORAGE_KEY,
      JSON.stringify({
        useCount: nextUseCount,
        lastUsedAt: Date.now(),
      }),
    ).catch(() => undefined);
  }, []);

  const swipeBackPanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          Math.abs(gestureState.dx) > 70 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.6,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 70 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.6,
        onPanResponderRelease: (_, gestureState) => {
          if (
            Math.abs(gestureState.dx) > 70 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.6
          ) {
            markSwipeBackHintUsed();
            onBack();
          }
        },
      }),
    [markSwipeBackHintUsed, onBack],
  );

  return (
    <View style={styles.swipeBackFrame} {...swipeBackPanResponder.panHandlers}>
      {children}

      {showHint && shouldShowSwipeBackHint ? (
        <View pointerEvents="none" style={styles.swipeBackHint}>
          <Text style={styles.swipeBackHintText}>
            Von links oder rechts wischen: zurück
          </Text>
        </View>
      ) : null}

      {__DEV__ ? <HotwordReadinessBanner /> : null}
    </View>
  );
}

export function AppRoot(props: {
  incomingUrl?: string | null;
  pendingInvitationToken?: string | null;
  onIncomingUrlHandled?: () => void;
  onInvitationHandled?: (token: string | null) => void;
}) {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('releaseSetup');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetailReturnScreen, setRunDetailReturnScreen] =
    useState<'run' | 'runHistory'>('run');
  const [emergencyContactsReturnScreen, setEmergencyContactsReturnScreen] =
    useState<'releaseSetup' | 'home' | 'settings'>('settings');
  const [runProfileOpenedFromSettings, setRunProfileOpenedFromSettings] =
    useState(false);
  const runScreenRef = useRef<RunScreenHandle>(null);
  const pendingInvitationToken = props.pendingInvitationToken ?? null;
  const pendingInvitationTokenRef = useRef<string | null>(pendingInvitationToken);
  pendingInvitationTokenRef.current = pendingInvitationToken;
  const selectedEmergencyContacts = useEmergencyContactsStore(
    (state) => state.selectedContacts,
  );
  const url = props.incomingUrl ?? null;
  const parsedScreenshotUrl = url ? Linking.parse(url) : null;
  const screenshotScreen =
    parsedScreenshotUrl?.path === 'screenshot' &&
    typeof parsedScreenshotUrl.queryParams?.screen === 'string'
      ? parsedScreenshotUrl.queryParams.screen
      : null;

  const prepareRun = useRunStatus((state) => state.prepareRun);

  const completeReleaseSetup = useCallback(() => {
    void loadRunProfileSetupDone()
      .then((isDone) => {
        if (isDone) {
          setActiveScreen('home');
          return;
        }

        setRunProfileOpenedFromSettings(false);
        setActiveScreen('runProfileSetup');
      })
      .catch(() => {
        setRunProfileOpenedFromSettings(false);
        setActiveScreen('runProfileSetup');
      });
  }, []);

  useEffect(() => {
    if (screenshotScreen !== null) {
      return undefined;
    }

    let isMounted = true;

    async function openHomeIfSetupIsReady() {
      const status = await loadReleaseSetupStatus().catch(() => null);

      if (isMounted && status?.isReadyForHome && pendingInvitationTokenRef.current === null) {
        const isRunProfileSetupDone = await loadRunProfileSetupDone().catch(
          () => false,
        );

        if (isMounted) {
          if (isRunProfileSetupDone) {
            setActiveScreen('home');
          } else {
            setRunProfileOpenedFromSettings(false);
            setActiveScreen('runProfileSetup');
          }
        }
      }
    }

    void openHomeIfSetupIsReady();

    return () => {
      isMounted = false;
    };
  }, [screenshotScreen]);

  useEffect(() => {
    if (
      activeScreen !== 'emergencyContacts' ||
      emergencyContactsReturnScreen !== 'releaseSetup' ||
      selectedEmergencyContacts.length === 0
    ) {
      return;
    }

    let isMounted = true;
    void loadReleaseSetupStatus().then((status) => {
      if (isMounted && status.isReadyForHome) {
        completeReleaseSetup();
      }
    }).catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [
    activeScreen,
    completeReleaseSetup,
    emergencyContactsReturnScreen,
    selectedEmergencyContacts.length,
  ]);

  function handleOpenRunFromHome() {
    void addDiagnosticEvent({
      area: 'run',
      event: 'RUN_START_REQUEST_FROM_HOME',
      message: 'Laufstart über Home-Wheel angefordert',
    });

    prepareRun('Solo-Lauf', 'Home-Wheel');
    setActiveScreen('run');
  }

  const handleBackFromRun = useCallback(() => {
    const runState = useRunStatus.getState();

    if (runState.sessionStatus === 'prepared') {
      runState.cancelPreparedRun();
    }

    setActiveScreen('home');
  }, []);

  const handleRunBackRequest = useCallback(() => {
    if (runScreenRef.current !== null) {
      runScreenRef.current.requestBack();
      return;
    }

    handleBackFromRun();
  }, [handleBackFromRun]);

  useEffect(() => {
    if (activeScreen !== 'run') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        handleRunBackRequest();
        return true;
      },
    );

    return () => subscription.remove();
  }, [activeScreen, handleRunBackRequest]);

  const handleBackFromBuddy = useCallback(() => {
    void useBuddyStatus.getState().disconnectBuddy().catch(() => undefined);
    void buddyWebRTCManager.cleanup();
    props.onInvitationHandled?.(pendingInvitationTokenRef.current);
    setActiveScreen('home');
  }, [props]);

  const handleBackFromRunDetail = useCallback(() => {
    setSelectedRunId(null);

    if (runDetailReturnScreen === 'run') {
      useRunStatus.getState().resetRun();
      setRunDetailReturnScreen('run');
      setActiveScreen('home');
      return;
    }

    setActiveScreen('runHistory');
  }, [runDetailReturnScreen]);

  useEffect(() => {
    let cleanupCore: (() => void) | null = null;

    const cleanupDiagnosticConsoleWatcher =
      installDiagnosticConsoleWatcher();

    void startDiagnosticSession().then((sessionResult) => {
      if (
        !sessionResult.previousSessionWasClean &&
        sessionResult.previousSession !== null
      ) {
        console.log('[DiagnosticLog] Vorherige Sitzung war nicht sauber', {
          previousSession: sessionResult.previousSession,
        });
      }

      void addDiagnosticEvent({
        area: 'system',
        event: 'DIAGNOSTIC_CONSOLE_WATCHER_INSTALLED',
        message: 'Technischer LaufBuddy-Watcher wurde installiert',
        details: {
          sessionId: sessionResult.sessionId,
          maxEvents: 1000,
        },
      });
    });

    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextAppState) => {
        if (nextAppState === 'active') {
          void addDiagnosticEvent({
            area: 'app',
            event: 'APP_FOREGROUND',
            message: 'LaufBuddy ist im Vordergrund',
          });
          return;
        }

        if (nextAppState === 'background') {
          void addDiagnosticEvent({
            area: 'app',
            event: 'APP_BACKGROUND',
            message: 'LaufBuddy ist im Hintergrund',
          });
          return;
        }

        if (nextAppState === 'inactive') {
          void addDiagnosticEvent({
            area: 'app',
            event: 'APP_INACTIVE',
            message: 'LaufBuddy ist kurzzeitig inaktiv',
          });
        }
      },
    );

    const setup = async () => {
      cleanupCore = await bootstrapLaufBuddyCore();

      const snapshot = await initialiseActiveRunRecovery();

      if (snapshot !== null) {
        Alert.alert(
          'Unterbrochenen Lauf wiederherstellen',
          'Ein unterbrochener Lauf wurde gefunden. Er wird erst nach Ihrer Entscheidung fortgesetzt.',
          [
            {
              text: 'Lauf verwerfen',
              style: 'destructive',
              onPress: () => {
                useRunStatus.getState().resetRun();
                void Promise.all([
                  clearActiveRunSnapshot(snapshot.runId),
                  clearBufferedRunBackgroundRoutePoints(snapshot.runId),
                ]);
              },
            },
            {
              text: 'Lauf beenden und mit vorhandenen Daten speichern',
              onPress: () => {
                if (!restoreActiveRunSnapshot(snapshot)) return;
                void (async () => {
                  try {
                    await prepareRunTrackingForStop();
                    await useRunStatus.getState().stopRun();
                  } catch (error) {
                    console.error('[ActiveRunRecovery] Lauf konnte nicht persistent gespeichert werden', error);
                    Alert.alert(
                      'Lauf noch nicht gespeichert',
                      'Die Wiederherstellungsdaten bleiben erhalten. Bitte versuchen Sie das Speichern erneut.',
                    );
                  }
                })();
              },
            },
            {
              text: 'Lauf fortsetzen',
              onPress: () => {
                restoreActiveRunSnapshot(snapshot);
              },
            },
          ],
          { cancelable: false },
        );
      }

      await addDiagnosticEvent({
        area: 'app',
        event: 'APP_CORE_BOOTSTRAPPED',
        message: 'LaufBuddy Kern wurde gestartet',
      });
    };

    setup();

    const cleanupHeadphoneListener = startHeadphoneConnectionListener();

    if (__DEV__) {
      installLaufBuddyDebugGlobals();
    }

    return () => {
      void markDiagnosticSessionClean('AppRoot Cleanup wurde ausgeführt').catch(
        () => undefined,
      );

      void addDiagnosticEvent({
        area: 'app',
        event: 'APP_ROOT_CLEANUP',
        message: 'AppRoot Cleanup wurde ausgeführt',
      });

      appStateSubscription.remove();
      cleanupHeadphoneListener();
      if (__DEV__) {
        uninstallLaufBuddyDebugGlobals();
      }

      if (cleanupCore) {
        cleanupCore();
      }

      cleanupDiagnosticConsoleWatcher();
    };
  }, []);

  useEffect(() => {
    if (!url) {
      return;
    }

    const parsedUrl = Linking.parse(url);

    if (screenshotScreen !== null) {
      if (screenshotScreen === 'runDetail') {
        const latestRun =
          [...useRunHistory.getState().runs].sort(
            (left, right) => right.startedAt - left.startedAt,
          )[0] ?? null;

        if (latestRun !== null) {
          setSelectedRunId(latestRun.id);
          setRunDetailReturnScreen('runHistory');
          setActiveScreen('runDetail');
        } else {
          console.warn(
            '[ScreenshotMode] Kein gespeicherter Lauf für RunDetail vorhanden',
          );
          setActiveScreen('runHistory');
        }

        return;
      }

      const screenshotScreens: ActiveScreen[] = [
        'releaseSetup',
        'runProfileSetup',
        'home',
        'run',
        'runHistory',
        'buddy',
        'settings',
        'emergencyContacts',
        'unlock',
        'shoe',
        'shop',
      ];

      if (
        screenshotScreens.includes(
          screenshotScreen as ActiveScreen,
        )
      ) {
        if (screenshotScreen === 'emergencyContacts') {
          setEmergencyContactsReturnScreen('settings');
        }

        if (screenshotScreen === 'runProfileSetup') {
          setRunProfileOpenedFromSettings(false);
        }

        setActiveScreen(screenshotScreen as ActiveScreen);
        return;
      }

      console.warn(
        '[ScreenshotMode] Unbekannter Screen:',
        screenshotScreen,
      );
      return;
    }

    void addDiagnosticEvent({
      area: 'app',
      event: 'APP_LINK_RECEIVED',
      message: 'App-Link wurde empfangen',
      details: {
        path: parsedUrl.path ?? null,
      },
    });

  }, [
    url,
    screenshotScreen,
  ]);

  useEffect(() => {
    if (pendingInvitationToken === null) return;

    setActiveScreen('buddy');
    void addDiagnosticEvent({
      area: 'buddy',
      event: 'BUDDY_CONNECT_REQUEST_BY_LINK',
      message: 'Sichere Buddy-Einladung wurde per Link angefordert',
    });
  }, [pendingInvitationToken]);

  if (activeScreen === 'releaseSetup') {
    return (
      <ReleaseSetupScreen
        onOpenEmergencyContacts={() => {
          setEmergencyContactsReturnScreen('releaseSetup');
          setActiveScreen('emergencyContacts');
        }}
        onContinue={completeReleaseSetup}
      />
    );
  }

  if (activeScreen === 'runProfileSetup') {
    if (runProfileOpenedFromSettings) {
      return (
        <SwipeBackFrame
          onBack={() => {
            setRunProfileOpenedFromSettings(false);
            setActiveScreen('settings');
          }}
        >
          <RunProfileSetupScreen
            mode="edit"
            onFinish={() => {
              setRunProfileOpenedFromSettings(false);
              setActiveScreen('settings');
            }}
          />
        </SwipeBackFrame>
      );
    }

    return (
      <RunProfileSetupScreen
        mode="setup"
        onFinish={() => {
          setRunProfileOpenedFromSettings(false);
          setActiveScreen('home');
        }}
      />
    );
  }

  if (activeScreen === 'run') {
    return (
      <SwipeBackFrame onBack={handleRunBackRequest} showHint={false}>
        <RunScreen
          ref={runScreenRef}
          onBack={handleBackFromRun}
          onOpenRunDetail={(runId) => {
            setSelectedRunId(runId);
            setRunDetailReturnScreen('run');
            setActiveScreen('runDetail');
          }}
        />
      </SwipeBackFrame>
    );
  }

  if (activeScreen === 'runHistory') {
    return (
      <SwipeBackFrame onBack={() => setActiveScreen('home')}>
        <RunHistoryScreen
          onOpenRunDetail={(runId) => {
            setSelectedRunId(runId);
            setRunDetailReturnScreen('runHistory');
            setActiveScreen('runDetail');
          }}
        />
      </SwipeBackFrame>
    );
  }

  if (activeScreen === 'runDetail' && selectedRunId !== null) {
    return (
      <SwipeBackFrame onBack={handleBackFromRunDetail}>
        <RunDetailScreen
          runId={selectedRunId}
          onBack={handleBackFromRunDetail}
        />
      </SwipeBackFrame>
    );
  }

  if (activeScreen === 'buddy') {
    return (
      <SwipeBackFrame onBack={handleBackFromBuddy} showHint={false}>
        <BuddyScreen
          onBack={handleBackFromBuddy}
          onOpenRun={() => setActiveScreen('run')}
          initialInvitationToken={pendingInvitationToken}
          onInitialInvitationHandled={() => {
            props.onInvitationHandled?.(pendingInvitationToken);
          }}
        />
      </SwipeBackFrame>
    );
  }

  if (activeScreen === 'settings') {
    return (
      <SwipeBackFrame onBack={() => setActiveScreen('home')}>
        <SettingsScreen
          onBack={() => setActiveScreen('home')}
          onOpenRunProfile={() => {
            setRunProfileOpenedFromSettings(true);
            setActiveScreen('runProfileSetup');
          }}
          onOpenEmergencyContacts={() => {
            setEmergencyContactsReturnScreen('settings');
            setActiveScreen('emergencyContacts');
          }}
          onOpenShoe={() => setActiveScreen('shoe')}
        />
      </SwipeBackFrame>
    );
  }

  if (activeScreen === 'emergencyContacts') {
    return (
      <SwipeBackFrame onBack={() => setActiveScreen(emergencyContactsReturnScreen)}>
        <EmergencyContactsScreen
          onBack={() => setActiveScreen(emergencyContactsReturnScreen)}
        />
      </SwipeBackFrame>
    );
  }

  if (activeScreen === 'unlock') {
    return (
      <SwipeBackFrame onBack={() => setActiveScreen('settings')}>
        <UnlockScreen onBack={() => setActiveScreen('settings')} />
      </SwipeBackFrame>
    );
  }

  if (activeScreen === 'shoe') {
    return (
      <SwipeBackFrame onBack={() => setActiveScreen('settings')}>
        <ShoeScreen onBack={() => setActiveScreen('settings')} />
      </SwipeBackFrame>
    );
  }

  if (activeScreen === 'shop') {
    return (
      <SwipeBackFrame onBack={() => setActiveScreen('home')}>
        <ShopScreen onBack={() => setActiveScreen('home')} />
      </SwipeBackFrame>
    );
  }

  return (
    <HomeScreen
      onOpenRun={handleOpenRunFromHome}
      onOpenBuddy={() => setActiveScreen('buddy')}
      onOpenRunHistory={() => setActiveScreen('runHistory')}
      onOpenSettings={() => setActiveScreen('settings')}
    />
  );
}

const styles = StyleSheet.create({
  swipeBackFrame: {
    flex: 1,
  },
  swipeBackHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  swipeBackHintText: {
    color: '#7D98A6',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  hotwordTopBanner: {
    position: 'absolute',
    top: 166,
    left: 42,
    right: 42,
    minHeight: 40,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 24,
    elevation: 4,
    shadowColor: '#0F212E',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.06,
    shadowRadius: 5,
  },
  hotwordTopBannerReady: {
    backgroundColor: 'rgba(242, 251, 252, 0.96)',
    borderColor: '#B7DEE5',
  },
  hotwordTopBannerWarning: {
    backgroundColor: 'rgba(247, 250, 252, 0.96)',
    borderColor: '#C7DCE7',
  },
  hotwordTopBannerText: {
    color: '#153243',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  hotwordTopBannerTextWarning: {
    color: '#153243',
  },
  hotwordTopBannerSubline: {
    marginTop: 1,
    color: '#5B6B7A',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
});
