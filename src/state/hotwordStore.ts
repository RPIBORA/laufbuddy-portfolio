// src/state/hotwordStore.ts
import { create } from 'zustand';
import { HotwordStatus } from './hotwordStatus';

type HotwordType = 'hilfe' | null;

interface HotwordStoreState {
  status: HotwordStatus;
  lastDetectedHotword: HotwordType;
  listeningStartedAt: string | null;
  disabledAt: string | null;
  inactiveReason: string | null;

  enableListening: () => void;
  markDetectedHotword: (hotword: Exclude<HotwordType, null>) => void;
  disableHotword: () => void;
  resetHotwordState: () => void;
  setNativeStatus: (active: boolean, reason: string) => void;
}

export const useHotwordStore = create<HotwordStoreState>((set) => ({
  status: HotwordStatus.Disabled,
  lastDetectedHotword: null,
  listeningStartedAt: null,
  disabledAt: new Date().toISOString(),
  inactiveReason: 'Dienst noch nicht gestartet.',

  enableListening: () => {
    set({
      status: HotwordStatus.Listening,
      listeningStartedAt: new Date().toISOString(),
      disabledAt: null,
      inactiveReason: null,
    });
  },

  markDetectedHotword: (hotword) => {
    set({
      lastDetectedHotword: hotword,
    });
  },

  disableHotword: () => {
    set({
      status: HotwordStatus.Disabled,
      disabledAt: new Date().toISOString(),
    });
  },

  resetHotwordState: () => {
    set({
      status: HotwordStatus.Disabled,
      lastDetectedHotword: null,
      listeningStartedAt: null,
      disabledAt: null,
      inactiveReason: null,
    });
  },

  setNativeStatus: (active, reason) => {
    set({
      status: active ? HotwordStatus.Listening : HotwordStatus.Disabled,
      listeningStartedAt: active ? new Date().toISOString() : null,
      disabledAt: active ? null : new Date().toISOString(),
      inactiveReason: active ? null : reason,
    });
  },
}));
