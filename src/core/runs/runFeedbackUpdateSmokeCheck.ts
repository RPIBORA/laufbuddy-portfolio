import type { RunHistoryEntry } from '../../app_core/models/ShoeModels';
import { applyRunFeedbackToEntry } from './runFeedbackUpdate';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createRun(id: string): RunHistoryEntry {
  return {
    id,
    startedAt: 1000,
    endedAt: 2000,
    durationSeconds: 1000,

    distanceKm: 5,
    averagePaceSecondsPerKm: 200,
    splits: [],

    shoe: {
      shoeId: 'shoe-a',
      shoeName: 'Schuh A',
      shoeBrand: null,
      shoeModel: null,
      shoeKmAtRunStart: 100,
      shoeAgeDaysAtRunStart: 10,
    },

    route: {
      routeDistanceKm: 5,
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
      timeOfDay: 'morning',
      weekday: 1,
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
      stepsTotal: null,
      averageCadenceSpm: null,
      maxCadenceSpm: null,
      averageHeartRateBpm: null,
      maxHeartRateBpm: null,
    },

    body: {
      bodyWeightKgAtRunStart: null,
    },

    feedback: {
      runPurpose: 'unknown',
      shoeComfortRating: null,
      painAfterRun: null,
      painArea: 'none',
      painIntensity: null,
    },

    notes: null,
  };
}

export function runFeedbackUpdateSmokeCheck(): string {
  const run = createRun('run-1');

  const painfulRun = applyRunFeedbackToEntry(run, {
    runPurpose: 'easy',
    shoeComfortRating: 4,
    painAfterRun: true,
    painArea: 'knee',
    painIntensity: 3,
    notes: 'Knie leicht gespürt.',
  });

  assert(painfulRun.id === 'run-1', 'Run-ID muss erhalten bleiben.');
  assert(painfulRun.feedback.runPurpose === 'easy', 'Laufzweck muss gesetzt werden.');
  assert(painfulRun.feedback.shoeComfortRating === 4, 'Komfort muss gesetzt werden.');
  assert(painfulRun.feedback.painAfterRun === true, 'Beschwerden müssen gesetzt werden.');
  assert(painfulRun.feedback.painArea === 'knee', 'Beschwerdebereich muss Knie sein.');
  assert(painfulRun.feedback.painIntensity === 3, 'Beschwerdestärke muss 3 sein.');
  assert(painfulRun.notes === 'Knie leicht gespürt.', 'Notiz muss gesetzt werden.');

  const painFreeRun = applyRunFeedbackToEntry(painfulRun, {
    painAfterRun: false,
  });

  assert(painFreeRun.feedback.painAfterRun === false, 'Beschwerden müssen auf nein gesetzt werden.');
  assert(painFreeRun.feedback.painArea === 'none', 'Beschwerdebereich muss none sein.');
  assert(painFreeRun.feedback.painIntensity === null, 'Beschwerdestärke muss null sein.');
  assert(painFreeRun.feedback.shoeComfortRating === 4, 'Komfort soll erhalten bleiben.');

  return 'OK: runFeedbackUpdate SmokeCheck erfolgreich.';
}
