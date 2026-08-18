import type { Run } from '../runs/runTypes';
import type { Shoe } from './shoeTypes';
import { calculateShoeStatus } from './shoeStatus';

function assertCompletedRun(run: Run): void {
  if (!run.isCompleted) {
    throw new Error('Only completed runs can change shoe mileage.');
  }

  if (run.distanceKm < 0) {
    throw new Error('Run distance cannot be negative.');
  }
}

export function applyCompletedRunToShoe(shoe: Shoe, run: Run): Shoe {
  assertCompletedRun(run);

  if (run.shoeId !== shoe.id) {
    throw new Error('Run shoeId does not match the target shoe.');
  }

  const nextCurrentKm = shoe.currentKm + run.distanceKm;

  return {
    ...shoe,
    currentKm: nextCurrentKm,
    status: calculateShoeStatus(nextCurrentKm, shoe.replacementKm),
  };
}

export function removeCompletedRunFromShoe(shoe: Shoe, run: Run): Shoe {
  assertCompletedRun(run);

  if (run.shoeId !== shoe.id) {
    throw new Error('Run shoeId does not match the target shoe.');
  }

  const nextCurrentKm = shoe.currentKm - run.distanceKm;

  if (nextCurrentKm < 0) {
    throw new Error('Shoe mileage cannot go below 0.');
  }

  return {
    ...shoe,
    currentKm: nextCurrentKm,
    status: calculateShoeStatus(nextCurrentKm, shoe.replacementKm),
  };
}