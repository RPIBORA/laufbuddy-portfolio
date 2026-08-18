import { isAcceptedRoutePoint } from '../core/runs/routePointValidation';
import { filterRecoveredRoutePoints } from '../core/runs/activeRunRecoverySchema';
import type { RoutePoint } from '../core/runs/runTrackingTypes';

const point = (
  latitude: number,
  longitude: number,
  timestamp: number,
  accuracyMeters = 10,
): RoutePoint => ({
  latitude,
  longitude,
  timestamp,
  accuracyMeters,
  altitudeMeters: null,
  headingDegrees: null,
  speedMetersPerSecond: null,
});

function acceptedSequence(points: RoutePoint[]): RoutePoint[] {
  let previous: RoutePoint | null = null;
  const accepted: RoutePoint[] = [];

  points.forEach((candidate) => {
    if (!isAcceptedRoutePoint(previous, candidate)) return;
    previous = candidate;
    accepted.push(candidate);
  });

  return accepted;
}

const first = point(44.8, 20.4, 1_000);
const validSecond = point(44.8001, 20.4, 3_000);
if (!isAcceptedRoutePoint(null, first)) throw new Error('first valid point must be accepted');
if (!isAcceptedRoutePoint(first, validSecond)) throw new Error('valid point must be accepted');
if (isAcceptedRoutePoint(null, point(91, 20.4, 1_000))) throw new Error('invalid latitude must be rejected');
if (isAcceptedRoutePoint(null, point(44.8, 181, 1_000))) throw new Error('invalid longitude must be rejected');
if (isAcceptedRoutePoint(null, point(44.8, 20.4, 1_000, -1))) throw new Error('negative accuracy must be rejected');
if (isAcceptedRoutePoint(first, point(44.8001, 20.4, 1_000))) throw new Error('duplicate timestamp must be rejected');
if (isAcceptedRoutePoint(first, point(44.8001, 20.4, 999))) throw new Error('older timestamp must be rejected');
if (isAcceptedRoutePoint(first, point(44.80001, 20.4, 3_000))) throw new Error('GPS jitter must be rejected');
if (isAcceptedRoutePoint(first, point(45.8, 20.4, 3_000))) throw new Error('impossible jump must be rejected');
if (isAcceptedRoutePoint(first, point(44.8001, 20.4, 3_000, 26))) throw new Error('bad accuracy must be rejected');

const sequence = [
  first,
  point(45.8, 20.4, 3_000),
  validSecond,
  point(44.80011, 20.4, 5_000),
  point(44.8002, 20.4, 7_000),
];
const foregroundAccepted = acceptedSequence(sequence);
const backgroundAccepted = acceptedSequence(sequence);
if (JSON.stringify(foregroundAccepted) !== JSON.stringify(backgroundAccepted)) {
  throw new Error('foreground and background accepted different point sequences');
}
if (foregroundAccepted.length !== 3 || foregroundAccepted[1] !== validSecond) {
  throw new Error('rejected point changed the next distance comparison point');
}

const lastAcceptedByRunId = new Map<string, RoutePoint | null>();
function acceptForRun(runId: string, candidate: RoutePoint): boolean {
  const previous = lastAcceptedByRunId.get(runId) ?? null;
  if (!isAcceptedRoutePoint(previous, candidate)) return false;
  lastAcceptedByRunId.set(runId, candidate);
  return true;
}
if (!acceptForRun('run-a', first)) throw new Error('run A first point rejected');
if (!acceptForRun('run-b', point(44.9, 20.4, 1_000))) throw new Error('run B state was mixed with run A');

const recovered = filterRecoveredRoutePoints(
  'run-a',
  'run-a',
  [
    first,
    point(44.8001, 20.4, 3_000),
    point(44.80011, 20.4, 3_100),
    point(45.8, 20.4, 5_000),
    point(44.8002, 20.4, 5_000),
    point(44.8002, 20.4, 5_000),
  ],
  [first],
  first,
  false,
);
if (recovered.length !== 2) throw new Error('recovery filter accepted an invalid or duplicate point');
if (recovered[0]?.timestamp !== 3_000 || recovered[1]?.timestamp !== 5_000) {
  throw new Error('recovery points were not accepted in stable time order');
}
if (filterRecoveredRoutePoints('run-b', 'run-a', [validSecond], [], null, false).length !== 0) {
  throw new Error('recovery filter mixed run IDs');
}
const afterPause = filterRecoveredRoutePoints(
  'run-a',
  'run-a',
  [point(44.80001, 20.4, 6_000)],
  [first],
  first,
  true,
);
if (afterPause.length !== 1) throw new Error('first valid point after pause was rejected');
if (filterRecoveredRoutePoints('run-a', 'run-a', [point(44.8, 20.4, 7_000, 26)], [], null, true).length !== 0) {
  throw new Error('all-invalid recovery points were not rejected');
}
