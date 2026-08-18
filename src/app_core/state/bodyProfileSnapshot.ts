import { normalizeShoeSizeEu } from './shoeSizeEu';

export type BodyProfileGender = 'female' | 'male' | 'diverse' | null;

export type BodyProfileUpdate = {
  currentWeightKg?: number | null;
  heightCm?: number | null;
  gender?: BodyProfileGender;
  shoeSizeEu?: number | null;
};

export type BodyProfileSnapshot = {
  currentWeightKg: number | null;
  heightCm: number | null;
  gender: BodyProfileGender;
  shoeSizeEu: number | null;
  updatedAt: number | null;
};

function normalizeWeightKg(weightKg: number | null | undefined): number | null {
  if (weightKg === null || weightKg === undefined) return null;
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  return Math.round(weightKg * 10) / 10;
}

function normalizeHeightCm(heightCm: number | null | undefined): number | null {
  if (heightCm === null || heightCm === undefined) return null;
  if (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 260) return null;
  return Math.round(heightCm);
}

function normalizeGender(gender: BodyProfileGender | undefined): BodyProfileGender {
  return gender === 'female' || gender === 'male' || gender === 'diverse'
    ? gender
    : null;
}

function createUpdatedAt(profile: Omit<BodyProfileSnapshot, 'updatedAt'>): number | null {
  return profile.currentWeightKg !== null ||
    profile.heightCm !== null ||
    profile.gender !== null ||
    profile.shoeSizeEu !== null
    ? Date.now()
    : null;
}

export function applyBodyProfileUpdate(
  currentProfile: BodyProfileSnapshot,
  update: BodyProfileUpdate,
): BodyProfileSnapshot {
  const nextProfile = {
    currentWeightKg:
      'currentWeightKg' in update
        ? normalizeWeightKg(update.currentWeightKg)
        : currentProfile.currentWeightKg,
    heightCm:
      'heightCm' in update
        ? normalizeHeightCm(update.heightCm)
        : currentProfile.heightCm,
    gender: 'gender' in update ? normalizeGender(update.gender) : currentProfile.gender,
    shoeSizeEu:
      'shoeSizeEu' in update
        ? normalizeShoeSizeEu(update.shoeSizeEu)
        : currentProfile.shoeSizeEu,
  };

  return {
    ...nextProfile,
    updatedAt: createUpdatedAt(nextProfile),
  };
}
