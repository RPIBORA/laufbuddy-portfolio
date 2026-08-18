import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRunStatus } from '../app_core/state/useRunStatus';
import type { ActiveRunState, RoutePoint } from '../core/runs/runTrackingTypes';
import {
  ACTIVE_RUN_SNAPSHOT_VERSION,
  isNewRecoveryRunPoint,
  parseActiveRunRecoverySnapshot,
  runPointIdentity,
} from '../core/runs/activeRunRecoverySchema';

export const ACTIVE_RUN_SNAPSHOT_STORAGE_KEY = 'laufbuddy-active-run-v1';
let writeQueue: Promise<void> = Promise.resolve();
let recoveryInitialised = false;

export type ActiveRunSnapshot = Pick<ActiveRunState,
  'runId' | 'sessionStatus' | 'runActive' | 'runMode' | 'startSource' |
  'startedAt' | 'pausedAt' | 'totalPausedMs' | 'durationSeconds' | 'distanceKm' |
  'shoeId' | 'routePoints' | 'lastRoutePoint' | 'splits' | 'pauseSummary' |
  'pauses' | 'buddyConnectedAtStart' | 'weather' | 'headsetConnectedAtStart' |
  'hotwordAvailableAtStart' | 'safetyActiveAtStart' | 'connectionDropEvents' |
  'headsetDropEvents' | 'emergencyTriggered' | 'emergencyType' | 'routeFingerprint' |
  'routeGroupId' | 'averagePaceSecondsPerKm'> & {
  version: number;
  updatedAt: number;
  buddyMode: 'solo' | 'shared';
  autoPauseActive: boolean;
};

export function parseActiveRunSnapshot(raw: string | null): ActiveRunSnapshot | null {
  return parseActiveRunRecoverySnapshot(raw) as ActiveRunSnapshot | null;
}

export async function loadActiveRunSnapshot(): Promise<ActiveRunSnapshot | null> {
  return parseActiveRunSnapshot(await AsyncStorage.getItem(ACTIVE_RUN_SNAPSHOT_STORAGE_KEY));
}

export function isNewRunPoint(runId: string, expectedRunId: string | null, point: RoutePoint, existingPoints: RoutePoint[]): boolean {
  return isNewRecoveryRunPoint(runId, expectedRunId, point, existingPoints);
}

export { ACTIVE_RUN_SNAPSHOT_VERSION, runPointIdentity };

export function queueActiveRunSnapshot(state: ActiveRunState): Promise<void> {
  if (!state.runId || (state.sessionStatus !== 'running' && state.sessionStatus !== 'paused')) return Promise.resolve();
  const latestPause = state.pauses?.[state.pauses.length - 1] ?? null;
  const snapshot: ActiveRunSnapshot = {
    version: ACTIVE_RUN_SNAPSHOT_VERSION, runId: state.runId, sessionStatus: state.sessionStatus,
    runActive: true, runMode: state.runMode, startSource: state.startSource, startedAt: state.startedAt,
    pausedAt: state.pausedAt, totalPausedMs: state.totalPausedMs, durationSeconds: state.durationSeconds,
    distanceKm: state.distanceKm, shoeId: state.shoeId, routePoints: state.routePoints,
    lastRoutePoint: state.lastRoutePoint, splits: state.splits, pauseSummary: state.pauseSummary,
    pauses: state.pauses, buddyConnectedAtStart: state.buddyConnectedAtStart, weather: state.weather,
    headsetConnectedAtStart: state.headsetConnectedAtStart, hotwordAvailableAtStart: state.hotwordAvailableAtStart,
    safetyActiveAtStart: state.safetyActiveAtStart, connectionDropEvents: state.connectionDropEvents,
    headsetDropEvents: state.headsetDropEvents, emergencyTriggered: state.emergencyTriggered,
    emergencyType: state.emergencyType, routeFingerprint: state.routeFingerprint, routeGroupId: state.routeGroupId,
    averagePaceSecondsPerKm: state.averagePaceSecondsPerKm,
    buddyMode: state.runMode === 'Gemeinsamer Lauf' ? 'shared' : 'solo',
    autoPauseActive: state.sessionStatus === 'paused' && latestPause?.source === 'auto' && latestPause.endedAt === null,
    updatedAt: Date.now(),
  };
  const operation = writeQueue.catch(() => undefined).then(() => AsyncStorage.setItem(ACTIVE_RUN_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot)));
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export function clearActiveRunSnapshot(runId?: string | null): Promise<void> {
  const operation = writeQueue.catch(() => undefined).then(async () => {
    if (runId) {
      const current = await loadActiveRunSnapshot();
      if (current?.runId !== runId) return;
    }
    await AsyncStorage.removeItem(ACTIVE_RUN_SNAPSHOT_STORAGE_KEY);
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export async function initialiseActiveRunRecovery(): Promise<ActiveRunSnapshot | null> {
  if (recoveryInitialised) return null;
  recoveryInitialised = true;
  return loadActiveRunSnapshot();
}

export function restoreActiveRunSnapshot(snapshot: ActiveRunSnapshot): boolean {
  const current = useRunStatus.getState();
  if ((current.sessionStatus === 'running' || current.sessionStatus === 'paused') && current.runId !== snapshot.runId) return false;
  if (current.runId === snapshot.runId && (current.sessionStatus === 'running' || current.sessionStatus === 'paused')) return false;
  useRunStatus.setState({ ...snapshot, runPrepared: false, endedAt: null, failureReason: null });
  return true;
}
