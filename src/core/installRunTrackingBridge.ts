import {
  AppState,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { runLocationTrackingService } from '../services/runLocationTrackingService';
import {
  clearBufferedRunBackgroundRoutePoints,
  drainBufferedRunBackgroundRoutePoints,
  getRunBackgroundLocationPermissionState,
  requestRunBackgroundLocationPermission,
  setRunBackgroundLocationControl,
  startRunBackgroundLocationTracking,
  type RunBackgroundLocationControlUpdate,
  stopRunBackgroundLocationTracking,
} from '../services/runBackgroundLocationService';
import { getRunWeatherSnapshot } from '../services/runWeatherService';
import { useRunStatus } from '../app_core/state/useRunStatus';
import type { RoutePoint, RunSessionStatus } from './runs/runTrackingTypes';
import { filterRecoveredRoutePoints } from './runs/activeRunRecoverySchema';
import { canCommitForegroundTransition } from './runs/runTrackingTransition';
import {
  shouldCancelPendingAutoPause,
  shouldCancelPendingAutoResume,
} from './runs/motionAutoPausePolicy';
import {
  createRunStopPreparationToken,
  type RunStopPreparationToken,
} from './runs/runStopPreparation';
import LaufBuddyMotion from '../../modules/laufbuddy-motion/src/LaufBuddyMotionModule';
import type { LaufBuddyMotionActivityPayload } from '../../modules/laufbuddy-motion/src/LaufBuddyMotion.types';

type RunTrackingBridgeCleanup = () => void;

type RunTrackingBridgeState = {
  runId: string | null;
  sessionStatus: RunSessionStatus;
  startedAt: number | null;
};

let activeCleanup: RunTrackingBridgeCleanup | null = null;
let activePrepareRunStop: ((token: RunStopPreparationToken) => Promise<void>) | null = null;
let motionSubscription: { remove: () => void } | null = null;
let pendingAutoPauseTimer: ReturnType<typeof setTimeout> | null = null;
let pendingAutoResumeTimer: ReturnType<typeof setTimeout> | null = null;
let isMotionRecognitionStarted = false;
let runStopPrepared = false;

function createRunBackgroundControlUpdate(
  state: ReturnType<typeof useRunStatus.getState>,
  lastRoutePointBoundary?:
    RunBackgroundLocationControlUpdate['lastRoutePointBoundary'],
): RunBackgroundLocationControlUpdate {
  const lastCompletedSplitDurationSeconds = state.splits.reduce(
    (totalDurationSeconds, split) =>
      totalDurationSeconds + split.durationSeconds,
    0,
  );

  return {
    runId: state.runId,
    totalPausedMs: state.totalPausedMs,
    lastRoutePointBoundary,
    progress: {
      distanceKm: state.distanceKm,
      lastRoutePoint: state.lastRoutePoint,
      lastAnnouncedKilometer: state.splits.length,
      lastCompletedSplitDurationSeconds,
    },
  };
}

const AUTO_PAUSE_STILL_DELAY_MS = 3000;
const AUTO_RESUME_MOVING_DELAY_MS = 2500;
const AUTO_RESUME_GPS_DELAY_MS = 1000;

async function ensureActivityRecognitionPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 29) {
    return true;
  }

  const permission = 'android.permission.ACTIVITY_RECOGNITION';

  const alreadyGranted = await PermissionsAndroid.check(permission);

  if (alreadyGranted) {
    return true;
  }

  const result = await PermissionsAndroid.request(permission, {
    title: 'Bewegungserkennung erlauben',
    message: 'LaufBuddy nutzt Bewegungserkennung, um Läufe automatisch zu pausieren.',
    buttonPositive: 'OK',
  });

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function latestOpenPauseIsAuto(): boolean {
  const state = useRunStatus.getState();

  if (state.sessionStatus !== 'paused') {
    return false;
  }

  const pauses = state.pauses ?? [];
  const latestPause = pauses[pauses.length - 1] ?? null;

  return latestPause !== null && latestPause.endedAt === null && latestPause.source === 'auto';
}

function clearAutoPauseTimers(reason: string): void {
  if (pendingAutoPauseTimer) {
    clearTimeout(pendingAutoPauseTimer);
    pendingAutoPauseTimer = null;
    console.info('[RunTrackingBridge] Auto-Pause-Timer abgebrochen', { reason });
  }

  if (pendingAutoResumeTimer) {
    clearTimeout(pendingAutoResumeTimer);
    pendingAutoResumeTimer = null;
    console.info('[RunTrackingBridge] Motion-Auto-Resume-Timer abgebrochen', { reason });
  }
}

function scheduleAutoResumeFromGps(routePoint: RoutePoint): void {
  if (!latestOpenPauseIsAuto()) {
    return;
  }

  if (pendingAutoResumeTimer) {
    console.info('[RunTrackingBridge] GPS-Auto-Resume nicht geplant: Timer bereits aktiv');
    return;
  }

  if (pendingAutoPauseTimer) {
    clearTimeout(pendingAutoPauseTimer);
    pendingAutoPauseTimer = null;
    console.info('[RunTrackingBridge] Auto-Pause-Timer abgebrochen', { reason: 'GPS-Bewegung' });
  }

  console.info('[RunTrackingBridge] GPS-Auto-Resume-Timer geplant', { delayMs: AUTO_RESUME_GPS_DELAY_MS });

  pendingAutoResumeTimer = setTimeout(() => {
    pendingAutoResumeTimer = null;
    console.info('[RunTrackingBridge] GPS-Auto-Resume-Timer abgelaufen');

    const latestState = useRunStatus.getState();

    if (latestState.sessionStatus === 'paused' && latestOpenPauseIsAuto()) {
      console.info('[RunTrackingBridge] auto resume from gps movement', {
        accuracyMeters: routePoint.accuracyMeters,
        speedMetersPerSecond: routePoint.speedMetersPerSecond,
      });

      latestState.resumeRun();
    }
  }, AUTO_RESUME_GPS_DELAY_MS);
}

function scheduleAutoPauseFromMotion(payload: LaufBuddyMotionActivityPayload): void {
  const state = useRunStatus.getState();

  if (payload.motionState === 'still' && state.sessionStatus === 'running') {
    if (pendingAutoPauseTimer) {
      console.info('[RunTrackingBridge] Auto-Pause nicht geplant: Timer bereits aktiv');
      return;
    }

    if (pendingAutoResumeTimer) {
      clearTimeout(pendingAutoResumeTimer);
      pendingAutoResumeTimer = null;
      console.info('[RunTrackingBridge] Motion-Auto-Resume-Timer abgebrochen', { reason: 'still erkannt' });
    }

    console.info('[RunTrackingBridge] Auto-Pause-Timer geplant', { delayMs: AUTO_PAUSE_STILL_DELAY_MS });

    pendingAutoPauseTimer = setTimeout(() => {
      pendingAutoPauseTimer = null;
      console.info('[RunTrackingBridge] Auto-Pause-Timer abgelaufen');

      const latestState = useRunStatus.getState();

      if (latestState.sessionStatus === 'running') {
        console.info('[RunTrackingBridge] pauseRun(auto) wird aufgerufen');
        latestState.pauseRun('auto');
      } else {
        console.info('[RunTrackingBridge] pauseRun(auto) übersprungen', { sessionStatus: latestState.sessionStatus });
      }
    }, AUTO_PAUSE_STILL_DELAY_MS);

    return;
  }

  if (
    payload.motionState === 'moving' &&
    state.sessionStatus === 'paused' &&
    latestOpenPauseIsAuto()
  ) {
    if (pendingAutoResumeTimer) {
      console.info('[RunTrackingBridge] Motion-Auto-Resume nicht geplant: Timer bereits aktiv');
      return;
    }

    if (pendingAutoPauseTimer) {
      clearTimeout(pendingAutoPauseTimer);
      pendingAutoPauseTimer = null;
      console.info('[RunTrackingBridge] Auto-Pause-Timer abgebrochen', { reason: 'moving erkannt' });
    }

    console.info('[RunTrackingBridge] Motion-Auto-Resume-Timer geplant', { delayMs: AUTO_RESUME_MOVING_DELAY_MS });

    pendingAutoResumeTimer = setTimeout(() => {
      pendingAutoResumeTimer = null;
      console.info('[RunTrackingBridge] Motion-Auto-Resume-Timer abgelaufen');

      const latestState = useRunStatus.getState();

      if (
        latestState.sessionStatus === 'paused' &&
        latestOpenPauseIsAuto()
      ) {
        latestState.resumeRun();
      }
    }, AUTO_RESUME_MOVING_DELAY_MS);

    return;
  }

  if (payload.motionState === 'moving' && pendingAutoPauseTimer) {
    clearTimeout(pendingAutoPauseTimer);
    pendingAutoPauseTimer = null;
    console.info('[RunTrackingBridge] Auto-Pause-Timer abgebrochen', { reason: 'moving erkannt' });
  }

  if (payload.motionState === 'still' && pendingAutoResumeTimer) {
    clearTimeout(pendingAutoResumeTimer);
    pendingAutoResumeTimer = null;
    console.info('[RunTrackingBridge] Motion-Auto-Resume-Timer abgebrochen', { reason: 'still erkannt' });
  }
}

async function startMotionAutoPause(): Promise<void> {
  if (isMotionRecognitionStarted) {
    return;
  }

  const hasPermission = await ensureActivityRecognitionPermission();

  if (!hasPermission) {
    console.warn('[RunTrackingBridge] Activity Recognition permission missing');
    return;
  }

  motionSubscription = LaufBuddyMotion.addListener(
    'onMotionActivityChanged',
    (payload: LaufBuddyMotionActivityPayload) => {
      const state = useRunStatus.getState();
      console.info('[RunTrackingBridge] Motion-Ereignis empfangen', {
        activity: payload.activity ?? null,
        transition: payload.transition ?? null,
        motionState: payload.motionState ?? null,
        confidence: null,
        sessionStatus: state.sessionStatus,
      });
      scheduleAutoPauseFromMotion(payload);
    },
  );

  const status = await LaufBuddyMotion.startActivityRecognitionAsync();

  isMotionRecognitionStarted = status.started === true;
  console.info('[RunTrackingBridge] Motion-Erkennung gestartet', {
    started: isMotionRecognitionStarted,
    message: status.message ?? null,
  });

  if (!isMotionRecognitionStarted) {
    console.warn('[RunTrackingBridge] Motion recognition not started', status.message);
  }
}

function stopMotionAutoPause(): void {
  console.info('[RunTrackingBridge] Motion-Erkennung wird gestoppt und bereinigt');
  clearAutoPauseTimers('Motion-Erkennung beendet');

  if (motionSubscription) {
    motionSubscription.remove();
    motionSubscription = null;
  }

  if (isMotionRecognitionStarted) {
    LaufBuddyMotion.stopActivityRecognitionAsync().catch((error: unknown) => {
      console.error('[RunTrackingBridge] stop motion failed', error);
    });
  }

  isMotionRecognitionStarted = false;
}


export function createRunTrackingStopPreparation(): {
  preparation: Promise<void>;
  invalidate: () => void;
} {
  const prepareRunStop = activePrepareRunStop;
  const token = createRunStopPreparationToken();

  if (!prepareRunStop) {
    return {
      preparation: Promise.resolve(),
      invalidate: token.invalidate,
    };
  }

  return {
    preparation: prepareRunStop(token),
    invalidate: token.invalidate,
  };
}

export async function prepareRunTrackingForStop(): Promise<void> {
  await createRunTrackingStopPreparation().preparation;
}

export async function installRunTrackingBridge(): Promise<RunTrackingBridgeCleanup> {
  if (activeCleanup) {
    return activeCleanup;
  }

  let timerId: ReturnType<typeof setInterval> | null = null;
  let isTrackingStarted = false;
  let weatherRequestedForCurrentRun = false;
  let currentAppState = AppState.currentState;
  let backgroundPermissionGranted = false;
  let backgroundOperation: Promise<void> = Promise.resolve();
  let backgroundOperationSequence = 0;
  let appStateTransitionSequence = 0;
  let backgroundLocationKnownStopped = false;

  const requestWeatherIfNeeded = async (
    latitude: number,
    longitude: number,
  ): Promise<void> => {
    if (weatherRequestedForCurrentRun) {
      return;
    }

    weatherRequestedForCurrentRun = true;

    try {
      const weather = await getRunWeatherSnapshot({
        latitude,
        longitude,
      });

      useRunStatus.getState().setWeather(weather);
    } catch (error) {
      console.error('[RunTrackingBridge] weather failed', error);
    }
  };

  const startTracking = async (canStart?: () => boolean): Promise<void> => {
    if (isTrackingStarted || (canStart && !canStart())) {
      return;
    }

    weatherRequestedForCurrentRun = false;

    const permissionState =
      await runLocationTrackingService.getForegroundPermissionState();

    if (permissionState !== 'granted') {
      const requestedPermission =
        await runLocationTrackingService.requestForegroundPermission();

      if (requestedPermission !== 'granted') {
        throw new Error('Standortberechtigung wurde nicht erteilt.');
      }
    }

    if (canStart && !canStart()) {
      return;
    }

    await runLocationTrackingService.startTracking({
      onLocationSample: (sample) => {
        const currentRunState = useRunStatus.getState();

        if (currentRunState.sessionStatus === 'paused') {
          scheduleAutoResumeFromGps(sample.routePoint);
        }

        currentRunState.addRoutePoint(sample.routePoint);

        requestWeatherIfNeeded(
          sample.routePoint.latitude,
          sample.routePoint.longitude,
        ).catch((error: unknown) => {
          console.error('[RunTrackingBridge] weather request failed', error);
        });
      },
      onTrackingError: (error) => {
        console.error('[RunTrackingBridge] tracking error', error);
        useRunStatus.getState().failRun(
          error.message || 'Tracking-Fehler während des Laufs.',
        );
      },
    });

    if (canStart && !canStart()) {
      runLocationTrackingService.stopTracking();
      return;
    }

    timerId = setInterval(() => {
      const state = useRunStatus.getState();

      if (state.sessionStatus !== 'running') {
        return;
      }

      state.tick();
    }, 1000);

    isTrackingStarted = true;
  };

  const stopTracking = (): void => {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }

    runLocationTrackingService.stopTracking();
    isTrackingStarted = false;
  };

  const stopBackgroundLocationOnce = async (): Promise<void> => {
    if (backgroundLocationKnownStopped) {
      return;
    }

    await stopRunBackgroundLocationTracking();
    backgroundLocationKnownStopped = true;
  };

  const queueBackgroundOperation = (
    operationName: string,
    operation: () => Promise<void>,
  ): void => {
    const operationSequence = ++backgroundOperationSequence;
    const queuedState = useRunStatus.getState();

    console.info('[RunTrackingBridge] Hintergrund-Operation eingereiht', {
      operationSequence,
      operationName,
      appState: currentAppState,
      sessionStatus: queuedState.sessionStatus,
      startedAt: queuedState.startedAt,
    });

    backgroundOperation = backgroundOperation
      .then(async () => {
        const startedState = useRunStatus.getState();

        console.info('[RunTrackingBridge] Hintergrund-Operation gestartet', {
          operationSequence,
          operationName,
          appState: currentAppState,
          sessionStatus: startedState.sessionStatus,
          startedAt: startedState.startedAt,
        });

        await operation();

        const completedState = useRunStatus.getState();

        console.info('[RunTrackingBridge] Hintergrund-Operation abgeschlossen', {
          operationSequence,
          operationName,
          appState: currentAppState,
          sessionStatus: completedState.sessionStatus,
          startedAt: completedState.startedAt,
        });
      })
      .catch((error: unknown) => {
        console.error(
          `[RunTrackingBridge] ${operationName} fehlgeschlagen`,
          {
            operationSequence,
            error,
          },
        );
      });
  };

  const ensureBackgroundLocationPermission =
    async (): Promise<boolean> => {
      const currentPermission =
        await getRunBackgroundLocationPermissionState();

      if (currentPermission === 'granted') {
        backgroundPermissionGranted = true;
        return true;
      }

      const requestedPermission =
        await requestRunBackgroundLocationPermission();

      backgroundPermissionGranted =
        requestedPermission === 'granted';

      if (!backgroundPermissionGranted) {
        console.warn(
          '[RunTrackingBridge] Hintergrund-Standort wurde nicht freigegeben',
        );
      }

      return backgroundPermissionGranted;
    };

  const flushBufferedBackgroundPoints =
    async (shouldFlush?: () => boolean): Promise<void> => {
      if (shouldFlush && !shouldFlush()) {
        return;
      }

      const bufferedPoints =
        await drainBufferedRunBackgroundRoutePoints(
          useRunStatus.getState().runId,
          shouldFlush,
        );

      if (shouldFlush && !shouldFlush()) {
        return;
      }

      if (bufferedPoints.length === 0) {
        return;
      }

      const state = useRunStatus.getState();

      if (
        state.sessionStatus !== 'running' &&
        state.sessionStatus !== 'paused'
      ) {
        return;
      }

      const recoveredPoints = filterRecoveredRoutePoints(
        state.runId ?? '',
        state.runId,
        bufferedPoints,
        state.routePoints,
        state.lastRoutePoint,
        state.sessionStatus === 'paused' || state.lastRoutePoint === null,
      );

      if (recoveredPoints.length === 0) {
        return;
      }

      state.addRecoveredRoutePoints(recoveredPoints);

      console.info(
        '[RunTrackingBridge] Hintergrund-GPS-Punkte übernommen',
        {
          count: recoveredPoints.length,
        },
      );
    };

  activePrepareRunStop = async (token: RunStopPreparationToken): Promise<void> => {
    backgroundOperation = backgroundOperation
      .then(async () => {
        if (!token.isCurrent()) {
          return;
        }

        await stopRunBackgroundLocationTracking();
        backgroundLocationKnownStopped = true;

        if (!token.isCurrent()) {
          console.info(
            '[RunTrackingBridge] Überholte GPS-Vorbereitung vor Laufstopp verworfen',
          );
          return;
        }

        await flushBufferedBackgroundPoints(token.isCurrent);

        if (!token.isCurrent()) {
          console.info(
            '[RunTrackingBridge] Überholte GPS-Vorbereitung vor Laufstopp verworfen',
          );
          return;
        }

        runStopPrepared = true;

        console.info(
          '[RunTrackingBridge] GPS vor Laufstopp vollständig übernommen',
        );
      })
      .catch((error: unknown) => {
        console.error(
          '[RunTrackingBridge] GPS-Vorbereitung vor Laufstopp fehlgeschlagen',
          error,
        );
      });

    await backgroundOperation;
  };

  const switchToBackgroundTracking =
    async (): Promise<void> => {
      const state = useRunStatus.getState();

      if (
        state.sessionStatus !== 'running' &&
        state.sessionStatus !== 'paused'
      ) {
        return;
      }

      await setRunBackgroundLocationControl(
        state.sessionStatus,
        state.startedAt,
        createRunBackgroundControlUpdate(state),
      );

      if (!backgroundPermissionGranted) {
        const permissionState =
          await getRunBackgroundLocationPermissionState();

        backgroundPermissionGranted =
          permissionState === 'granted';
      }

      if (!backgroundPermissionGranted) {
        return;
      }

      stopTracking();
      await startRunBackgroundLocationTracking();
      backgroundLocationKnownStopped = false;

      console.info(
        '[RunTrackingBridge] Hintergrund-GPS gestartet',
      );
    };

  const switchToForegroundTracking = async (
    transitionSequence: number,
    expectedRunId: string,
  ): Promise<void> => {
    const canCommit = (): boolean => {
      const state = useRunStatus.getState();
      return canCommitForegroundTransition(
        { sequence: transitionSequence, runId: expectedRunId },
        {
          sequence: appStateTransitionSequence,
          appState: currentAppState,
          runId: state.runId,
          sessionStatus: state.sessionStatus,
        },
        backgroundLocationKnownStopped,
      );
    };

    if (!canCommit()) {
      return;
    }

    // Await the native stop before recovery and foreground watch starts.
    await stopBackgroundLocationOnce();

    if (!canCommit()) {
      return;
    }

    const state = useRunStatus.getState();
    await setRunBackgroundLocationControl('idle', state.startedAt);

    if (!canCommit()) {
      return;
    }

    await flushBufferedBackgroundPoints(canCommit);

    if (!canCommit()) {
      return;
    }

    await startTracking(canCommit);

    if (isTrackingStarted) {
      console.info(
        '[RunTrackingBridge] Vordergrund-GPS wieder aktiv',
      );
    }
  };

  const appStateSubscription = AppState.addEventListener(
    'change',
    (nextAppState) => {
      currentAppState = nextAppState;
      const transitionSequence = ++appStateTransitionSequence;

      const state = useRunStatus.getState();

      console.info('[RunTrackingBridge] AppState-Wechsel', {
        nextAppState,
        sessionStatus: state.sessionStatus,
        startedAt: state.startedAt,
      });

      if (
        state.sessionStatus !== 'running' &&
        state.sessionStatus !== 'paused'
      ) {
        return;
      }

      if (nextAppState === 'active') {
        if (!state.runId) {
          return;
        }

        queueBackgroundOperation(
          'Wechsel zu Vordergrund-GPS',
          () => switchToForegroundTracking(transitionSequence, state.runId as string),
        );
        return;
      }

      if (
        nextAppState === 'background' ||
        nextAppState === 'inactive'
      ) {
        queueBackgroundOperation(
          'Wechsel zu Hintergrund-GPS',
          switchToBackgroundTracking,
        );
      }
    },
  );

  const initialRunState = useRunStatus.getState();

  let previousState: RunTrackingBridgeState = {
    runId: initialRunState.runId,
    sessionStatus: initialRunState.sessionStatus,
    startedAt: initialRunState.startedAt,
  };

  const unsubscribe = useRunStatus.subscribe((state) => {
    const nextState: RunTrackingBridgeState = {
      runId: state.runId,
      sessionStatus: state.sessionStatus,
      startedAt: state.startedAt,
    };

    const previousSessionStatus = previousState.sessionStatus;
    const nextSessionStatus = nextState.sessionStatus;

    const runJustStarted =
      previousSessionStatus !== 'running' &&
      previousSessionStatus !== 'paused' &&
      nextSessionStatus === 'running';

    const runWasActive =
      previousSessionStatus === 'running' ||
      previousSessionStatus === 'paused';

    const runIsNoLongerActive =
      nextSessionStatus !== 'running' &&
      nextSessionStatus !== 'paused';

    const trackingShouldStop = runWasActive && runIsNoLongerActive;

    const runJustPrepared =
      previousSessionStatus !== 'prepared' &&
      nextSessionStatus === 'prepared';

    const preparedRunWasCancelled =
      previousSessionStatus === 'prepared' &&
      nextSessionStatus !== 'prepared' &&
      nextSessionStatus !== 'running' &&
      nextSessionStatus !== 'paused';

    if (trackingShouldStop || previousState.runId !== nextState.runId) {
      appStateTransitionSequence += 1;
    }

    previousState = nextState;

    if (shouldCancelPendingAutoPause(previousSessionStatus, nextSessionStatus) && pendingAutoPauseTimer) {
      clearAutoPauseTimers('Laufstatus hat running verlassen');
    }

    if (shouldCancelPendingAutoResume(previousSessionStatus, nextSessionStatus) && pendingAutoResumeTimer) {
      clearAutoPauseTimers('Laufstatus hat paused verlassen');
    }

    if (runJustPrepared) {
      queueBackgroundOperation(
        'Hintergrund-GPS vor Laufstart vorbereiten',
        async () => {
          await clearBufferedRunBackgroundRoutePoints(
            useRunStatus.getState().runId,
          );

          await setRunBackgroundLocationControl(
            'idle',
            null,
          );

          const permissionGranted =
            await ensureBackgroundLocationPermission();

          if (!permissionGranted) {
            return;
          }

          await startRunBackgroundLocationTracking();
          backgroundLocationKnownStopped = false;

          console.info(
            '[RunTrackingBridge] Hintergrund-GPS vor Laufstart vorbereitet',
          );
        },
      );

      return;
    }

    if (runJustStarted) {
      console.info('[RunTrackingBridge] Neuer Lauf erkannt', {
        previousSessionStatus,
        nextSessionStatus,
        startedAt: nextState.startedAt,
        appState: currentAppState,
      });

      startMotionAutoPause().catch((error: unknown) => {
        console.error('[RunTrackingBridge] motion start failed', error);
      });

      if (currentAppState === 'active') {
        startTracking().catch((error: unknown) => {
          console.error('[RunTrackingBridge] start failed', error);

          useRunStatus.getState().failRun(
            error instanceof Error
              ? error.message
              : 'Tracking konnte nicht gestartet werden.',
          );
        });
      }

      queueBackgroundOperation(
        'Hintergrund-GPS für Lauf aktivieren',
        async () => {
          const latestState = useRunStatus.getState();

          await clearBufferedRunBackgroundRoutePoints(
            latestState.runId,
          );

          const permissionGranted =
            await ensureBackgroundLocationPermission();

          if (!permissionGranted) {
            return;
          }

          await startRunBackgroundLocationTracking();
          backgroundLocationKnownStopped = false;

          if (currentAppState === 'active') {
            await setRunBackgroundLocationControl(
              'idle',
              latestState.startedAt,
            );
            return;
          }

          await setRunBackgroundLocationControl(
            latestState.sessionStatus,
            latestState.startedAt,
            createRunBackgroundControlUpdate(latestState),
          );

          stopTracking();

          console.info(
            '[RunTrackingBridge] Hintergrund-GPS für Lauf aktiv',
          );
        },
      );

      return;
    }

    if (
      previousSessionStatus !== nextSessionStatus &&
      (nextSessionStatus === 'running' ||
        nextSessionStatus === 'paused')
    ) {
      const boundarySessionStatus = state.sessionStatus;
      const boundaryStartedAt = state.startedAt;
      const boundaryControlUpdate =
        createRunBackgroundControlUpdate(
          state,
          'clear-last-route-point',
        );

      queueBackgroundOperation(
        'Hintergrund-GPS-Status aktualisieren',
        async () => {
          const backgroundSessionStatus: RunSessionStatus =
            currentAppState === 'active'
              ? 'idle'
              : boundarySessionStatus;

          await setRunBackgroundLocationControl(
            backgroundSessionStatus,
            boundaryStartedAt,
            boundaryControlUpdate,
          );
        },
      );
    }

    if (preparedRunWasCancelled) {
      queueBackgroundOperation(
        'Vorbereitetes Hintergrund-GPS beenden',
        async () => {
          await stopRunBackgroundLocationTracking();
          backgroundLocationKnownStopped = true;

          await setRunBackgroundLocationControl(
            nextSessionStatus,
            nextState.startedAt,
          );

          await clearBufferedRunBackgroundRoutePoints(
            nextState.runId,
          );
        },
      );

      return;
    }

    if (trackingShouldStop) {
      console.info('[RunTrackingBridge] Laufende erkannt', {
        previousSessionStatus,
        nextSessionStatus,
        previousStartedAt: previousState.startedAt,
        nextStartedAt: nextState.startedAt,
        appState: currentAppState,
      });

      stopTracking();

      if (!runStopPrepared) {
        queueBackgroundOperation(
          'Hintergrund-GPS beenden',
          async () => {
            await stopRunBackgroundLocationTracking();
            backgroundLocationKnownStopped = true;
            await setRunBackgroundLocationControl(nextSessionStatus, nextState.startedAt);
          },
        );
      }
      runStopPrepared = false;
    }

    if (runWasActive && runIsNoLongerActive) {
      stopMotionAutoPause();
    }
  });

  activeCleanup = () => {
    unsubscribe();
    appStateSubscription.remove();
    stopTracking();
    stopMotionAutoPause();

    void stopRunBackgroundLocationTracking().catch(
      (error: unknown) => {
        console.error(
          '[RunTrackingBridge] Hintergrund-GPS Cleanup fehlgeschlagen',
          error,
        );
      },
    );

    activePrepareRunStop = null;
    activeCleanup = null;
  };

  return activeCleanup;
}
