// src/app_core/state/useShoeStatus.ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Shoe } from '../models/ShoeModels';
import {
  queueShoeFirestoreSync,
  queueShoesFirestoreSync,
} from '../../services/dashboardFirestoreSyncService';
import { scopedStorage } from '../../services/localDataScopeService';

type AddShoeParams = {
  name: string;
  maxKm: number;
  brand?: string | null;
  model?: string | null;
  shoeSize?: string | null;
  shoeSizeEu?: number | null;
  notes?: string | null;
};

type ShoeUsageStats = {
  currentKm: number;
  runsCount: number;
  firstRunAt: number | null;
  lastRunAt: number | null;
};

type ShoeStatusState = {
  shoes: Shoe[];
  resetForAccountScope: () => void;
  addShoe: (params: AddShoeParams) => void;
  configureInitialShoe: (params: AddShoeParams) => void;
  setActiveShoe: (id: string) => void;
  updateShoeKm: (id: string, kmDelta: number) => void;
  setShoeUsageStats: (id: string, usage: ShoeUsageStats) => void;
  getActiveShoe: () => Shoe | null;
};

const SHOE_STATUS_STORAGE_KEY = 'laufbuddy_shoe_status_v1';

const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
};

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim() ?? '';

  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeMaxKm(maxKm: number): number {
  if (!Number.isFinite(maxKm) || maxKm <= 0) {
    return 600;
  }

  return Math.round(maxKm);
}

function createDefaultShoe(): Shoe {
  return {
    id: 'default_shoe_1',

    name: 'Standard Laufschuh',
    brand: null,
    model: null,
    shoeSize: null,

    currentKm: 0,
    maxKm: 600,
    runsCount: 0,

    createdAt: Date.now(),
    firstRunAt: null,
    lastRunAt: null,

    status: 'active',
    averagePaceSecondsPerKm: null,
    notes: null,
  };
}

function sanitizeShoe(shoe: Shoe): Shoe {
  return {
    ...shoe,
    name: normalizeOptionalText(shoe.name) ?? 'Laufschuh',
    brand: normalizeOptionalText(shoe.brand),
    model: normalizeOptionalText(shoe.model),
    shoeSize: normalizeOptionalText(shoe.shoeSize),
    maxKm: normalizeMaxKm(shoe.maxKm),
    currentKm: Number.isFinite(shoe.currentKm) && shoe.currentKm >= 0 ? shoe.currentKm : 0,
    runsCount: Number.isFinite(shoe.runsCount) && shoe.runsCount >= 0 ? shoe.runsCount : 0,
    notes: normalizeOptionalText(shoe.notes),
  };
}

export const useShoeStatus = create<ShoeStatusState>()(
  persist(
    (set, get) => ({
      shoes: [createDefaultShoe()],
      resetForAccountScope: () => set({ shoes: [createDefaultShoe()] }),

      addShoe: ({ name, maxKm, brand = null, model = null, shoeSize = null, notes = null }) =>
        set((state) => {
          const newShoe: Shoe = sanitizeShoe({
            id: generateId(),

            name,
            brand,
            model,
            shoeSize,

            currentKm: 0,
            maxKm,
            runsCount: 0,

            createdAt: Date.now(),
            firstRunAt: null,
            lastRunAt: null,

            status: state.shoes.length === 0 ? 'active' : 'parked',
            averagePaceSecondsPerKm: null,
            notes,
          });

          queueShoeFirestoreSync(newShoe);

          return {
            shoes: [...state.shoes, newShoe],
          };
        }),

      configureInitialShoe: ({ brand, model, shoeSizeEu = null }) => set((state) => {
        const existing = state.shoes.find((shoe) => shoe.brand === brand && shoe.model === model);
        if (existing) return state;
        const placeholder = state.shoes.find((shoe) => shoe.id === 'default_shoe_1' && shoe.currentKm === 0 && shoe.runsCount === 0);
        const name = `${brand ?? ''} ${model ?? ''}`.trim();
        const nextShoes = placeholder
          ? state.shoes.map((shoe) => shoe.id === placeholder.id ? { ...shoe, name, brand: brand ?? null, model: model ?? null, shoeSize: shoeSizeEu === null ? null : String(shoeSizeEu).replace('.', ','), status: 'active' as const } : { ...shoe, status: shoe.status === 'retired' ? 'retired' as const : 'parked' as const })
          : state.shoes;
        queueShoesFirestoreSync(nextShoes);
        return { shoes: nextShoes };
      }),

      setActiveShoe: (id) =>
        set((state) => {
          const nextShoes = state.shoes.map((shoe) => ({
            ...shoe,
            status: (
              shoe.id === id ? 'active' : shoe.status === 'retired' ? 'retired' : 'parked'
            ) as Shoe['status'],
          }));

          queueShoesFirestoreSync(nextShoes);

          return {
            shoes: nextShoes,
          };
        }),

      updateShoeKm: (id, kmDelta) =>
        set((state) => {
          const nextShoes = state.shoes.map((shoe) => {
            if (shoe.id !== id) {
              return shoe;
            }

            const nextCurrentKm = Number((shoe.currentKm + kmDelta).toFixed(2));
            const safeCurrentKm = nextCurrentKm < 0 ? 0 : nextCurrentKm;
            const now = Date.now();
            const isPositiveUpdate = kmDelta > 0;

            return {
              ...shoe,
              currentKm: safeCurrentKm,
              runsCount: isPositiveUpdate ? shoe.runsCount + 1 : shoe.runsCount,
              firstRunAt:
                isPositiveUpdate && shoe.firstRunAt === null ? now : shoe.firstRunAt,
              lastRunAt: isPositiveUpdate ? now : shoe.lastRunAt,
            };
          });

          const updatedShoe = nextShoes.find((shoe) => shoe.id === id) ?? null;

          if (updatedShoe) {
            queueShoeFirestoreSync(updatedShoe);
          }

          return {
            shoes: nextShoes,
          };
        }),

      setShoeUsageStats: (id, usage) =>
        set((state) => {
          const nextShoes = state.shoes.map((shoe) => {
            if (shoe.id !== id) {
              return shoe;
            }

            return {
              ...shoe,
              currentKm: Number(
                Math.max(0, usage.currentKm).toFixed(2),
              ),
              runsCount: Math.max(0, Math.round(usage.runsCount)),
              firstRunAt: usage.firstRunAt,
              lastRunAt: usage.lastRunAt,
            };
          });

          const updatedShoe = nextShoes.find((shoe) => shoe.id === id) ?? null;

          if (updatedShoe) {
            queueShoeFirestoreSync(updatedShoe);
          }

          return {
            shoes: nextShoes,
          };
        }),

      getActiveShoe: () => {
        const activeShoe = get().shoes.find((shoe) => shoe.status === 'active');

        return activeShoe ?? null;
      },
    }),
    {
      name: SHOE_STATUS_STORAGE_KEY,
      storage: createJSONStorage(() => scopedStorage),
      partialize: (state) => ({
        shoes: state.shoes.map(sanitizeShoe),
      }),
      merge: (persistedState, currentState) => {
        const persistedShoes =
          typeof persistedState === 'object' &&
          persistedState !== null &&
          Array.isArray((persistedState as { shoes?: unknown }).shoes)
            ? (persistedState as { shoes: Shoe[] }).shoes.map(sanitizeShoe)
            : [];

        return {
          ...currentState,
          shoes: persistedShoes.length > 0 ? persistedShoes : currentState.shoes,
        };
      },
    },
  ),
);
