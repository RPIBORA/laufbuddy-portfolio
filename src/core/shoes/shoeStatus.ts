import type { ShoeStatus } from './shoeTypes';

export const WARNING_DISTANCE_KM = 200;

export function calculateWarningThreshold(replacementKm: number): number {
  return Math.max(0, replacementKm - WARNING_DISTANCE_KM);
}

export function calculateShoeStatus(
  currentKm: number,
  replacementKm: number,
): ShoeStatus {
  const warningThreshold = calculateWarningThreshold(replacementKm);

  if (currentKm >= replacementKm) {
    return 'replace_now';
  }

  if (currentKm >= warningThreshold) {
    return 'replace_soon';
  }

  return 'active';
}

export function calculateRemainingKm(
  currentKm: number,
  replacementKm: number,
): number {
  return Math.max(0, replacementKm - currentKm);
}