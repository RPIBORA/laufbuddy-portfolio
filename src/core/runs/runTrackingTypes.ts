export type RunMode =
  | 'Kein Lauf aktiv'
  | 'Solo-Lauf'
  | 'Gemeinsamer Lauf'
  | 'Gemeinsamer Lauf vorbereitet';

export type EmergencyType = 'none' | 'hilfe' | 'polizei';

export type RunSessionStatus =
  | 'idle'
  | 'prepared'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'failed';

export type RunWeatherSnapshot = {
  weatherType: string | null;
  temperatureCelsius: number | null;
  feelsLikeCelsius: number | null;
  humidityPercent: number | null;
  windSpeedKph: number | null;
  precipitationMm: number | null;
  isRain: boolean | null;
  isSnow: boolean | null;
};

export type RoutePoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracyMeters: number | null;
  altitudeMeters: number | null;
  headingDegrees: number | null;
  speedMetersPerSecond: number | null;
};

export type RunPauseSource = 'auto' | 'manual';

export type RunPauseLocationSnapshot = {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracyMeters: number | null;
  altitudeMeters: number | null;
  headingDegrees: number | null;
  speedMetersPerSecond: number | null;
};

export type RunPauseEntry = {
  id: string;
  source: RunPauseSource;
  label: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  location: RunPauseLocationSnapshot | null;
};

export type RunPauseSummary = {
  pauseCount: number;
  totalPauseDurationMs: number;
};

export type RunSplit = {
  splitIndex: number;
  splitDistanceKm: number;
  durationSeconds: number;
  paceSecondsPerKm: number | null;
};

export type ConnectionDropEvent = {
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number | null;
};

export type HeadsetDropEvent = {
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number | null;
};

export type RunSafetySnapshot = {
  buddyConnectedAtStart: boolean;
  headsetConnectedAtStart: boolean;
  hotwordAvailableAtStart: boolean;
  safetyActiveAtStart: boolean;
};

export type RunSafetySummary = {
  buddyConnectedRatio: number | null;
  headsetConnectedRatio: number | null;
  connectionDropEvents: ConnectionDropEvent[];
  headsetDropEvents: HeadsetDropEvent[];
  emergencyTriggered: boolean;
  emergencyType: EmergencyType;
};

export type RunRouteSummary = {
  routePoints: RoutePoint[];
  routeDistanceKm: number;
  elevationGainMeters: number | null;
  elevationLossMeters: number | null;
  routeFingerprint: string | null;
  routeGroupId: string | null;
};

export type RunContext = {
  notes: string | null;
  weather: RunWeatherSnapshot | null;
  temperatureCelsius: number | null;
};

export type RunRecord = {
  id: string;
  runMode: RunMode;
  sessionStatus: RunSessionStatus;
  startSource: string;
  shoeId: string | null;

  startedAt: number;
  endedAt: number | null;
  durationSeconds: number;

  distanceKm: number;
  averagePaceSecondsPerKm: number | null;

  route: RunRouteSummary;
  splits: RunSplit[];

  pauseSummary?: RunPauseSummary;
  pauses?: RunPauseEntry[];

  safetySnapshot: RunSafetySnapshot;
  safetySummary: RunSafetySummary;

  context: RunContext;
};

export type ActiveRunState = {
  runId: string | null;
  sessionStatus: RunSessionStatus;

  runActive: boolean;
  runPrepared: boolean;
  runMode: RunMode;
  startSource: string;

  startedAt: number | null;
  endedAt: number | null;
  pausedAt: number | null;
  totalPausedMs: number;
  durationSeconds: number;
  distanceKm: number;
  averagePaceSecondsPerKm: number | null;

  shoeId: string | null;

  routePoints: RoutePoint[];
  lastRoutePoint: RoutePoint | null;
  routeFingerprint: string | null;
  routeGroupId: string | null;

  splits: RunSplit[];

  pauseSummary?: RunPauseSummary;
  pauses?: RunPauseEntry[];

  weather: RunWeatherSnapshot | null;

  buddyConnectedAtStart: boolean;
  headsetConnectedAtStart: boolean;
  hotwordAvailableAtStart: boolean;
  safetyActiveAtStart: boolean;

  connectionDropEvents: ConnectionDropEvent[];
  headsetDropEvents: HeadsetDropEvent[];
  emergencyTriggered: boolean;
  emergencyType: EmergencyType;

  failureReason: string | null;
};
