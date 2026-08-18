import type { RunHistoryEntry } from '../../app_core/models/ShoeModels';

export type ShoePainMileageBucket =
  | '0_50'
  | '51_150'
  | '151_300'
  | '301_500'
  | '501_700'
  | '701_plus';

export type ShoePainMileageBucketStats = {
  bucket: ShoePainMileageBucket;
  totalRuns: number;
  painRuns: number;
  painRunRatio: number | null;
};

export type ShoeStats = {
  shoeId: string;
  shoeName: string;
  shoeBrand: string | null;
  shoeModel: string | null;

  totalRuns: number;
  totalDistanceKm: number;
  totalDurationSeconds: number;

  averagePaceSecondsPerKm: number | null;
  averageSpeedKph: number | null;

  totalSteps: number | null;
  averageCadenceSpm: number | null;

  averageHeartRateBpm: number | null;

  averageComfortRating: number | null;

  painRunCount: number;
  painRunRatio: number | null;
  painByMileageBucket: ShoePainMileageBucketStats[];

  lastRunAt: number | null;
};

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function average(values: Array<number | null | undefined>): number | null {
  const validValues = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );

  if (validValues.length === 0) {
    return null;
  }

  return round(
    validValues.reduce((sum, value) => sum + value, 0) / validValues.length,
  );
}

function sumNullable(values: Array<number | null | undefined>): number | null {
  const validValues = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );

  if (validValues.length === 0) {
    return null;
  }

  return validValues.reduce((sum, value) => sum + value, 0);
}

function calculatePace(
  totalDurationSeconds: number,
  totalDistanceKm: number,
): number | null {
  if (totalDistanceKm <= 0) {
    return null;
  }

  return Math.round(totalDurationSeconds / totalDistanceKm);
}

export function getShoePainMileageBucket(
  shoeKmAtRunStart: number | null,
): ShoePainMileageBucket {
  if (shoeKmAtRunStart === null || shoeKmAtRunStart <= 50) {
    return '0_50';
  }

  if (shoeKmAtRunStart <= 150) {
    return '51_150';
  }

  if (shoeKmAtRunStart <= 300) {
    return '151_300';
  }

  if (shoeKmAtRunStart <= 500) {
    return '301_500';
  }

  if (shoeKmAtRunStart <= 700) {
    return '501_700';
  }

  return '701_plus';
}

function calculatePainByMileageBucket(
  runs: RunHistoryEntry[],
): ShoePainMileageBucketStats[] {
  const buckets: ShoePainMileageBucket[] = [
    '0_50',
    '51_150',
    '151_300',
    '301_500',
    '501_700',
    '701_plus',
  ];

  return buckets.map((bucket) => {
    const bucketRuns = runs.filter(
      (run) => getShoePainMileageBucket(run.shoe.shoeKmAtRunStart) === bucket,
    );

    const painRuns = bucketRuns.filter(
      (run) => run.feedback?.painAfterRun === true,
    ).length;

    return {
      bucket,
      totalRuns: bucketRuns.length,
      painRuns,
      painRunRatio:
        bucketRuns.length === 0 ? null : round(painRuns / bucketRuns.length, 4),
    };
  });
}

export function calculateShoeStats(
  shoeId: string,
  runs: RunHistoryEntry[],
): ShoeStats | null {
  const shoeRuns = runs.filter((run) => run.shoe.shoeId === shoeId);

  if (shoeRuns.length === 0) {
    return null;
  }

  const firstRun = shoeRuns[0];
  const totalDistanceKm = round(
    shoeRuns.reduce((sum, run) => sum + run.distanceKm, 0),
  );
  const totalDurationSeconds = shoeRuns.reduce(
    (sum, run) => sum + run.durationSeconds,
    0,
  );

  const painRunCount = shoeRuns.filter(
    (run) => run.feedback?.painAfterRun === true,
  ).length;

  return {
    shoeId,
    shoeName: firstRun.shoe.shoeName,
    shoeBrand: firstRun.shoe.shoeBrand,
    shoeModel: firstRun.shoe.shoeModel,

    totalRuns: shoeRuns.length,
    totalDistanceKm,
    totalDurationSeconds,

    averagePaceSecondsPerKm: calculatePace(
      totalDurationSeconds,
      totalDistanceKm,
    ),
    averageSpeedKph: average(
      shoeRuns.map((run) => run.performance?.averageSpeedKph),
    ),

    totalSteps: sumNullable(shoeRuns.map((run) => run.performance?.stepsTotal)),
    averageCadenceSpm: average(
      shoeRuns.map((run) => run.performance?.averageCadenceSpm),
    ),

    averageHeartRateBpm: average(
      shoeRuns.map((run) => run.performance?.averageHeartRateBpm),
    ),

    averageComfortRating: average(
      shoeRuns.map((run) => run.feedback?.shoeComfortRating),
    ),

    painRunCount,
    painRunRatio: round(painRunCount / shoeRuns.length, 4),
    painByMileageBucket: calculatePainByMileageBucket(shoeRuns),

    lastRunAt: Math.max(...shoeRuns.map((run) => run.startedAt)),
  };
}

export function calculateAllShoeStats(runs: RunHistoryEntry[]): ShoeStats[] {
  const shoeIds = Array.from(new Set(runs.map((run) => run.shoe.shoeId)));

  return shoeIds
    .map((shoeId) => calculateShoeStats(shoeId, runs))
    .filter((stats): stats is ShoeStats => stats !== null);
}
