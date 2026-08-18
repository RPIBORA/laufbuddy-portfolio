import type { RoutePoint, RunMode } from './runTrackingTypes';
import { isAcceptedRoutePoint } from './routePointValidation';

export const ACTIVE_RUN_SNAPSHOT_VERSION = 1;

export type ActiveRunRecoverySnapshot = {
  version: number;
  runId: string;
  sessionStatus: 'running' | 'paused';
  runActive: true;
  runMode: RunMode;
  startSource: string;
  startedAt: number;
  pausedAt: number | null;
  totalPausedMs: number;
  durationSeconds: number;
  distanceKm: number;
  routePoints: RoutePoint[];
  lastRoutePoint: RoutePoint | null;
  splits: unknown[];
  pauses: unknown[];
  buddyMode: 'solo' | 'shared';
  autoPauseActive: boolean;
  updatedAt: number;
  [key: string]: unknown;
};

function finite(value: unknown, minimum?: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && (minimum === undefined || value >= minimum);
}

export function validRecoveryRoutePoint(point: unknown): point is RoutePoint {
  if (!point || typeof point !== 'object') return false;
  const value = point as Partial<RoutePoint>;
  return finite(value.latitude) && value.latitude >= -90 && value.latitude <= 90 && finite(value.longitude) && value.longitude >= -180 && value.longitude <= 180 && finite(value.timestamp, 0) && (value.accuracyMeters === null || finite(value.accuracyMeters, 0)) && (value.altitudeMeters === null || finite(value.altitudeMeters)) && (value.headingDegrees === null || finite(value.headingDegrees)) && (value.speedMetersPerSecond === null || finite(value.speedMetersPerSecond));
}

function validRunMode(value: unknown): value is RunMode {
  return value === 'Solo-Lauf' || value === 'Gemeinsamer Lauf';
}

export function runPointIdentity(runId: string, point: RoutePoint): string {
  return `${runId}:${point.timestamp}:${point.latitude}:${point.longitude}`;
}

export function parseActiveRunRecoverySnapshot(raw: string | null): ActiveRunRecoverySnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ActiveRunRecoverySnapshot>;
    const paused = value.sessionStatus === 'paused';
    if (value.version !== ACTIVE_RUN_SNAPSHOT_VERSION || typeof value.runId !== 'string' || !value.runId.trim() || (value.sessionStatus !== 'running' && value.sessionStatus !== 'paused') || value.runActive !== true || !validRunMode(value.runMode) || typeof value.startSource !== 'string' || !value.startSource || !finite(value.startedAt, 0) || !finite(value.updatedAt, value.startedAt) || (paused ? !finite(value.pausedAt, value.startedAt) : value.pausedAt !== null) || !finite(value.totalPausedMs, 0) || !finite(value.durationSeconds, 0) || !finite(value.distanceKm, 0) || !Array.isArray(value.routePoints) || !value.routePoints.every(validRecoveryRoutePoint) || (value.lastRoutePoint !== null && !validRecoveryRoutePoint(value.lastRoutePoint)) || !Array.isArray(value.splits) || !Array.isArray(value.pauses) || (value.buddyMode !== 'solo' && value.buddyMode !== 'shared') || typeof value.autoPauseActive !== 'boolean' || (value.autoPauseActive && !paused)) return null;
    return value as ActiveRunRecoverySnapshot;
  } catch { return null; }
}

export function isNewRecoveryRunPoint(runId: string, expectedRunId: string | null, point: RoutePoint, existingPoints: RoutePoint[]): boolean {
  return expectedRunId === runId && validRecoveryRoutePoint(point) && !existingPoints.some((existing) => runPointIdentity(runId, existing) === runPointIdentity(runId, point));
}

/**
 * Revalidates persisted background points before they enter the live run state.
 * A segment boundary deliberately starts with no predecessor so the first
 * point after a pause is not compared with the point before that pause.
 */
export function filterRecoveredRoutePoints(
  runId: string,
  expectedRunId: string | null,
  points: RoutePoint[],
  existingPoints: RoutePoint[],
  previousPoint: RoutePoint | null,
  segmentBoundary: boolean,
): RoutePoint[] {
  if (!runId || expectedRunId !== runId) return [];

  const knownIdentities = new Set(
    existingPoints.map((point) => runPointIdentity(runId, point)),
  );
  const orderedPoints = points
    .map((point, index) => ({ point, index }))
    .sort((left, right) =>
      left.point.timestamp - right.point.timestamp || left.index - right.index,
    )
    .map(({ point }) => point);

  let previous = segmentBoundary ? null : previousPoint;
  const accepted: RoutePoint[] = [];

  for (const point of orderedPoints) {
    const identity = runPointIdentity(runId, point);
    if (
      knownIdentities.has(identity) ||
      !validRecoveryRoutePoint(point) ||
      !isAcceptedRoutePoint(previous, point)
    ) {
      continue;
    }

    knownIdentities.add(identity);
    accepted.push(point);
    previous = point;
  }

  return accepted;
}
