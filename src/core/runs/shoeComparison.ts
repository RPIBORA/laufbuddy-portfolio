import type { ShoeStats } from './shoeStats';

export type ShoeComparisonMetric =
  | 'totalRuns'
  | 'totalDistanceKm'
  | 'averagePaceSecondsPerKm'
  | 'averageSpeedKph'
  | 'averageHeartRateBpm'
  | 'averageCadenceSpm'
  | 'averageComfortRating'
  | 'painRunRatio';

export type ShoeComparisonResult = {
  metric: ShoeComparisonMetric;
  shoeAValue: number | null;
  shoeBValue: number | null;
  difference: number | null;
  betterShoeId: string | null;
};

export type ShoeComparisonReport = {
  shoeAId: string;
  shoeAName: string;
  shoeBId: string;
  shoeBName: string;
  results: ShoeComparisonResult[];
};

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getMetricValue(stats: ShoeStats, metric: ShoeComparisonMetric): number | null {
  return stats[metric];
}

function higherIsBetter(metric: ShoeComparisonMetric): boolean {
  return (
    metric === 'totalRuns' ||
    metric === 'totalDistanceKm' ||
    metric === 'averageSpeedKph' ||
    metric === 'averageHeartRateBpm' ||
    metric === 'averageCadenceSpm'
  );
}

function lowerIsBetter(metric: ShoeComparisonMetric): boolean {
  return (
    metric === 'averagePaceSecondsPerKm' ||
    metric === 'averageComfortRating' ||
    metric === 'painRunRatio'
  );
}

function getBetterShoeId(
  metric: ShoeComparisonMetric,
  shoeAId: string,
  shoeAValue: number | null,
  shoeBId: string,
  shoeBValue: number | null,
): string | null {
  if (shoeAValue === null || shoeBValue === null || shoeAValue === shoeBValue) {
    return null;
  }

  if (higherIsBetter(metric)) {
    return shoeAValue > shoeBValue ? shoeAId : shoeBId;
  }

  if (lowerIsBetter(metric)) {
    return shoeAValue < shoeBValue ? shoeAId : shoeBId;
  }

  return null;
}

export function compareShoeStats(
  shoeA: ShoeStats,
  shoeB: ShoeStats,
): ShoeComparisonReport {
  const metrics: ShoeComparisonMetric[] = [
    'totalRuns',
    'totalDistanceKm',
    'averagePaceSecondsPerKm',
    'averageSpeedKph',
    'averageHeartRateBpm',
    'averageCadenceSpm',
    'averageComfortRating',
    'painRunRatio',
  ];

  return {
    shoeAId: shoeA.shoeId,
    shoeAName: shoeA.shoeName,
    shoeBId: shoeB.shoeId,
    shoeBName: shoeB.shoeName,
    results: metrics.map((metric) => {
      const shoeAValue = getMetricValue(shoeA, metric);
      const shoeBValue = getMetricValue(shoeB, metric);

      return {
        metric,
        shoeAValue,
        shoeBValue,
        difference:
          shoeAValue === null || shoeBValue === null
            ? null
            : round(shoeAValue - shoeBValue),
        betterShoeId: getBetterShoeId(
          metric,
          shoeA.shoeId,
          shoeAValue,
          shoeB.shoeId,
          shoeBValue,
        ),
      };
    }),
  };
}
