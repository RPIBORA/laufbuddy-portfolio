import { create } from 'zustand';

import type { Run } from '../core/runs/runTypes';
import {
  addNewActiveShoe as addNewActiveShoeToCollection,
  activateExistingShoe as activateExistingShoeInCollection,
  type CreateShoeParams,
} from '../core/shoes/shoeActivation';
import { applyCompletedRunToShoe } from '../core/shoes/shoeMileage';
import { reassignCompletedRunToDifferentShoe } from '../core/shoes/shoeRunCorrection';
import { calculateShoeStatus } from '../core/shoes/shoeStatus';
import type { Shoe } from '../core/shoes/shoeTypes';

export interface UpdateShoeFields {
  displayName?: string;
  brand?: string | null;
  model?: string | null;
  shoeSize?: number | null;
  replacementKm?: number;
}

interface ShoeStoreState {
  shoes: Shoe[];
  getActiveShoe: () => Shoe | null;
  getParkedShoes: () => Shoe[];
  addNewActiveShoe: (params: CreateShoeParams) => void;
  activateExistingShoe: (shoeId: string) => void;
  updateShoe: (shoeId: string, updates: UpdateShoeFields) => void;
  applyCompletedRun: (run: Run) => void;
  reassignCompletedRun: (run: Run, nextShoeId: string) => Run;
}

function requireShoe(shoes: Shoe[], shoeId: string): Shoe {
  const shoe = shoes.find((entry) => entry.id === shoeId);

  if (!shoe) {
    throw new Error(`Shoe was not found: ${shoeId}`);
  }

  return shoe;
}

function normalizeUpdatedDisplayName(
  currentDisplayName: string,
  nextDisplayName: string | undefined,
): string {
  if (nextDisplayName === undefined) {
    return currentDisplayName;
  }

  const trimmed = nextDisplayName.trim();

  if (!trimmed) {
    throw new Error('Shoe displayName cannot be empty.');
  }

  return trimmed;
}

function normalizeUpdatedReplacementKm(
  currentReplacementKm: number,
  nextReplacementKm: number | undefined,
): number {
  if (nextReplacementKm === undefined) {
    return currentReplacementKm;
  }

  if (nextReplacementKm <= 0) {
    throw new Error('replacementKm must be greater than 0.');
  }

  return nextReplacementKm;
}

export const useShoeStore = create<ShoeStoreState>((set, get) => ({
  shoes: [],

  getActiveShoe: () => {
    const { shoes } = get();
    return shoes.find((shoe) => shoe.isActive) ?? null;
  },

  getParkedShoes: () => {
    const { shoes } = get();
    return shoes.filter((shoe) => !shoe.isActive);
  },

  addNewActiveShoe: (params) => {
    set((state) => ({
      shoes: addNewActiveShoeToCollection(state.shoes, params),
    }));
  },

  activateExistingShoe: (shoeId) => {
    set((state) => ({
      shoes: activateExistingShoeInCollection(state.shoes, shoeId),
    }));
  },

  updateShoe: (shoeId, updates) => {
    set((state) => {
      const targetShoe = requireShoe(state.shoes, shoeId);
      const replacementKm = normalizeUpdatedReplacementKm(
        targetShoe.replacementKm,
        updates.replacementKm,
      );

      const updatedShoe: Shoe = {
        ...targetShoe,
        displayName: normalizeUpdatedDisplayName(
          targetShoe.displayName,
          updates.displayName,
        ),
        brand: updates.brand === undefined ? targetShoe.brand : updates.brand,
        model: updates.model === undefined ? targetShoe.model : updates.model,
        shoeSize:
          updates.shoeSize === undefined ? targetShoe.shoeSize : updates.shoeSize,
        replacementKm,
        status: calculateShoeStatus(targetShoe.currentKm, replacementKm),
      };

      return {
        shoes: state.shoes.map((shoe) =>
          shoe.id === updatedShoe.id ? updatedShoe : shoe,
        ),
      };
    });
  },

  applyCompletedRun: (run) => {
    set((state) => {
      const targetShoe = requireShoe(state.shoes, run.shoeId);
      const updatedShoe = applyCompletedRunToShoe(targetShoe, run);

      return {
        shoes: state.shoes.map((shoe) =>
          shoe.id === updatedShoe.id ? updatedShoe : shoe,
        ),
      };
    });
  },

  reassignCompletedRun: (run, nextShoeId) => {
    let updatedRun: Run | null = null;

    set((state) => {
      const previousShoe = requireShoe(state.shoes, run.shoeId);
      const nextShoe = requireShoe(state.shoes, nextShoeId);

      const result = reassignCompletedRunToDifferentShoe(
        run,
        previousShoe,
        nextShoe,
      );

      updatedRun = result.updatedRun;

      return {
        shoes: state.shoes.map((shoe) => {
          if (shoe.id === result.previousShoe.id) {
            return result.previousShoe;
          }

          if (shoe.id === result.nextShoe.id) {
            return result.nextShoe;
          }

          return shoe;
        }),
      };
    });

    if (!updatedRun) {
      throw new Error('Run reassignment failed.');
    }

    return updatedRun;
  },
}));