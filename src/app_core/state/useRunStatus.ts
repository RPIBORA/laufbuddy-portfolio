import { create } from 'zustand';
import type {
  ActiveRunState,
  RoutePoint,
  RunMode,
  RunPauseEntry,
  RunPauseSource,
  RunSplit,
  RunWeatherSnapshot,
} from '../../core/runs/runTrackingTypes';
import { useRunHistory } from './useRunHistory';
import { useShoeStatus } from './useShoeStatus';
import { addDiagnosticEvent } from '../../services/diagnostics/diagnosticLogService';
import { voicePrompts } from '../../config/voicePrompts';
import { completeActiveRun } from '../../core/runs/activeRunCompletion';
import { clearActiveRunSnapshot } from '../../services/activeRunSnapshotService';
import { clearBufferedRunBackgroundRoutePoints } from '../../services/runBackgroundLocationService';
import { endLiveSessionSync } from '../../services/live/liveSessionService';

type RunStatusActions = {
  prepareRun: (runMode: RunMode, startSource: string) => void;
  cancelPreparedRun: () => void;
  startRun: (runMode: RunMode, startSource: string) => void;
  pauseRun: (source?: RunPauseSource) => void;
  resumeRun: () => void;
  stopRun: () => Promise<void>;
  resetRun: () => void;

  addRoutePoint: (point: RoutePoint) => void;
  addRecoveredRoutePoints: (points: RoutePoint[]) => void;
  tick: () => void;

  setWeather: (weather: RunWeatherSnapshot) => void;
  failRun: (reason: string) => void;
};

type RunStatusState = ActiveRunState & RunStatusActions;

type ElevationSummary = {
  elevationGainMeters: number | null;
  elevationLossMeters: number | null;
  maxAltitudeMeters: number | null;
  minAltitudeMeters: number | null;
};

const MIN_ELEVATION_DELTA_METERS = 1.5;
const SPLIT_DISTANCE_KM = 1;

function createInitialState(): ActiveRunState {
  return {
    runId: null,
    sessionStatus: 'idle',

    runActive: false,
    runPrepared: false,
    runMode: 'Kein Lauf aktiv',
    startSource: 'Noch nicht gestartet',

    startedAt: null,
    endedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
    durationSeconds: 0,
    distanceKm: 0,
    averagePaceSecondsPerKm: null,

    shoeId: null,

    routePoints: [],
    lastRoutePoint: null,
    routeFingerprint: null,
    routeGroupId: null,

    splits: [],

    pauseSummary: {
      pauseCount: 0,
      totalPauseDurationMs: 0,
    },
    pauses: [],

    weather: null,

    buddyConnectedAtStart: false,
    headsetConnectedAtStart: false,
    hotwordAvailableAtStart: false,
    safetyActiveAtStart: false,

    connectionDropEvents: [],
    headsetDropEvents: [],
    emergencyTriggered: false,
    emergencyType: 'none',

    failureReason: null,
  };
}

function calculateDistanceKm(a: RoutePoint, b: RoutePoint): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;

  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) *
      Math.sin(dLon / 2) *
      Math.cos(lat1) *
      Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

  return R * c;
}

function calculateDurationSeconds(
  startedAt: number | null,
  currentTimeMs: number,
  totalPausedMs = 0,
): number {
  if (startedAt === null) {
    return 0;
  }

  const durationMs = currentTimeMs - startedAt - totalPausedMs;

  if (durationMs <= 0) {
    return 0;
  }

  return Math.floor(durationMs / 1000);
}

function calculateAveragePaceSecondsPerKm(
  durationSeconds: number,
  distanceKm: number,
): number | null {
  if (distanceKm <= 0) {
    return null;
  }

  return Math.round(durationSeconds / distanceKm);
}

function calculateAverageSpeedKph(
  durationSeconds: number,
  distanceKm: number,
): number | null {
  if (durationSeconds <= 0 || distanceKm <= 0) {
    return null;
  }

  const hours = durationSeconds / 3600;
  return Math.round((distanceKm / hours) * 100) / 100;
}

function formatPaceForVoice(paceSecondsPerKm: number | null): string | null {
  if (paceSecondsPerKm === null || paceSecondsPerKm <= 0) {
    return null;
  }

  const minutes = Math.floor(paceSecondsPerKm / 60);
  const seconds = paceSecondsPerKm % 60;

  if (seconds === 0) {
    return `${minutes} Minuten pro Kilometer`;
  }

  return `${minutes} Minuten ${seconds} Sekunden pro Kilometer`;
}

function formatDurationForVoice(durationSeconds: number): string {
  const safeDurationSeconds = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(safeDurationSeconds / 3600);
  const minutes = Math.floor((safeDurationSeconds % 3600) / 60);
  const seconds = safeDurationSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`);
  }

  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`);
  }

  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds} ${seconds === 1 ? 'Sekunde' : 'Sekunden'}`);
  }

  return parts.join(' ');
}

function createKilometerVoicePrompt(
  split: RunSplit,
  totalDurationSeconds: number,
): string {
  const messages = [
    `Kilometer ${split.splitIndex}.`,
    `Gesamtzeit ${formatDurationForVoice(totalDurationSeconds)}.`,
  ];

  const averagePaceText = formatPaceForVoice(
    calculateAveragePaceSecondsPerKm(
      totalDurationSeconds,
      split.splitIndex,
    ),
  );

  if (averagePaceText !== null) {
    messages.push(`Durchschnitt ${averagePaceText}.`);
  }

  const splitPaceText = formatPaceForVoice(split.paceSecondsPerKm);

  if (split.splitIndex > 1 && splitPaceText !== null) {
    messages.push(`Letzter Kilometer ${splitPaceText}.`);
  }

  return messages.join(' ');
}

function calculateMaxSpeedKph(routePoints: RoutePoint[]): number | null {
  const validSpeeds = routePoints
    .map((point) => point.speedMetersPerSecond)
    .filter(
      (speed): speed is number =>
        typeof speed === 'number' && Number.isFinite(speed) && speed >= 0,
    );

  if (validSpeeds.length === 0) {
    return null;
  }

  const maxMetersPerSecond = Math.max(...validSpeeds);
  return Math.round(maxMetersPerSecond * 3.6 * 100) / 100;
}

function calculateElevationSummary(routePoints: RoutePoint[]): ElevationSummary {
  const validAltitudes = routePoints
    .map((point) => point.altitudeMeters)
    .filter(
      (altitude): altitude is number =>
        typeof altitude === 'number' && Number.isFinite(altitude),
    );

  if (validAltitudes.length === 0) {
    return {
      elevationGainMeters: null,
      elevationLossMeters: null,
      maxAltitudeMeters: null,
      minAltitudeMeters: null,
    };
  }

  let elevationGainMeters = 0;
  let elevationLossMeters = 0;

  for (let index = 1; index < validAltitudes.length; index += 1) {
    const previousAltitude = validAltitudes[index - 1];
    const nextAltitude = validAltitudes[index];
    const delta = nextAltitude - previousAltitude;

    if (Math.abs(delta) < MIN_ELEVATION_DELTA_METERS) {
      continue;
    }

    if (delta > 0) {
      elevationGainMeters += delta;
    } else {
      elevationLossMeters += Math.abs(delta);
    }
  }

  return {
    elevationGainMeters: Math.round(elevationGainMeters),
    elevationLossMeters: Math.round(elevationLossMeters),
    maxAltitudeMeters: Math.round(Math.max(...validAltitudes)),
    minAltitudeMeters: Math.round(Math.min(...validAltitudes)),
  };
}

function calculateSplitPaceSecondsPerKm(
  durationSeconds: number,
  splitDistanceKm: number,
): number | null {
  if (durationSeconds <= 0 || splitDistanceKm <= 0) {
    return null;
  }

  return Math.round(durationSeconds / splitDistanceKm);
}

function calculateCompletedSplits(
  currentSplits: RunSplit[],
  distanceKm: number,
  durationSeconds: number,
): RunSplit[] {
  const completedSplitCount = Math.floor(distanceKm / SPLIT_DISTANCE_KM);

  if (completedSplitCount <= currentSplits.length) {
    return currentSplits;
  }

  const nextSplits = [...currentSplits];

  while (nextSplits.length < completedSplitCount) {
    const splitIndex = nextSplits.length + 1;
    const previousSplitDurationSeconds = nextSplits.reduce(
      (sum, split) => sum + split.durationSeconds,
      0,
    );
    const splitDurationSeconds = Math.max(
      0,
      durationSeconds - previousSplitDurationSeconds,
    );

    nextSplits.push({
      splitIndex,
      splitDistanceKm: SPLIT_DISTANCE_KM,
      durationSeconds: splitDurationSeconds,
      paceSecondsPerKm: calculateSplitPaceSecondsPerKm(
        splitDurationSeconds,
        SPLIT_DISTANCE_KM,
      ),
    });
  }

  return nextSplits;
}

function toRoutePointSnapshots(routePoints: RoutePoint[]) {
  return routePoints.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    timestamp: point.timestamp,
    accuracyMeters: point.accuracyMeters,
    altitudeMeters: point.altitudeMeters,
    headingDegrees: point.headingDegrees,
    speedMetersPerSecond: point.speedMetersPerSecond,
  }));
}

function generateRunPauseId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

function toRunPauseLocationSnapshot(
  point: RoutePoint | null,
): RunPauseEntry['location'] {
  if (point === null) {
    return null;
  }

  return {
    latitude: point.latitude,
    longitude: point.longitude,
    timestamp: point.timestamp,
    accuracyMeters: point.accuracyMeters,
    altitudeMeters: point.altitudeMeters,
    headingDegrees: point.headingDegrees,
    speedMetersPerSecond: point.speedMetersPerSecond,
  };
}

export function createPauseSummary(
  pauses: RunPauseEntry[],
  totalPauseDurationMs: number,
): NonNullable<ActiveRunState['pauseSummary']> {
  return {
    pauseCount: pauses.length,
    totalPauseDurationMs,
  };
}

export function closeLatestOpenPause(
  pauses: RunPauseEntry[],
  endedAt: number,
): RunPauseEntry[] {
  let openPauseIndex = -1;

  for (let index = pauses.length - 1; index >= 0; index -= 1) {
    if (pauses[index].endedAt === null) {
      openPauseIndex = index;
      break;
    }
  }

  if (openPauseIndex === -1) {
    return pauses;
  }

  return pauses.map((pause, index) => {
    if (index !== openPauseIndex) {
      return pause;
    }

    return {
      ...pause,
      endedAt,
      durationMs: Math.max(0, endedAt - pause.startedAt),
    };
  });
}

export const useRunStatus = create<RunStatusState>((set, get) => ({
  ...createInitialState(),

  prepareRun: (runMode, startSource) => {
    const activeShoe = useShoeStatus.getState().getActiveShoe();

    set({
      ...createInitialState(),
      sessionStatus: 'prepared',
      runPrepared: true,
      runMode,
      startSource,
      shoeId: activeShoe?.id ?? null,
    });
  },

  cancelPreparedRun: () =>
    set((state) => {
      if (state.sessionStatus !== 'prepared') {
        return state;
      }

      void endLiveSessionSync();
      return createInitialState();
    }),

  resetRun: () => {
    const previousState = get();
    console.info('[RunStatus] resetRun', {
      previousRunId: previousState.runId,
      previousSessionStatus: previousState.sessionStatus,
    });
    void endLiveSessionSync();
    set(createInitialState());
  },

  startRun: (runMode, startSource) => {
    const activeShoe = useShoeStatus.getState().getActiveShoe();
    const startedAt = Date.now();

    void addDiagnosticEvent({
      area: 'run',
      event: 'RUN_STARTED',
      message: 'Lauf wurde gestartet',
      details: {
        runMode,
        startSource,
        hasActiveShoe: activeShoe !== null,
      },
    });

    voicePrompts.speakMany(['runStarted']);

    set({
      ...createInitialState(),
      runId: `run-${startedAt}-${Math.random().toString(36).slice(2, 10)}`,
      sessionStatus: 'running',
      runActive: true,
      runMode,
      startSource,
      startedAt,
      shoeId: activeShoe?.id ?? null,
    });
  },

  pauseRun: (source = 'manual') =>
    set((state) => {
      if (state.sessionStatus !== 'running') {
        return state;
      }

      const pausedAt = Date.now();
      const durationSeconds = calculateDurationSeconds(
        state.startedAt,
        pausedAt,
        state.totalPausedMs,
      );
      const nextPauses: RunPauseEntry[] = [
        ...(state.pauses ?? []),
        {
          id: generateRunPauseId(),
          source,
          label: source === 'auto' ? 'Auto-Pause' : 'Manuelle Pause',
          startedAt: pausedAt,
          endedAt: null,
          durationMs: null,
          location: toRunPauseLocationSnapshot(state.lastRoutePoint),
        },
      ];

      console.info('[RunStatus] pauseRun', {
        source,
        previousSessionStatus: state.sessionStatus,
        pausesBefore: state.pauses?.length ?? 0,
        pausesAfter: nextPauses.length,
        timestamp: pausedAt,
      });

      void addDiagnosticEvent({
        area: 'run',
        event: 'RUN_PAUSED',
        message: 'Lauf wurde pausiert',
        details: {
          durationSeconds,
          distanceKm: state.distanceKm,
        },
      });

      voicePrompts.speakMany(['runPaused']);

      return {
        ...state,
        sessionStatus: 'paused',
        runActive: true,
        pausedAt,
        durationSeconds,
        averagePaceSecondsPerKm: calculateAveragePaceSecondsPerKm(
          durationSeconds,
          state.distanceKm,
        ),
        pauseSummary: createPauseSummary(nextPauses, state.totalPausedMs),
        pauses: nextPauses,
        lastRoutePoint: null,
      };
    }),

  resumeRun: () =>
    set((state) => {
      if (state.sessionStatus !== 'paused' || state.pausedAt === null) {
        return state;
      }

      const resumedAt = Date.now();
      const pausedDurationMs = Math.max(0, resumedAt - state.pausedAt);
      const nextTotalPausedMs = state.totalPausedMs + pausedDurationMs;
      const nextPauses = closeLatestOpenPause(state.pauses ?? [], resumedAt);

      console.info('[RunStatus] resumeRun', {
        previousSessionStatus: state.sessionStatus,
        pausesBefore: state.pauses?.length ?? 0,
        pausesAfter: nextPauses.length,
        timestamp: resumedAt,
      });

      void addDiagnosticEvent({
        area: 'run',
        event: 'RUN_RESUMED',
        message: 'Lauf wurde fortgesetzt',
        details: {
          durationSeconds: state.durationSeconds,
          distanceKm: state.distanceKm,
        },
      });

      voicePrompts.speakMany(['runResumed']);

      return {
        ...state,
        sessionStatus: 'running',
        runActive: true,
        pausedAt: null,
        totalPausedMs: nextTotalPausedMs,
        pauseSummary: createPauseSummary(nextPauses, nextTotalPausedMs),
        pauses: nextPauses,
        lastRoutePoint: null,
      };
    }),

  stopRun: async () => {
      const state = get();

      if (state.sessionStatus !== 'running' && state.sessionStatus !== 'paused') {
        return;
      }

      const endedAt = Date.now();
      const totalPausedMs =
        state.sessionStatus === 'paused' && state.pausedAt !== null
          ? state.totalPausedMs + Math.max(0, endedAt - state.pausedAt)
          : state.totalPausedMs;
      const pauses =
        state.sessionStatus === 'paused'
          ? closeLatestOpenPause(state.pauses ?? [], endedAt)
          : state.pauses ?? [];
      const pauseSummary = createPauseSummary(pauses, totalPausedMs);
      const durationSeconds = calculateDurationSeconds(
        state.startedAt,
        endedAt,
        totalPausedMs,
      );
      const activeShoe = useShoeStatus.getState().getActiveShoe();
      const shoeId = state.shoeId ?? activeShoe?.id ?? null;
      const elevationSummary = calculateElevationSummary(state.routePoints);

      console.info('[RunStatus] stopRun', {
        previousSessionStatus: state.sessionStatus,
        pausesBefore: state.pauses?.length ?? 0,
        hasOpenPause: (state.pauses ?? []).some((pause) => pause.endedAt === null),
        finalPauseCount: pauseSummary.pauseCount,
        totalPauseDurationMs: pauseSummary.totalPauseDurationMs,
      });

      void addDiagnosticEvent({
        area: 'run',
        event: 'RUN_STOP_REQUESTED',
        message: 'Laufende wurde angefordert',
        details: {
          durationSeconds,
          distanceKm: state.distanceKm,
          routePointsCount: state.routePoints.length,
          splitsCount: state.splits.length,
          hasShoe: shoeId !== null,
        },
      });

      voicePrompts.speakMany(['runStopped']);

      if (shoeId === null || state.startedAt === null || state.runId === null) {
        const error = new Error('Lauf kann ohne Run-ID, Startzeit und Laufschuh nicht gespeichert werden.');

        void addDiagnosticEvent({
          level: 'warn',
          area: 'run',
          event: 'RUN_NOT_SAVED',
          message: 'Lauf konnte nicht gespeichert werden',
          details: {
            durationSeconds,
            distanceKm: state.distanceKm,
            hasRunId: state.runId !== null,
            hasStartedAt: state.startedAt !== null,
            hasShoe: shoeId !== null,
          },
        });

        throw error;
      }

      const startPoint = state.routePoints[0] ?? null;
      const endPoint = state.routePoints[state.routePoints.length - 1] ?? null;

      try {
        await completeActiveRun({
          runId: state.runId,
          saveRun: () => useRunHistory.getState().addRun({
            runId: state.runId,
            distanceKm: state.distanceKm,
            durationSeconds,
            shoeId,

            startedAt: state.startedAt,
            endedAt,
            averagePaceSecondsPerKm: calculateAveragePaceSecondsPerKm(
              durationSeconds,
              state.distanceKm,
            ),
            splits: state.splits,

            pauseSummary,
            pauses,

            routeDistanceKm: state.distanceKm,
            routeFingerprint: state.routeFingerprint,
            routeGroupId: state.routeGroupId,
            routePoints: toRoutePointSnapshots(state.routePoints),

            startLatitude: startPoint?.latitude ?? null,
            startLongitude: startPoint?.longitude ?? null,
            endLatitude: endPoint?.latitude ?? null,
            endLongitude: endPoint?.longitude ?? null,

            elevationGainMeters: elevationSummary.elevationGainMeters,
            elevationLossMeters: elevationSummary.elevationLossMeters,
            maxAltitudeMeters: elevationSummary.maxAltitudeMeters,
            minAltitudeMeters: elevationSummary.minAltitudeMeters,
            climbIntensity: null,
            descentIntensity: null,
            flatRatio: null,
            surfaceType: 'unknown',

            weatherType: state.weather?.weatherType ?? null,
            temperatureCelsius: state.weather?.temperatureCelsius ?? null,
            feelsLikeCelsius: state.weather?.feelsLikeCelsius ?? null,
            humidityPercent: state.weather?.humidityPercent ?? null,
            windSpeedKph: state.weather?.windSpeedKph ?? null,
            precipitationMm: state.weather?.precipitationMm ?? null,
            isRain: state.weather?.isRain ?? null,
            isSnow: state.weather?.isSnow ?? null,

            runMode: state.runMode,
            buddyConnectedRatio: null,
            headsetConnectedRatio: null,

            averageSpeedKph: calculateAverageSpeedKph(
              durationSeconds,
              state.distanceKm,
            ),
            maxSpeedKph: calculateMaxSpeedKph(state.routePoints),

            notes: null,
          }),
          clearSnapshot: clearActiveRunSnapshot,
          clearBackgroundBuffer: clearBufferedRunBackgroundRoutePoints,
        });
      } catch (error) {
        void addDiagnosticEvent({
          level: 'warn',
          area: 'run',
          event: 'RUN_NOT_SAVED',
          message: 'Laufhistorie oder Recovery-Daten konnten nicht vollständig gespeichert werden',
          details: {
            runId: state.runId,
            error: error instanceof Error ? error.message : String(error),
          },
        });

        throw error;
      }

      void addDiagnosticEvent({
        area: 'run',
        event: 'RUN_SAVED',
        message: 'Lauf wurde persistent gespeichert und Recovery-Daten bereinigt',
        details: {
          runId: state.runId,
          durationSeconds,
          distanceKm: state.distanceKm,
          routePointsCount: state.routePoints.length,
          splitsCount: state.splits.length,
          elevationGainMeters: elevationSummary.elevationGainMeters,
          elevationLossMeters: elevationSummary.elevationLossMeters,
        },
      });

      // History retains the completed data for the detail screen. Only after
      // persistence and both recovery cleanups have completed is live state reset.
      await endLiveSessionSync();
      set(createInitialState());
    },

  failRun: (reason) => {
    void endLiveSessionSync();
    void addDiagnosticEvent({
      level: 'warn',
      area: 'run',
      event: 'RUN_FAILED',
      message: 'Lauf wurde als fehlgeschlagen markiert',
      details: {
        reason,
      },
    });

    set({
      ...createInitialState(),
      sessionStatus: 'failed',
      failureReason: reason,
    });
  },

  addRecoveredRoutePoints: (points) =>
    set((state) => {
      if (
        (state.sessionStatus !== 'running' &&
          state.sessionStatus !== 'paused') ||
        points.length === 0
      ) {
        return state;
      }

      const startedAt = state.startedAt;

      if (startedAt === null) {
        return state;
      }

      const knownPointKeys = new Set(
        state.routePoints.map(
          (point) =>
            `${point.timestamp}:${point.latitude}:${point.longitude}`,
        ),
      );

      const recoveredPoints = points.filter((point) => {
        if (
          !Number.isFinite(point.latitude) ||
          !Number.isFinite(point.longitude) ||
          !Number.isFinite(point.timestamp) ||
          point.timestamp < startedAt - 5000 ||
          point.timestamp > Date.now() + 60000
        ) {
          return false;
        }

        const pointKey =
          `${point.timestamp}:${point.latitude}:${point.longitude}`;

        if (knownPointKeys.has(pointKey)) {
          return false;
        }

        knownPointKeys.add(pointKey);
        return true;
      });

      if (recoveredPoints.length === 0) {
        return state;
      }

      const mergedRoutePoints = [
        ...state.routePoints,
        ...recoveredPoints,
      ].sort((a, b) => a.timestamp - b.timestamp);

      let recoveredDistanceKm = 0;
      let previousPoint: RoutePoint | null = null;

      for (const currentPoint of mergedRoutePoints) {
        if (previousPoint !== null) {
          const segmentCrossesPause = (state.pauses ?? []).some(
            (pause) => {
              const pauseEnd =
                pause.endedAt ?? Number.POSITIVE_INFINITY;

              return (
                previousPoint!.timestamp < pauseEnd &&
                currentPoint.timestamp > pause.startedAt
              );
            },
          );

          if (!segmentCrossesPause) {
            recoveredDistanceKm += calculateDistanceKm(
              previousPoint,
              currentPoint,
            );
          }
        }

        previousPoint = currentPoint;
      }

      const roundedDistanceKm = Number(
        recoveredDistanceKm.toFixed(4),
      );

      const durationReferenceTimestamp =
        state.sessionStatus === 'paused' &&
        state.pausedAt !== null
          ? state.pausedAt
          : mergedRoutePoints[
              mergedRoutePoints.length - 1
            ]?.timestamp ?? Date.now();

      const durationSeconds = calculateDurationSeconds(
        state.startedAt,
        durationReferenceTimestamp,
        state.totalPausedMs,
      );

      const splits = calculateCompletedSplits(
        state.splits,
        roundedDistanceKm,
        durationSeconds,
      );

      return {
        routePoints: mergedRoutePoints,
        lastRoutePoint:
          state.sessionStatus === 'running'
            ? mergedRoutePoints[
                mergedRoutePoints.length - 1
              ] ?? null
            : null,
        distanceKm: roundedDistanceKm,
        durationSeconds,
        averagePaceSecondsPerKm:
          calculateAveragePaceSecondsPerKm(
            durationSeconds,
            roundedDistanceKm,
          ),
        splits,
      };
    }),

  addRoutePoint: (point) =>
    set((state) => {
      if (state.sessionStatus !== 'running') {
        return state;
      }

      if (
        !Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90 ||
        !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180 ||
        !Number.isFinite(point.timestamp) ||
        state.routePoints.some((existingPoint) =>
          existingPoint.timestamp === point.timestamp &&
          existingPoint.latitude === point.latitude &&
          existingPoint.longitude === point.longitude,
        )
      ) {
        return state;
      }

      let newDistance = state.distanceKm;

      if (state.lastRoutePoint) {
        const delta = calculateDistanceKm(state.lastRoutePoint, point);
        newDistance += delta;
      }

      const roundedDistanceKm = Number(newDistance.toFixed(4));

      const durationSeconds = calculateDurationSeconds(
        state.startedAt,
        point.timestamp,
        state.totalPausedMs,
      );

      const splits = calculateCompletedSplits(
        state.splits,
        roundedDistanceKm,
        durationSeconds,
      );
      const newSplits = splits.slice(state.splits.length);
      const latestNewSplit = newSplits[newSplits.length - 1];

      if (latestNewSplit) {
        voicePrompts.speakText(
          createKilometerVoicePrompt(
            latestNewSplit,
            durationSeconds,
          ),
        );
      }

      return {
        routePoints: [...state.routePoints, point],
        lastRoutePoint: point,
        distanceKm: roundedDistanceKm,
        durationSeconds,
        averagePaceSecondsPerKm: calculateAveragePaceSecondsPerKm(
          durationSeconds,
          roundedDistanceKm,
        ),
        splits,
      };
    }),

  tick: () =>
    set((state) => {
      if (state.sessionStatus !== 'running') {
        return state;
      }

      const durationSeconds = calculateDurationSeconds(
        state.startedAt,
        Date.now(),
        state.totalPausedMs,
      );

      return {
        durationSeconds,
        averagePaceSecondsPerKm: calculateAveragePaceSecondsPerKm(
          durationSeconds,
          state.distanceKm,
        ),
      };
    }),

  setWeather: (weather) =>
    set({
      weather,
    }),
}));
