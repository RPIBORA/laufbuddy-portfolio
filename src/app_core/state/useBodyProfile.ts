// src/app_core/state/useBodyProfile.ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { queueBodyProfileFirestoreSync } from '../../services/dashboardFirestoreSyncService';
import {
  applyBodyProfileUpdate,
  type BodyProfileGender,
  type BodyProfileSnapshot,
  type BodyProfileUpdate,
} from './bodyProfileSnapshot';
import { scopedStorage } from '../../services/localDataScopeService';
export { normalizeShoeSizeEu, parseShoeSizeEuInput } from './shoeSizeEu';
export type { BodyProfileGender } from './bodyProfileSnapshot';

type BodyProfileState = {
  currentWeightKg: number | null;
  heightCm: number | null;
  gender: BodyProfileGender;
  shoeSizeEu: number | null;
  updatedAt: number | null;

  setCurrentWeightKg: (weightKg: number | null) => void;
  setHeightCm: (heightCm: number | null) => void;
  setGender: (gender: BodyProfileGender) => void;
  setBodyProfile: (profile: BodyProfileUpdate) => void;
  resetForAccountScope: () => void;
};

const BODY_PROFILE_STORAGE_KEY = 'laufbuddy_body_profile_v1';

export const useBodyProfile = create<BodyProfileState>()(
  persist(
    (set) => ({
      currentWeightKg: null,
      heightCm: null,
      gender: null,
      shoeSizeEu: null,
      updatedAt: null,
      resetForAccountScope: () => set({ currentWeightKg: null, heightCm: null, gender: null, shoeSizeEu: null, updatedAt: null }),

      setCurrentWeightKg: (weightKg) => {
        set((state) => {
          const nextProfile = applyBodyProfileUpdate(state, {
            currentWeightKg: weightKg,
          });

          queueBodyProfileFirestoreSync({
            currentWeightKg: nextProfile.currentWeightKg,
            heightCm: nextProfile.heightCm,
            shoeSizeEu: nextProfile.shoeSizeEu,
            updatedAt: nextProfile.updatedAt,
          });

          return nextProfile;
        });
      },

      setHeightCm: (heightCm) => {
        set((state) => {
          const nextProfile = applyBodyProfileUpdate(state, { heightCm });

          queueBodyProfileFirestoreSync({
            currentWeightKg: nextProfile.currentWeightKg,
            heightCm: nextProfile.heightCm,
            shoeSizeEu: nextProfile.shoeSizeEu,
            updatedAt: nextProfile.updatedAt,
          });

          return nextProfile;
        });
      },

      setGender: (gender) => {
        set((state) => {
          const nextProfile = applyBodyProfileUpdate(state, { gender });

          queueBodyProfileFirestoreSync({
            currentWeightKg: nextProfile.currentWeightKg,
            heightCm: nextProfile.heightCm,
            shoeSizeEu: nextProfile.shoeSizeEu,
            updatedAt: nextProfile.updatedAt,
          });

          return nextProfile;
        });
      },

      setBodyProfile: (profile) => {
        set((state) => {
          const nextProfile = applyBodyProfileUpdate(state, profile);

          queueBodyProfileFirestoreSync({
            currentWeightKg: nextProfile.currentWeightKg,
            heightCm: nextProfile.heightCm,
            shoeSizeEu: nextProfile.shoeSizeEu,
            updatedAt: nextProfile.updatedAt,
          });

          return nextProfile;
        });
      },
    }),
    {
      name: BODY_PROFILE_STORAGE_KEY,
      storage: createJSONStorage(() => scopedStorage),
      partialize: (state) => ({
        currentWeightKg: state.currentWeightKg,
        heightCm: state.heightCm,
        gender: state.gender,
        shoeSizeEu: state.shoeSizeEu,
        updatedAt: state.updatedAt,
      }),
      merge: (persistedState, currentState) => {
        const persisted =
          typeof persistedState === 'object' && persistedState !== null
            ? (persistedState as Partial<BodyProfileState>)
            : {};

        const restoredProfile = applyBodyProfileUpdate(
          currentState,
          {
            currentWeightKg: persisted.currentWeightKg,
            heightCm: persisted.heightCm,
            gender: persisted.gender,
            shoeSizeEu: persisted.shoeSizeEu,
          },
        );

        return {
          ...currentState,
          ...restoredProfile,
          updatedAt:
            typeof persisted.updatedAt === 'number'
              ? persisted.updatedAt
              : restoredProfile.updatedAt,
        };
      },
    },
  ),
);
