// src/state/connectionRecoveryStore.ts
import { create } from 'zustand';
import { ConnectionRecoveryStatus } from './connectionRecoveryStatus';

interface ConnectionRecoveryStoreState {
  status: ConnectionRecoveryStatus;
  retryCount: number;
  maxRetries: number;
  lastDisconnectedAt: string | null;
  lastRecoveredAt: string | null;
  errorMessage: string | null;

  markDisconnected: () => void;
  startReconnectAttempt: () => void;
  markRecovered: () => void;
  markReconnectFailed: (message: string) => void;
  resetRecovery: () => void;
}

export const useConnectionRecoveryStore = create<ConnectionRecoveryStoreState>((set) => ({
  status: ConnectionRecoveryStatus.Idle,
  retryCount: 0,
  maxRetries: 3,
  lastDisconnectedAt: null,
  lastRecoveredAt: null,
  errorMessage: null,

  markDisconnected: () => {
    set({
      status: ConnectionRecoveryStatus.WaitingToReconnect,
      lastDisconnectedAt: new Date().toISOString(),
      errorMessage: null,
    });
  },

  startReconnectAttempt: () => {
    set((state) => ({
      status: ConnectionRecoveryStatus.Reconnecting,
      retryCount: state.retryCount + 1,
      errorMessage: null,
    }));
  },

  markRecovered: () => {
    set({
      status: ConnectionRecoveryStatus.Recovered,
      lastRecoveredAt: new Date().toISOString(),
      errorMessage: null,
    });
  },

  markReconnectFailed: (message) => {
    set({
      status: ConnectionRecoveryStatus.Failed,
      errorMessage: message,
    });
  },

  resetRecovery: () => {
    set({
      status: ConnectionRecoveryStatus.Idle,
      retryCount: 0,
      maxRetries: 3,
      lastDisconnectedAt: null,
      lastRecoveredAt: null,
      errorMessage: null,
    });
  },
}));