import type { ShoeStats } from './shoeStats';
import { compareShoeStats } from './shoeComparison';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createStats(params: {
  shoeId: string;
  shoeName: string;
  totalRuns: number;
  totalDistanceKm: number;
  averagePaceSecondsPerKm: number | null;
  averageSpeedKph: number | null;
  averageHeartRateBpm: number | null;
  averageCadenceSpm: number | null;
  averageComfortRating: number | null;
  painRunRatio: number | null;
}): ShoeStats {
  return {
    shoeId: params.shoeId,
    shoeName: params.shoeName,
    shoeBrand: null,
    shoeModel: null,

    totalRuns: params.totalRuns,
    totalDistanceKm: params.totalDistanceKm,
    totalDurationSeconds: 0,

    averagePaceSecondsPerKm: params.averagePaceSecondsPerKm,
    averageSpeedKph: params.averageSpeedKph,

    totalSteps: null,
    averageCadenceSpm: params.averageCadenceSpm,

    averageHeartRateBpm: params.averageHeartRateBpm,

    averageComfortRating: params.averageComfortRating,

    painRunCount: 0,
    painRunRatio: params.painRunRatio,
    painByMileageBucket: [],

    lastRunAt: null,
  };
}

export function runShoeComparisonSmokeCheck(): string {
  const shoeA = createStats({
    shoeId: 'shoe-a',
    shoeName: 'Schuh A',
    totalRuns: 10,
    totalDistanceKm: 80,
    averagePaceSecondsPerKm: 360,
    averageSpeedKph: 10,
    averageHeartRateBpm: 140,
    averageCadenceSpm: 160,
    averageComfortRating: 4.5,
    painRunRatio: 0.1,
  });

  const shoeB = createStats({
    shoeId: 'shoe-b',
    shoeName: 'Schuh B',
    totalRuns: 8,
    totalDistanceKm: 60,
    averagePaceSecondsPerKm: 390,
    averageSpeedKph: 9.2,
    averageHeartRateBpm: 145,
    averageCadenceSpm: 155,
    averageComfortRating: 3.5,
    painRunRatio: 0.25,
  });

  const report = compareShoeStats(shoeA, shoeB);

  const pace = report.results.find(
    (result) => result.metric === 'averagePaceSecondsPerKm',
  );
  const pain = report.results.find(
    (result) => result.metric === 'painRunRatio',
  );
  const comfort = report.results.find(
    (result) => result.metric === 'averageComfortRating',
  );
  const distance = report.results.find(
    (result) => result.metric === 'totalDistanceKm',
  );

  assert(report.shoeAId === 'shoe-a', 'Schuh A ID fehlt.');
  assert(report.shoeBId === 'shoe-b', 'Schuh B ID fehlt.');

  assert(pace?.betterShoeId === 'shoe-a', 'Bei Pace muss niedriger besser sein.');
  assert(pain?.betterShoeId === 'shoe-a', 'Bei Beschwerden muss niedriger besser sein.');
  assert(
    comfort?.betterShoeId === 'shoe-b',
    'Bei Komfort muss die kleinere Schulnote besser sein.',
  );
  assert(distance?.betterShoeId === 'shoe-a', 'Bei Distanz muss höher besser sein.');

  return 'OK: shoeComparison SmokeCheck erfolgreich.';
}
