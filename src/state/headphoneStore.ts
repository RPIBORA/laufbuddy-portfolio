// src/state/headphoneStore.ts
import { create } from 'zustand';
import { HeadphoneStatus } from './headphoneStatus';

interface HeadphoneStoreState {
  status: HeadphoneStatus;
  connectedAt: string | null;
  disconnectedAt: string | null;

  setConnected: () => void;
  setDisconnected: () => void;
  resetHeadphoneState: () => void;
}

export const useHeadphoneStore = create<HeadphoneStoreState>((set) => ({
  status: HeadphoneStatus.Disconnected,
  connectedAt: null,
  disconnectedAt: null,

  setConnected: () => {
    set({
      status: HeadphoneStatus.Connected,
      connectedAt: new Date().toISOString(),
      disconnectedAt: null,
    });
  },

  setDisconnected: () => {
    set({
      status: HeadphoneStatus.Disconnected,
      disconnectedAt: new Date().toISOString(),
    });
  },

  resetHeadphoneState: () => {
    set({
      status: HeadphoneStatus.Disconnected,
      connectedAt: null,
      disconnectedAt: null,
    });
  },
}));