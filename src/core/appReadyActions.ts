// src/core/appReadyActions.ts
import { useAppReadyStore } from '../state/appReadyStore';

export function markLaufBuddyAppReady(): void {
  useAppReadyStore.getState().markAppReady();
}

export function markLaufBuddyAppNotReady(): void {
  useAppReadyStore.getState().markAppNotReady();
}

export function resetLaufBuddyAppReadyState(): void {
  useAppReadyStore.getState().resetAppReadyState();
}