// src/state/connectivityStore.ts
import { create } from 'zustand';
import { ConnectivityStatus } from './connectivityStatus';

interface ConnectivityStoreState {
  status: ConnectivityStatus;
  changedAt: string | null;
  offlineSince: string | null;
  degradedSince: string | null;

  setOnline: () => void;
  setDegraded: () => void;
  setOffline: () => void;
  resetConnectivity: () => void;
}

export const useConnectivityStore = create<ConnectivityStoreState>((set) => ({
  status: ConnectivityStatus.Online,
  changedAt: new Date().toISOString(),
  offlineSince: null,
  degradedSince: null,

  setOnline: () => {
    set({
      status: ConnectivityStatus.Online,
      changedAt: new Date().toISOString(),
      offlineSince: null,
      degradedSince: null,
    });
  },

  setDegraded: () => {
    set({
      status: ConnectivityStatus.Degraded,
      changedAt: new Date().toISOString(),
      degradedSince: new Date().toISOString(),
      offlineSince: null,
    });
  },

  setOffline: () => {
    set({
      status: ConnectivityStatus.Offline,
      changedAt: new Date().toISOString(),
      offlineSince: new Date().toISOString(),
      degradedSince: null,
    });
  },

  resetConnectivity: () => {
    set({
      status: ConnectivityStatus.Online,
      changedAt: null,
      offlineSince: null,
      degradedSince: null,
    });
  },
}));