// src/state/appReadyStore.ts
import { create } from 'zustand';

interface AppReadyStoreState {
  isAppReady: boolean;
  readyAt: string | null;
  notReadyAt: string | null;

  markAppReady: () => void;
  markAppNotReady: () => void;
  resetAppReadyState: () => void;
}

export const useAppReadyStore = create<AppReadyStoreState>((set) => ({
  isAppReady: false,
  readyAt: null,
  notReadyAt: new Date().toISOString(),

  markAppReady: () => {
    set({
      isAppReady: true,
      readyAt: new Date().toISOString(),
      notReadyAt: null,
    });
  },

  markAppNotReady: () => {
    set({
      isAppReady: false,
      readyAt: null,
      notReadyAt: new Date().toISOString(),
    });
  },

  resetAppReadyState: () => {
    set({
      isAppReady: false,
      readyAt: null,
      notReadyAt: null,
    });
  },
}));