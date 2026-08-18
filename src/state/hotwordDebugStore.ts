import { create } from 'zustand';

export type HotwordDebugDecision =
  | 'accepted'
  | 'ignored'
  | 'cooldown_blocked';

export interface HotwordDebugEntry {
  id: string;
  createdAt: string;
  transcriptRaw: string;
  transcriptNormalized: string;
  hotwordStatus: string;
  allowedHotwords: string[];
  detectedHotword: string | null;
  decision: HotwordDebugDecision;
  reason: string;
}

interface HotwordDebugStoreState {
  entries: HotwordDebugEntry[];
  isTrackingEnabled: boolean;

  enableTracking: () => void;
  disableTracking: () => void;
  addEntry: (entry: Omit<HotwordDebugEntry, 'id' | 'createdAt'>) => void;
  clearEntries: () => void;
  resetHotwordDebugState: () => void;
}

function createEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useHotwordDebugStore = create<HotwordDebugStoreState>((set) => ({
  entries: [],
  isTrackingEnabled: __DEV__,

  enableTracking: () => {
    if (!__DEV__) {
      return;
    }

    set({
      isTrackingEnabled: true,
    });
  },

  disableTracking: () => {
    set({
      isTrackingEnabled: false,
    });
  },

  addEntry: (entry) => {
    set((state) => {
      if (!__DEV__) {
        return state;
      }

      if (!state.isTrackingEnabled) {
        return state;
      }

      const nextEntry: HotwordDebugEntry = {
        id: createEntryId(),
        createdAt: new Date().toISOString(),
        transcriptRaw: entry.transcriptRaw,
        transcriptNormalized: entry.transcriptNormalized,
        hotwordStatus: entry.hotwordStatus,
        allowedHotwords: entry.allowedHotwords,
        detectedHotword: entry.detectedHotword,
        decision: entry.decision,
        reason: entry.reason,
      };

      return {
        entries: [nextEntry, ...state.entries].slice(0, 200),
      };
    });
  },

  clearEntries: () => {
    set({
      entries: [],
    });
  },

  resetHotwordDebugState: () => {
    set({
      entries: [],
      isTrackingEnabled: __DEV__,
    });
  },
}));