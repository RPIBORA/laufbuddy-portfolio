// src/state/buddyAudioStore.ts
import { create } from 'zustand';
import { BuddyAudioStatus } from './buddyAudioStatus';

interface BuddyAudioStoreState {
  status: BuddyAudioStatus;
  buddyId: string | null;
  callId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  errorMessage: string | null;

  startAudioSession: (buddyId: string) => void;
  setConnected: (callId: string) => void;
  endAudioSession: () => void;
  setAudioDisconnected: () => void;
  setAudioError: (message: string) => void;
  resetAudioSession: () => void;
}

export const useBuddyAudioStore = create<BuddyAudioStoreState>((set) => ({
  status: BuddyAudioStatus.Idle,
  buddyId: null,
  callId: null,
  startedAt: null,
  endedAt: null,
  errorMessage: null,

  startAudioSession: (buddyId) => {
    set({
      status: BuddyAudioStatus.Connecting,
      buddyId,
      callId: null,
      startedAt: null,
      endedAt: null,
      errorMessage: null,
    });
  },

  setConnected: (callId) => {
    set({
      status: BuddyAudioStatus.Connected,
      callId,
      startedAt: new Date().toISOString(),
      endedAt: null,
      errorMessage: null,
    });
  },

  endAudioSession: () => {
    set((state) => ({
      status: BuddyAudioStatus.Disconnected,
      endedAt: new Date().toISOString(),
      errorMessage: null,
      buddyId: state.buddyId,
      callId: state.callId,
      startedAt: state.startedAt,
    }));
  },

  setAudioDisconnected: () => {
    set((state) => ({
      status: BuddyAudioStatus.Disconnected,
      endedAt: new Date().toISOString(),
      errorMessage: null,
      buddyId: state.buddyId,
      callId: state.callId,
      startedAt: state.startedAt,
    }));
  },

  setAudioError: (message) => {
    set({
      status: BuddyAudioStatus.Error,
      errorMessage: message,
      endedAt: new Date().toISOString(),
    });
  },

  resetAudioSession: () => {
    set({
      status: BuddyAudioStatus.Idle,
      buddyId: null,
      callId: null,
      startedAt: null,
      endedAt: null,
      errorMessage: null,
    });
  },
}));