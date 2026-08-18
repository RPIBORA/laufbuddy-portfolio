import type { Run } from '../runs/runTypes';
import type { Shoe } from './shoeTypes';
import { applyCompletedRunToShoe, removeCompletedRunFromShoe } from './shoeMileage';

export interface ReassignRunResult {
  updatedRun: Run;
  previousShoe: Shoe;
  nextShoe: Shoe;
}

export function reassignCompletedRunToDifferentShoe(
  run: Run,
  previousShoe: Shoe,
  nextShoe: Shoe,
): ReassignRunResult {
  if (!run.isCompleted) {
    throw new Error('Only completed runs can be reassigned.');
  }

  if (previousShoe.id === nextShoe.id) {
    throw new Error('Previous shoe and next shoe must be different.');
  }

  if (run.shoeId !== previousShoe.id) {
    throw new Error('Run shoeId does not match the previous shoe.');
  }

  const runWithNextShoe: Run = {
    ...run,
    shoeId: nextShoe.id,
  };

  const updatedPreviousShoe = removeCompletedRunFromShoe(previousShoe, run);
  const updatedNextShoe = applyCompletedRunToShoe(nextShoe, runWithNextShoe);

  return {
    updatedRun: runWithNextShoe,
    previousShoe: updatedPreviousShoe,
    nextShoe: updatedNextShoe,
  };
}