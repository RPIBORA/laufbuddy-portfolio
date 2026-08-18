import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {
  advanceRunCoachMilestones,
  createRunCoachAnnouncementText,
  mergeRunCoachMilestoneProgress,
  type RunCoachLastRoutePointBoundary,
  type RunCoachMilestoneProgress,
} from '../core/runs/runCoachMilestone';
import type {
  RoutePoint,
  RunSessionStatus,
} from '../core/runs/runTrackingTypes';
import { speakRunCoachText } from './audioFocusControlService';
import { isAcceptedRoutePoint } from '../core/runs/routePointValidation';

export const RUN_BACKGROUND_LOCATION_TASK =
  'laufbuddy-run-background-location-v1';

const RUN_BACKGROUND_CONTROL_STORAGE_KEY =
  'laufbuddy-run-background-location-control-v1';

const RUN_BACKGROUND_POINTS_STORAGE_KEY =
  'laufbuddy-run-background-location-points-v1';

const MAX_BUFFERED_ROUTE_POINTS = 5000;

export type RunBackgroundLocationPermissionState =
  | 'granted'
  | 'denied'
  | 'undetermined';

export type RunBackgroundLocationControlUpdate = {
  runId?: string | null;
  progress?: RunCoachMilestoneProgress;
  totalPausedMs?: number;
  lastRoutePointBoundary?: RunCoachLastRoutePointBoundary;
};

type RunBackgroundControl = {
  runId: string | null;
  sessionStatus: 'running' | 'paused' | 'inactive';
  startedAt: number | null;
  totalPausedMs: number;
  progress: RunCoachMilestoneProgress;
  lastRoutePointBoundaryRevision: number;
  updatedAt: number;
};

export type BufferedRunRoutePoint = {
  runId: string;
  point: RoutePoint;
};

type BackgroundLocationTaskData = {
  locations?: Location.LocationObject[];
};

let backgroundControlMutationQueue: Promise<void> =
  Promise.resolve();

function queueBackgroundControlMutation<T>(
  mutation: () => Promise<T>,
): Promise<T> {
  const result = backgroundControlMutationQueue.then(
    mutation,
    mutation,
  );

  backgroundControlMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}

function createInitialRunCoachProgress(): RunCoachMilestoneProgress {
  return {
    distanceKm: 0,
    lastRoutePoint: null,
    lastAnnouncedKilometer: 0,
    lastCompletedSplitDurationSeconds: 0,
  };
}

function parseNullableFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : null;
}

function parseRoutePoint(value: unknown): RoutePoint | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<RoutePoint>;

  if (
    typeof candidate.latitude !== 'number' ||
    !Number.isFinite(candidate.latitude) ||
    typeof candidate.longitude !== 'number' ||
    !Number.isFinite(candidate.longitude) ||
    typeof candidate.timestamp !== 'number' ||
    !Number.isFinite(candidate.timestamp)
  ) {
    return null;
  }

  return {
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    timestamp: candidate.timestamp,
    accuracyMeters: parseNullableFiniteNumber(
      candidate.accuracyMeters,
    ),
    altitudeMeters: parseNullableFiniteNumber(
      candidate.altitudeMeters,
    ),
    headingDegrees: parseNullableFiniteNumber(
      candidate.headingDegrees,
    ),
    speedMetersPerSecond: parseNullableFiniteNumber(
      candidate.speedMetersPerSecond,
    ),
  };
}

function parseRunCoachProgress(
  value: unknown,
): RunCoachMilestoneProgress {
  if (value === null || typeof value !== 'object') {
    return createInitialRunCoachProgress();
  }

  const candidate = value as Partial<RunCoachMilestoneProgress>;

  return {
    distanceKm:
      typeof candidate.distanceKm === 'number' &&
      Number.isFinite(candidate.distanceKm) &&
      candidate.distanceKm >= 0
        ? candidate.distanceKm
        : 0,
    lastRoutePoint: parseRoutePoint(candidate.lastRoutePoint),
    lastAnnouncedKilometer:
      typeof candidate.lastAnnouncedKilometer === 'number' &&
      Number.isInteger(candidate.lastAnnouncedKilometer) &&
      candidate.lastAnnouncedKilometer >= 0
        ? candidate.lastAnnouncedKilometer
        : 0,
    lastCompletedSplitDurationSeconds:
      typeof candidate.lastCompletedSplitDurationSeconds === 'number' &&
      Number.isFinite(candidate.lastCompletedSplitDurationSeconds) &&
      candidate.lastCompletedSplitDurationSeconds >= 0
        ? candidate.lastCompletedSplitDurationSeconds
        : 0,
  };
}

function mapPermissionStatus(
  status: Location.PermissionStatus,
): RunBackgroundLocationPermissionState {
  if (status === Location.PermissionStatus.GRANTED) {
    return 'granted';
  }

  if (status === Location.PermissionStatus.DENIED) {
    return 'denied';
  }

  return 'undetermined';
}

function toRoutePoint(location: Location.LocationObject): RoutePoint {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    timestamp: location.timestamp,
    accuracyMeters: location.coords.accuracy ?? null,
    altitudeMeters: location.coords.altitude ?? null,
    headingDegrees: location.coords.heading ?? null,
    speedMetersPerSecond: location.coords.speed ?? null,
  };
}


function parseControl(rawValue: string | null): RunBackgroundControl | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<RunBackgroundControl>;

    if (
      parsed.sessionStatus !== 'running' &&
      parsed.sessionStatus !== 'paused' &&
      parsed.sessionStatus !== 'inactive'
    ) {
      return null;
    }

    return {
      runId: typeof parsed.runId === 'string' && parsed.runId.trim() ? parsed.runId : null,
      sessionStatus: parsed.sessionStatus,
      startedAt:
        typeof parsed.startedAt === 'number' &&
        Number.isFinite(parsed.startedAt)
          ? parsed.startedAt
          : null,
      totalPausedMs:
        typeof parsed.totalPausedMs === 'number' &&
        Number.isFinite(parsed.totalPausedMs) &&
        parsed.totalPausedMs >= 0
          ? parsed.totalPausedMs
          : 0,
      progress: parseRunCoachProgress(parsed.progress),
      lastRoutePointBoundaryRevision:
        typeof parsed.lastRoutePointBoundaryRevision === 'number' &&
        Number.isInteger(parsed.lastRoutePointBoundaryRevision) &&
        parsed.lastRoutePointBoundaryRevision >= 0
          ? parsed.lastRoutePointBoundaryRevision
          : 0,
      updatedAt:
        typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

function parseBufferedPoints(rawValue: string | null): BufferedRunRoutePoint[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry): BufferedRunRoutePoint[] => {
      if (!entry || typeof entry !== 'object') return [];
      const candidate = entry as Partial<BufferedRunRoutePoint>;
      const point = parseRoutePoint(candidate.point);
      return typeof candidate.runId === 'string' && candidate.runId.trim() && point ? [{ runId: candidate.runId, point }] : [];
    });
  } catch {
    return [];
  }
}

async function readBackgroundControl(): Promise<RunBackgroundControl | null> {
  const rawValue = await AsyncStorage.getItem(
    RUN_BACKGROUND_CONTROL_STORAGE_KEY,
  );

  return parseControl(rawValue);
}

async function writeBackgroundControl(
  control: RunBackgroundControl,
): Promise<void> {
  await AsyncStorage.setItem(
    RUN_BACKGROUND_CONTROL_STORAGE_KEY,
    JSON.stringify(control),
  );
}

async function commitBackgroundMilestoneProgress(
  controlSnapshot: RunBackgroundControl,
  progress: RunCoachMilestoneProgress,
): Promise<boolean> {
  return queueBackgroundControlMutation(async () => {
    const latestControl = await readBackgroundControl();

    if (
      latestControl === null ||
      latestControl.sessionStatus !== 'running' ||
      latestControl.startedAt !== controlSnapshot.startedAt ||
      latestControl.lastRoutePointBoundaryRevision !==
        controlSnapshot.lastRoutePointBoundaryRevision
    ) {
      return false;
    }

    await writeBackgroundControl({
      ...latestControl,
      progress: mergeRunCoachMilestoneProgress(
        latestControl.progress,
        progress,
      ),
      updatedAt: Date.now(),
    });

    return true;
  });
}

async function appendBufferedRoutePoints(
  runId: string,
  newPoints: RoutePoint[],
): Promise<RoutePoint[]> {
  if (!runId || newPoints.length === 0) {
    return [];
  }

  const rawValue = await AsyncStorage.getItem(
    RUN_BACKGROUND_POINTS_STORAGE_KEY,
  );

  const existingPoints = parseBufferedPoints(rawValue);
  const knownPoints = new Set(
    existingPoints.map(({ runId: existingRunId, point }) =>
      `${existingRunId}:${point.timestamp}:${point.latitude}:${point.longitude}`,
    ),
  );

  const uniqueNewPoints = newPoints.filter((point) => {
    const key = `${runId}:${point.timestamp}:${point.latitude}:${point.longitude}`;

    if (knownPoints.has(key)) {
      return false;
    }

    knownPoints.add(key);
    return true;
  });

  const sortedUniqueNewPoints = [...uniqueNewPoints].sort(
    (firstPoint, secondPoint) =>
      firstPoint.timestamp - secondPoint.timestamp,
  );

  const nextPoints = [...existingPoints, ...sortedUniqueNewPoints.map((point) => ({ runId, point }))]
    .sort((firstPoint, secondPoint) =>
      firstPoint.point.timestamp - secondPoint.point.timestamp,
    )
    .slice(-MAX_BUFFERED_ROUTE_POINTS);

  await AsyncStorage.setItem(
    RUN_BACKGROUND_POINTS_STORAGE_KEY,
    JSON.stringify(nextPoints),
  );

  return sortedUniqueNewPoints;
}

TaskManager.defineTask<BackgroundLocationTaskData>(
  RUN_BACKGROUND_LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      console.error(
        '[RunBackgroundLocation] Hintergrundaufgabe fehlgeschlagen',
        error,
      );
      return;
    }

    try {
      const control = await readBackgroundControl();

      if (control?.sessionStatus !== 'running') {
        return;
      }

      const locations = Array.isArray(data?.locations)
        ? data.locations
        : [];

      let previous = control.progress.lastRoutePoint;
      const routePoints = locations.map(toRoutePoint).filter((point) => {
        if (!isAcceptedRoutePoint(previous, point)) return false;
        previous = point;
        return true;
      });

      if (!control.runId) return;
      const appendedRoutePoints = await appendBufferedRoutePoints(control.runId, routePoints);

      if (
        appendedRoutePoints.length === 0 ||
        control.startedAt === null
      ) {
        return;
      }

      const milestoneResult = advanceRunCoachMilestones({
        progress: control.progress,
        points: appendedRoutePoints,
        startedAt: control.startedAt,
        totalPausedMs: control.totalPausedMs,
      });

      const progressCommitted =
        await commitBackgroundMilestoneProgress(
          control,
          milestoneResult.progress,
        );

      if (!progressCommitted) {
        console.warn(
          '[RunBackgroundLocation] Veralteter Kilometerstatus verworfen',
        );
        return;
      }

      if (milestoneResult.announcements.length > 0) {
        console.info(
          '[RunBackgroundLocation] Kilometergrenzen erkannt',
          {
            announcements: milestoneResult.announcements,
          },
        );

        for (
          const announcement of
          milestoneResult.announcements
        ) {
          const speechText =
            createRunCoachAnnouncementText(announcement);

          try {
            await speakRunCoachText(speechText);

            console.info(
              '[RunBackgroundLocation] Native Kilometeransage angefordert',
              {
                kilometer: announcement.kilometer,
                speechText,
              },
            );
          } catch (speechError) {
            console.error(
              '[RunBackgroundLocation] Native Kilometeransage fehlgeschlagen',
              {
                kilometer: announcement.kilometer,
                error:
                  speechError instanceof Error
                    ? speechError.message
                    : String(speechError),
              },
            );
          }
        }
      }
    } catch (taskError) {
      console.error(
        '[RunBackgroundLocation] GPS-Punkte konnten nicht gespeichert werden',
        taskError,
      );
    }
  },
);

export async function getRunBackgroundLocationPermissionState():
Promise<RunBackgroundLocationPermissionState> {
  const permissionResponse =
    await Location.getBackgroundPermissionsAsync();

  return mapPermissionStatus(permissionResponse.status);
}

export async function requestRunBackgroundLocationPermission():
Promise<RunBackgroundLocationPermissionState> {
  const permissionResponse =
    await Location.requestBackgroundPermissionsAsync();

  return mapPermissionStatus(permissionResponse.status);
}

export async function setRunBackgroundLocationControl(
  sessionStatus: RunSessionStatus,
  startedAt: number | null,
  update: RunBackgroundLocationControlUpdate = {},
): Promise<void> {
  await queueBackgroundControlMutation(async () => {
    const backgroundSessionStatus: RunBackgroundControl['sessionStatus'] =
      sessionStatus === 'running' || sessionStatus === 'paused'
        ? sessionStatus
        : 'inactive';

    const existingControl = await readBackgroundControl();
    const incomingRunId = typeof update.runId === 'string' && update.runId.trim() ? update.runId : null;
    const sameRun = incomingRunId !== null && existingControl?.runId === incomingRunId;

    const previousProgress = sameRun
      ? existingControl.progress
      : createInitialRunCoachProgress();

    const previousTotalPausedMs = sameRun
      ? existingControl.totalPausedMs
      : 0;

    const previousLastRoutePointBoundaryRevision = sameRun
      ? existingControl.lastRoutePointBoundaryRevision
      : 0;

    const incomingTotalPausedMs =
      typeof update.totalPausedMs === 'number' &&
      Number.isFinite(update.totalPausedMs) &&
      update.totalPausedMs >= 0
        ? update.totalPausedMs
        : previousTotalPausedMs;

    const incomingProgress =
      update.progress !== undefined
        ? parseRunCoachProgress(update.progress)
        : previousProgress;

    const clearLastRoutePoint =
      update.lastRoutePointBoundary ===
      'clear-last-route-point';

    const control: RunBackgroundControl = {
      runId: incomingRunId,
      sessionStatus: backgroundSessionStatus,
      startedAt,
      totalPausedMs: sameRun
        ? Math.max(previousTotalPausedMs, incomingTotalPausedMs)
        : incomingTotalPausedMs,
      progress: sameRun
        ? mergeRunCoachMilestoneProgress(
            previousProgress,
            incomingProgress,
            update.lastRoutePointBoundary,
          )
        : {
            ...incomingProgress,
            lastRoutePoint: clearLastRoutePoint
              ? null
              : incomingProgress.lastRoutePoint,
          },
      lastRoutePointBoundaryRevision:
        previousLastRoutePointBoundaryRevision +
        (clearLastRoutePoint ? 1 : 0),
      updatedAt: Date.now(),
    };

    await writeBackgroundControl(control);

    console.info('[RunBackgroundLocation] Steuerstatus gespeichert', {
      sessionStatus: control.sessionStatus,
      runId: control.runId,
      startedAt: control.startedAt,
      totalPausedMs: control.totalPausedMs,
      distanceKm: control.progress.distanceKm,
      lastAnnouncedKilometer:
        control.progress.lastAnnouncedKilometer,
      lastRoutePointCleared: clearLastRoutePoint,
      lastRoutePointBoundaryRevision:
        control.lastRoutePointBoundaryRevision,
    });
  });
}

export async function clearBufferedRunBackgroundRoutePoints(runId?: string | null):
Promise<void> {
  if (!runId) return;
  await queueBackgroundControlMutation(async () => {
    const entries = parseBufferedPoints(await AsyncStorage.getItem(RUN_BACKGROUND_POINTS_STORAGE_KEY));
    const remaining = entries.filter((entry) => entry.runId !== runId);
    if (remaining.length === 0) await AsyncStorage.removeItem(RUN_BACKGROUND_POINTS_STORAGE_KEY);
    else await AsyncStorage.setItem(RUN_BACKGROUND_POINTS_STORAGE_KEY, JSON.stringify(remaining));
  });
}

export async function drainBufferedRunBackgroundRoutePoints(
  runId: string | null,
  shouldDrain: (() => boolean) | undefined = undefined,
): Promise<RoutePoint[]> {
  if (!runId) return [];
  return queueBackgroundControlMutation(async () => {
    if (shouldDrain && !shouldDrain()) return [];

    const entries = parseBufferedPoints(await AsyncStorage.getItem(RUN_BACKGROUND_POINTS_STORAGE_KEY));
    if (shouldDrain && !shouldDrain()) return [];

    const matching = entries.filter((entry) => entry.runId === runId).map((entry) => entry.point).sort((a, b) => a.timestamp - b.timestamp);
    const remaining = entries.filter((entry) => entry.runId !== runId);
    if (shouldDrain && !shouldDrain()) return [];

    if (remaining.length === 0) await AsyncStorage.removeItem(RUN_BACKGROUND_POINTS_STORAGE_KEY);
    else await AsyncStorage.setItem(RUN_BACKGROUND_POINTS_STORAGE_KEY, JSON.stringify(remaining));
    return matching;
  });
}

export async function startRunBackgroundLocationTracking():
Promise<void> {
  const permissionState = await getRunBackgroundLocationPermissionState();
  if (permissionState !== 'granted') {
    throw new Error(
      'Hintergrundstandort fehlt. Bitte aktiviere ihn für die Hintergrundaufzeichnung.',
    );
  }

  const alreadyStarted =
    await Location.hasStartedLocationUpdatesAsync(
      RUN_BACKGROUND_LOCATION_TASK,
    );

  console.info('[RunBackgroundLocation] Start angefordert', {
    alreadyStarted,
  });

  if (alreadyStarted) {
    return;
  }

  await Location.startLocationUpdatesAsync(
    RUN_BACKGROUND_LOCATION_TASK,
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 3,
      foregroundService: {
        notificationTitle: 'LaufBuddy',
        notificationBody:
          'Dein Lauf wird im Hintergrund aufgezeichnet.',
        killServiceOnDestroy: false,
      },
    },
  );

  console.info('[RunBackgroundLocation] Start abgeschlossen');
}

export async function stopRunBackgroundLocationTracking():
Promise<void> {
  const alreadyStarted =
    await Location.hasStartedLocationUpdatesAsync(
      RUN_BACKGROUND_LOCATION_TASK,
    );

  console.info('[RunBackgroundLocation] Stop angefordert', {
    alreadyStarted,
  });

  if (!alreadyStarted) {
    return;
  }

  await Location.stopLocationUpdatesAsync(
    RUN_BACKGROUND_LOCATION_TASK,
  );

  console.info('[RunBackgroundLocation] Stop abgeschlossen');
}
