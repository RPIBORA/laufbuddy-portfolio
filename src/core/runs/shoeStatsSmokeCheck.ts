import type { RunHistoryEntry } from '../../app_core/models/ShoeModels';
import {
  calculateAllShoeStats,
  calculateShoeStats,
  getShoePainMileageBucket,
} from './shoeStats';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createRun(params: {
  id: string;
  shoeId: string;
  shoeName: string;
  distanceKm: number;
  durationSeconds: number;
  startedAt: number;
  shoeKmAtRunStart: number;
  painAfterRun: boolean | null;
  comfortRating: number | null;
  stepsTotal: number | null;
  averageCadenceSpm: number | null;
  averageHeartRateBpm: number | null;
}): RunHistoryEntry {
  return {
    id: params.id,
    startedAt: params.startedAt,
    endedAt: params.startedAt + params.durationSeconds * 1000,
    durationSeconds: params.durationSeconds,

    distanceKm: params.distanceKm,
    averagePaceSecondsPerKm: Math.round(
      params.durationSeconds / params.distanceKm,
    ),
    splits: [],

    shoe: {
      shoeId: params.shoeId,
      shoeName: params.shoeName,
      shoeBrand: null,
      shoeModel: null,
      shoeKmAtRunStart: params.shoeKmAtRunStart,
      shoeAgeDaysAtRunStart: null,
    },

    route: {
      routeDistanceKm: params.distanceKm,
      routeFingerprint: null,
      routeGroupId: null,
      routePoints: [],
      startLatitude: null,
      startLongitude: null,
      endLatitude: null,
      endLongitude: null,
      elevationGainMeters: null,
      elevationLossMeters: null,
      maxAltitudeMeters: null,
      minAltitudeMeters: null,
      climbIntensity: null,
      descentIntensity: null,
      flatRatio: null,
      surfaceType: 'unknown',
    },

    context: {
      timeOfDay: null,
      weekday: null,
      weather: {
        weatherType: null,
        temperatureCelsius: null,
        feelsLikeCelsius: null,
        humidityPercent: null,
        windSpeedKph: null,
        precipitationMm: null,
        isRain: null,
        isSnow: null,
      },
    },

    safety: {
      runMode: 'Solo-Lauf',
      buddyConnectedRatio: null,
      headsetConnectedRatio: null,
    },

    performance: {
      averageSpeedKph: null,
      maxSpeedKph: null,
      stepsTotal: params.stepsTotal,
      averageCadenceSpm: params.averageCadenceSpm,
      maxCadenceSpm: null,
      averageHeartRateBpm: params.averageHeartRateBpm,
      maxHeartRateBpm: null,
    },

    body: {
      bodyWeightKgAtRunStart: null,
    },

    feedback: {
      runPurpose: 'unknown',
      shoeComfortRating: params.comfortRating,
      painAfterRun: params.painAfterRun,
      painArea: params.painAfterRun ? 'knee' : 'none',
      painIntensity: params.painAfterRun ? 2 : null,
    },

    notes: null,
  };
}

export function runShoeStatsSmokeCheck(): string {
  const runs: RunHistoryEntry[] = [
    createRun({
      id: 'run-a-1',
      shoeId: 'shoe-a',
      shoeName: 'Schuh A',
      distanceKm: 5,
      durationSeconds: 1800,
      startedAt: 1000,
      shoeKmAtRunStart: 10,
      painAfterRun: false,
      comfortRating: 5,
      stepsTotal: 6000,
      averageCadenceSpm: 160,
      averageHeartRateBpm: 140,
    }),
    createRun({
      id: 'run-a-2',
      shoeId: 'shoe-a',
      shoeName: 'Schuh A',
      distanceKm: 10,
      durationSeconds: 3600,
      startedAt: 2000,
      shoeKmAtRunStart: 120,
      painAfterRun: true,
      comfortRating: 3,
      stepsTotal: 12000,
      averageCadenceSpm: 158,
      averageHeartRateBpm: 145,
    }),
    createRun({
      id: 'run-b-1',
      shoeId: 'shoe-b',
      shoeName: 'Schuh B',
      distanceKm: 7,
      durationSeconds: 2800,
      startedAt: 3000,
      shoeKmAtRunStart: 320,
      painAfterRun: false,
      comfortRating: 4,
      stepsTotal: 8500,
      averageCadenceSpm: 155,
      averageHeartRateBpm: 150,
    }),
  ];

  const shoeA = calculateShoeStats('shoe-a', runs);
  const allStats = calculateAllShoeStats(runs);

  assert(shoeA !== null, 'Schuh A Statistik fehlt.');
  assert(shoeA.totalRuns === 2, 'Schuh A sollte 2 Läufe haben.');
  assert(shoeA.totalDistanceKm === 15, 'Schuh A sollte 15 km haben.');
  assert(shoeA.totalSteps === 18000, 'Schuh A sollte 18000 Schritte haben.');
  assert(shoeA.painRunCount === 1, 'Schuh A sollte 1 Beschwerdelauf haben.');
  assert(shoeA.painRunRatio === 0.5, 'Schuh A Beschwerdequote sollte 0.5 sein.');
  assert(shoeA.averageComfortRating === 4, 'Schuh A Komfort Ø sollte 4 sein.');
  assert(allStats.length === 2, 'Es sollten 2 Schuhstatistiken entstehen.');

  assert(getShoePainMileageBucket(10) === '0_50', '10 km muss 0_50 sein.');
  assert(getShoePainMileageBucket(120) === '51_150', '120 km muss 51_150 sein.');
  assert(getShoePainMileageBucket(320) === '301_500', '320 km muss 301_500 sein.');

  return 'OK: shoeStats SmokeCheck erfolgreich.';
}
