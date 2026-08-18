import type { RoutePoint } from './runTrackingTypes';

export type RunCoachMilestoneProgress = {
  distanceKm: number;
  lastRoutePoint: RoutePoint | null;
  lastAnnouncedKilometer: number;
  lastCompletedSplitDurationSeconds: number;
};

export type RunCoachLastRoutePointBoundary =
  'clear-last-route-point';

export function mergeRunCoachMilestoneProgress(
  persistedProgress: RunCoachMilestoneProgress,
  incomingProgress: RunCoachMilestoneProgress,
  lastRoutePointBoundary?: RunCoachLastRoutePointBoundary,
): RunCoachMilestoneProgress {
  const persistedTimestamp =
    persistedProgress.lastRoutePoint?.timestamp ?? -1;
  const incomingTimestamp =
    incomingProgress.lastRoutePoint?.timestamp ?? -1;

  return {
    distanceKm: Math.max(
      persistedProgress.distanceKm,
      incomingProgress.distanceKm,
    ),
    lastRoutePoint:
      lastRoutePointBoundary === 'clear-last-route-point'
        ? null
        : incomingTimestamp > persistedTimestamp
          ? incomingProgress.lastRoutePoint
          : persistedProgress.lastRoutePoint,
    lastAnnouncedKilometer: Math.max(
      persistedProgress.lastAnnouncedKilometer,
      incomingProgress.lastAnnouncedKilometer,
    ),
    lastCompletedSplitDurationSeconds: Math.max(
      persistedProgress.lastCompletedSplitDurationSeconds,
      incomingProgress.lastCompletedSplitDurationSeconds,
    ),
  };
}

export type RunCoachMilestoneAnnouncement = {
  kilometer: number;
  totalDurationSeconds: number;
  averagePaceSecondsPerKm: number;
  splitDurationSeconds: number;
  splitPaceSecondsPerKm: number;
};

function formatRunCoachPaceForVoice(
  paceSecondsPerKm: number,
): string | null {
  if (
    !Number.isFinite(paceSecondsPerKm) ||
    paceSecondsPerKm <= 0
  ) {
    return null;
  }

  const roundedPaceSeconds = Math.round(paceSecondsPerKm);
  const minutes = Math.floor(roundedPaceSeconds / 60);
  const seconds = roundedPaceSeconds % 60;

  if (seconds === 0) {
    return `${minutes} Minuten pro Kilometer`;
  }

  return `${minutes} Minuten ${seconds} Sekunden pro Kilometer`;
}

function formatRunCoachDurationForVoice(
  durationSeconds: number,
): string {
  const safeDurationSeconds = Math.max(
    0,
    Math.floor(durationSeconds),
  );
  const hours = Math.floor(safeDurationSeconds / 3600);
  const minutes = Math.floor(
    (safeDurationSeconds % 3600) / 60,
  );
  const seconds = safeDurationSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(
      `${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`,
    );
  }

  if (minutes > 0) {
    parts.push(
      `${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`,
    );
  }

  if (seconds > 0 || parts.length === 0) {
    parts.push(
      `${seconds} ${seconds === 1 ? 'Sekunde' : 'Sekunden'}`,
    );
  }

  return parts.join(' ');
}

export function createRunCoachAnnouncementText(
  announcement: RunCoachMilestoneAnnouncement,
): string {
  const messages = [
    `Kilometer ${announcement.kilometer}.`,
    `Gesamtzeit ${formatRunCoachDurationForVoice(
      announcement.totalDurationSeconds,
    )}.`,
  ];

  const averagePaceText = formatRunCoachPaceForVoice(
    announcement.averagePaceSecondsPerKm,
  );

  if (averagePaceText !== null) {
    messages.push(`Durchschnitt ${averagePaceText}.`);
  }

  const splitPaceText = formatRunCoachPaceForVoice(
    announcement.splitPaceSecondsPerKm,
  );

  if (
    announcement.kilometer > 1 &&
    splitPaceText !== null
  ) {
    messages.push(`Letzter Kilometer ${splitPaceText}.`);
  }

  return messages.join(' ');
}

type AdvanceRunCoachMilestonesInput = {
  progress: RunCoachMilestoneProgress;
  points: RoutePoint[];
  startedAt: number;
  totalPausedMs: number;
};

type AdvanceRunCoachMilestonesResult = {
  progress: RunCoachMilestoneProgress;
  announcements: RunCoachMilestoneAnnouncement[];
};

function calculateDistanceKm(
  firstPoint: RoutePoint,
  secondPoint: RoutePoint,
): number {
  const earthRadiusKm = 6371;
  const toRadians = (value: number): number => value * (Math.PI / 180);

  const latitudeDelta = toRadians(
    secondPoint.latitude - firstPoint.latitude,
  );
  const longitudeDelta = toRadians(
    secondPoint.longitude - firstPoint.longitude,
  );

  const firstLatitude = toRadians(firstPoint.latitude);
  const secondLatitude = toRadians(secondPoint.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    earthRadiusKm *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function advanceRunCoachMilestones({
  progress,
  points,
  startedAt,
  totalPausedMs,
}: AdvanceRunCoachMilestonesInput): AdvanceRunCoachMilestonesResult {
  const nextProgress: RunCoachMilestoneProgress = {
    ...progress,
  };
  const announcements: RunCoachMilestoneAnnouncement[] = [];

  const sortedPoints = [...points].sort(
    (firstPoint, secondPoint) =>
      firstPoint.timestamp - secondPoint.timestamp,
  );

  for (const point of sortedPoints) {
    const previousPoint = nextProgress.lastRoutePoint;

    if (previousPoint === null) {
      nextProgress.lastRoutePoint = point;
      continue;
    }

    const segmentDistanceKm = calculateDistanceKm(
      previousPoint,
      point,
    );

    if (!Number.isFinite(segmentDistanceKm) || segmentDistanceKm <= 0) {
      nextProgress.lastRoutePoint = point;
      continue;
    }

    const distanceBeforeSegment = nextProgress.distanceKm;
    const distanceAfterSegment =
      distanceBeforeSegment + segmentDistanceKm;

    let nextKilometer = nextProgress.lastAnnouncedKilometer + 1;

    while (nextKilometer <= Math.floor(distanceAfterSegment)) {
      const requiredDistanceKm =
        nextKilometer - distanceBeforeSegment;
      const crossingRatio = Math.min(
        1,
        Math.max(0, requiredDistanceKm / segmentDistanceKm),
      );

      const segmentDurationMs = Math.max(
        0,
        point.timestamp - previousPoint.timestamp,
      );
      const crossingTimestamp =
        previousPoint.timestamp +
        segmentDurationMs * crossingRatio;

      const totalDurationSeconds = Math.max(
        0,
        Math.floor(
          (crossingTimestamp - startedAt - totalPausedMs) / 1000,
        ),
      );

      const splitDurationSeconds = Math.max(
        0,
        totalDurationSeconds -
          nextProgress.lastCompletedSplitDurationSeconds,
      );

      announcements.push({
        kilometer: nextKilometer,
        totalDurationSeconds,
        averagePaceSecondsPerKm: Math.round(
          totalDurationSeconds / nextKilometer,
        ),
        splitDurationSeconds,
        splitPaceSecondsPerKm: splitDurationSeconds,
      });

      nextProgress.lastAnnouncedKilometer = nextKilometer;
      nextProgress.lastCompletedSplitDurationSeconds =
        totalDurationSeconds;

      nextKilometer += 1;
    }

    nextProgress.distanceKm = distanceAfterSegment;
    nextProgress.lastRoutePoint = point;
  }

  return {
    progress: nextProgress,
    announcements,
  };
}
