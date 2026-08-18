import {
  advanceRunCoachMilestones,
  mergeRunCoachMilestoneProgress,
  type RunCoachMilestoneProgress,
} from './runCoachMilestone';
import type { RoutePoint } from './runTrackingTypes';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createRoutePoint(
  latitude: number,
  longitude: number,
  timestamp: number,
): RoutePoint {
  return {
    latitude,
    longitude,
    timestamp,
    accuracyMeters: 5,
    altitudeMeters: null,
    headingDegrees: null,
    speedMetersPerSecond: null,
  };
}

export function runRunCoachPauseBoundarySmokeCheck(): string {
  const pointBeforePause = createRoutePoint(
    52.52,
    13.405,
    1_000,
  );
  const newerPoint = createRoutePoint(
    52.521,
    13.405,
    2_000,
  );
  const persistedProgress: RunCoachMilestoneProgress = {
    distanceKm: 3.2,
    lastRoutePoint: pointBeforePause,
    lastAnnouncedKilometer: 3,
    lastCompletedSplitDurationSeconds: 1_500,
  };
  const newerProgress: RunCoachMilestoneProgress = {
    distanceKm: 3.3,
    lastRoutePoint: newerPoint,
    lastAnnouncedKilometer: 3,
    lastCompletedSplitDurationSeconds: 1_520,
  };

  const monotonicallyMerged = mergeRunCoachMilestoneProgress(
    persistedProgress,
    newerProgress,
  );

  assert(
    monotonicallyMerged.distanceKm === 3.3 &&
      monotonicallyMerged.lastRoutePoint === newerPoint &&
      monotonicallyMerged.lastAnnouncedKilometer === 3 &&
      monotonicallyMerged.lastCompletedSplitDurationSeconds === 1_520,
    'Normaler monotoner Hintergrundfortschritt muss erhalten bleiben.',
  );

  const ordinaryNullProgress: RunCoachMilestoneProgress = {
    distanceKm: 2.9,
    lastRoutePoint: null,
    lastAnnouncedKilometer: 2,
    lastCompletedSplitDurationSeconds: 1_400,
  };
  const ordinaryNullMerge = mergeRunCoachMilestoneProgress(
    persistedProgress,
    ordinaryNullProgress,
  );

  assert(
    ordinaryNullMerge.lastRoutePoint === pointBeforePause,
    'Ein gewöhnliches null darf den persistenten Routenanker nicht löschen.',
  );

  const pauseBoundaryProgress = mergeRunCoachMilestoneProgress(
    persistedProgress,
    ordinaryNullProgress,
    'clear-last-route-point',
  );

  assert(
    pauseBoundaryProgress.lastRoutePoint === null,
    'Die ausdrückliche Pausengrenze muss lastRoutePoint löschen.',
  );
  assert(
    pauseBoundaryProgress.distanceKm === persistedProgress.distanceKm &&
      pauseBoundaryProgress.lastAnnouncedKilometer ===
        persistedProgress.lastAnnouncedKilometer &&
      pauseBoundaryProgress.lastCompletedSplitDurationSeconds ===
        persistedProgress.lastCompletedSplitDurationSeconds,
    'Die Pausengrenze darf nur lastRoutePoint löschen.',
  );

  const firstPointAfterResume = createRoutePoint(
    48.137,
    11.575,
    10_000,
  );
  const afterFirstPoint = advanceRunCoachMilestones({
    progress: pauseBoundaryProgress,
    points: [firstPointAfterResume],
    startedAt: 0,
    totalPausedMs: 5_000,
  });

  assert(
    afterFirstPoint.progress.distanceKm ===
      pauseBoundaryProgress.distanceKm,
    'Der erste Punkt nach Resume darf keine Distanz über die Pause addieren.',
  );
  assert(
    afterFirstPoint.progress.lastRoutePoint === firstPointAfterResume,
    'Der erste Punkt nach Resume muss die neue Distanzkette beginnen.',
  );

  const secondPointAfterResume = createRoutePoint(
    48.138,
    11.575,
    11_000,
  );
  const afterSecondPoint = advanceRunCoachMilestones({
    progress: afterFirstPoint.progress,
    points: [secondPointAfterResume],
    startedAt: 0,
    totalPausedMs: 5_000,
  });

  assert(
    afterSecondPoint.progress.distanceKm >
      afterFirstPoint.progress.distanceKm,
    'Spätere Punkte nach Resume müssen wieder normale Distanz addieren.',
  );
  assert(
    afterSecondPoint.progress.distanceKm <
      afterFirstPoint.progress.distanceKm + 0.2,
    'Die spätere Distanz muss dem kurzen Segment nach Resume entsprechen.',
  );

  return 'OK: RunCoach-Pausengrenzen-SmokeCheck erfolgreich.';
}
