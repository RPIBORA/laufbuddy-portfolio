import { ACTIVE_RUN_SNAPSHOT_VERSION, filterRecoveredRoutePoints, isNewRecoveryRunPoint, parseActiveRunRecoverySnapshot } from './activeRunRecoverySchema';

const point = { latitude: 44.8, longitude: 20.4, timestamp: 1000, accuracyMeters: 5, altitudeMeters: null, headingDegrees: null, speedMetersPerSecond: null };
const valid = { version: ACTIVE_RUN_SNAPSHOT_VERSION, runId: 'run-a', sessionStatus: 'running', runActive: true, runMode: 'Solo-Lauf', startSource: 'test', startedAt: 1, pausedAt: null, totalPausedMs: 0, durationSeconds: 0, distanceKm: 0, routePoints: [point], lastRoutePoint: point, splits: [], pauses: [], buddyMode: 'solo', autoPauseActive: false, updatedAt: 2 };

export function runActiveRunRecoverySmokeCheck(): { passed: boolean; errors: string[] } {
  const invalidCases = [
    '{',
    JSON.stringify({ ...valid, version: 99 }),
    JSON.stringify({ ...valid, routePoints: undefined }),
    JSON.stringify({ ...valid, runId: '  ' }),
    JSON.stringify({ ...valid, startedAt: -1 }),
    JSON.stringify({ ...valid, distanceKm: -1 }),
    JSON.stringify({ ...valid, routePoints: [{ ...point, latitude: 100 }] }),
    JSON.stringify({ ...valid, sessionStatus: 'paused', pausedAt: null }),
  ];
  const errors: string[] = [];
  if (!parseActiveRunRecoverySnapshot(JSON.stringify(valid))) errors.push('valid snapshot rejected');
  if (invalidCases.some((raw) => parseActiveRunRecoverySnapshot(raw) !== null)) errors.push('invalid snapshot accepted');
  if (!isNewRecoveryRunPoint('run-a', 'run-a', point, [])) errors.push('valid point rejected');
  if (isNewRecoveryRunPoint('run-b', 'run-a', point, [])) errors.push('run separation failed');
  if (isNewRecoveryRunPoint('run-a', 'run-a', point, [point])) errors.push('duplicate point accepted');
  const filtered = filterRecoveredRoutePoints(
    'run-a',
    'run-a',
    [point, { ...point, timestamp: 3000, latitude: 44.8001 }, { ...point, timestamp: 5000, latitude: 45.8 }],
    [point],
    point,
    false,
  );
  if (filtered.length !== 1 || filtered[0]?.timestamp !== 3000) errors.push('recovery filter did not reject duplicate and impossible points');
  if (filterRecoveredRoutePoints('run-b', 'run-a', [point], [], null, false).length !== 0) errors.push('recovery filter accepted another run ID');
  if (filterRecoveredRoutePoints('run-a', 'run-a', [{ ...point, latitude: 44.80001, timestamp: 3000 }], [point], point, true).length !== 1) errors.push('recovery filter rejected first point after a pause');
  return { passed: errors.length === 0, errors };
}
