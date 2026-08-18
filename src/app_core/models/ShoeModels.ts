// src/app_core/models/ShoeModels.ts

export type ShoeStatus = 'active' | 'parked' | 'retired';

export type SurfaceType =
  | 'unknown'
  | 'asphalt'
  | 'gravel'
  | 'trail'
  | 'track'
  | 'treadmill'
  | 'mixed';

export type RunPurpose =
  | 'unknown'
  | 'easy'
  | 'long_run'
  | 'interval'
  | 'tempo'
  | 'recovery'
  | 'race'
  | 'walk';

export type PainArea =
  | 'none'
  | 'foot'
  | 'ankle'
  | 'shin'
  | 'knee'
  | 'hip'
  | 'back'
  | 'multiple'
  | 'other';

export type ShoeRunFeeling =
  | 'unknown'
  | 'good'
  | 'okay'
  | 'bad';

export type ShoeIssueCategory =
  | 'none'
  | 'fit'
  | 'cushioning'
  | 'stability'
  | 'pressure_rubbing'
  | 'other';

export type ShoeIssueType =
  | 'none'
  | 'too_tight'
  | 'too_loose'
  | 'pressure'
  | 'rubbing'
  | 'unstable'
  | 'too_hard'
  | 'too_soft'
  | 'other';

export type ShoeIssueArea =
  | 'none'
  | 'heel'
  | 'toes'
  | 'ball'
  | 'arch'
  | 'instep'
  | 'ankle'
  | 'sole'
  | 'other';

export interface Shoe {
  id: string;

  // Anzeige
  name: string;
  brand: string | null;
  model: string | null;
  shoeSize: string | null;

  // Nutzung
  currentKm: number;
  maxKm: number;
  runsCount: number;

  // Zeit
  createdAt: number;
  firstRunAt: number | null;
  lastRunAt: number | null;

  // Status
  status: ShoeStatus;

  // Bewertung
  averagePaceSecondsPerKm: number | null;

  // Optional
  notes: string | null;
}

export interface RunSplitEntry {
  splitIndex: number;
  splitDistanceKm: number;
  durationSeconds: number;
  paceSecondsPerKm: number | null;
}

export interface RunWeatherSnapshot {
  weatherType: string | null;
  temperatureCelsius: number | null;
  feelsLikeCelsius: number | null;
  humidityPercent: number | null;
  windSpeedKph: number | null;
  precipitationMm: number | null;
  isRain: boolean | null;
  isSnow: boolean | null;
}

export interface RunRoutePointSnapshot {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracyMeters: number | null;
  altitudeMeters: number | null;
  headingDegrees: number | null;
  speedMetersPerSecond: number | null;
}

export type RunPauseSource = 'auto' | 'manual';

export interface RunPauseLocationSnapshot {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracyMeters: number | null;
  altitudeMeters: number | null;
  headingDegrees: number | null;
  speedMetersPerSecond: number | null;
}

export interface RunPauseEntry {
  id: string;
  source: RunPauseSource;
  label: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  location: RunPauseLocationSnapshot | null;
}

export interface RunPauseSummary {
  pauseCount: number;
  totalPauseDurationMs: number;
}

export interface RunRouteSummary {
  routeDistanceKm: number;
  routeFingerprint: string | null;
  routeGroupId: string | null;

  // Vollständige GPS-Spur für spätere Karten-/Streckenansicht.
  // Optional, damit alte gespeicherte Läufe weiter lesbar bleiben.
  routePoints?: RunRoutePointSnapshot[];

  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;

  elevationGainMeters: number | null;
  elevationLossMeters: number | null;
  maxAltitudeMeters: number | null;
  minAltitudeMeters: number | null;

  climbIntensity: number | null;
  descentIntensity: number | null;
  flatRatio: number | null;

  surfaceType: SurfaceType;
}

export interface RunContextSnapshot {
  timeOfDay: string | null;
  weekday: number | null;
  weather: RunWeatherSnapshot;
}

export interface RunSafetySnapshot {
  runMode: string;
  buddyConnectedRatio: number | null;
  headsetConnectedRatio: number | null;
}

export interface RunPerformanceSnapshot {
  averageSpeedKph: number | null;
  maxSpeedKph: number | null;

  stepsTotal: number | null;
  averageCadenceSpm: number | null;
  maxCadenceSpm: number | null;

  averageHeartRateBpm: number | null;
  maxHeartRateBpm: number | null;
}

export interface RunBodySnapshot {
  bodyWeightKgAtRunStart: number | null;
}

export interface RunFeedbackSnapshot {
  runPurpose: RunPurpose;
  shoeComfortRating: number | null;
  painAfterRun: boolean | null;
  painArea: PainArea;
  painIntensity: number | null;

  // Freiwilliges Schuhgefühl direkt nach dem Lauf.
  // Optional, damit alte gespeicherte Läufe weiter lesbar bleiben.
  shoeRunFeeling?: ShoeRunFeeling | null;
  shoeIssueCategory?: ShoeIssueCategory | null;
  shoeIssueType?: ShoeIssueType | null;
  shoeIssueArea?: ShoeIssueArea | null;
}

export interface RunShoeSnapshot {
  shoeId: string;

  // Snapshot-Daten zum Zeitpunkt des Laufs
  shoeName: string;
  shoeBrand: string | null;
  shoeModel: string | null;

  shoeKmAtRunStart: number | null;
  shoeAgeDaysAtRunStart: number | null;
}

export interface RunHistoryEntry {
  id: string;

  // Zeit
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number;

  // Leistung
  distanceKm: number;
  averagePaceSecondsPerKm: number | null;
  splits: RunSplitEntry[];

  // Schuh
  shoe: RunShoeSnapshot;

  // Strecke
  route: RunRouteSummary;

  // Pausen
  // Optional, damit alte gespeicherte Läufe weiter lesbar bleiben.
  pauseSummary?: RunPauseSummary;
  pauses?: RunPauseEntry[];

  // Kontext
  context: RunContextSnapshot;

  // Sicherheit / Laufkontext
  safety: RunSafetySnapshot;

  // Performance / Körper / Feedback
  performance: RunPerformanceSnapshot;
  body: RunBodySnapshot;
  feedback: RunFeedbackSnapshot;

  // Optional
  notes: string | null;
}
