import { create } from 'zustand';
import { EmergencyCallExecutionStatus } from './emergencyCallExecutionStatus';

export type EmergencyCallFlowType = 'normal_contact' | 'bos_police' | null;

export interface EmergencyCallExecutionTarget {
  label: string;
  phoneNumber: string;
}

interface EmergencyCallExecutionStoreState {
  status: EmergencyCallExecutionStatus;
  flowType: EmergencyCallFlowType;
  target: EmergencyCallExecutionTarget | null;
  retryOnConnectivityRestored: boolean;
  pendingSince: string | null;
  waitingForConnectivitySince: string | null;
  readyToExecuteAt: string | null;
  executingAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  lastErrorMessage: string | null;

  queuePendingExecution: (
    flowType: Exclude<EmergencyCallFlowType, null>,
    target: EmergencyCallExecutionTarget,
    retryOnConnectivityRestored?: boolean,
  ) => void;
  markWaitingForConnectivity: () => void;
  markReadyToExecute: () => void;
  markExecuting: () => void;
  markCompleted: () => void;
  markFailed: (errorMessage: string) => void;
  resetEmergencyCallExecution: () => void;
}

export const useEmergencyCallExecutionStore =
  create<EmergencyCallExecutionStoreState>((set) => ({
    status: EmergencyCallExecutionStatus.Idle,
    flowType: null,
    target: null,
    retryOnConnectivityRestored: false,
    pendingSince: null,
    waitingForConnectivitySince: null,
    readyToExecuteAt: null,
    executingAt: null,
    completedAt: null,
    failedAt: null,
    lastErrorMessage: null,

    queuePendingExecution: (
      flowType,
      target,
      retryOnConnectivityRestored = true,
    ) => {
      set({
        status: EmergencyCallExecutionStatus.Pending,
        flowType,
        target,
        retryOnConnectivityRestored,
        pendingSince: new Date().toISOString(),
        waitingForConnectivitySince: null,
        readyToExecuteAt: null,
        executingAt: null,
        completedAt: null,
        failedAt: null,
        lastErrorMessage: null,
      });
    },

    markWaitingForConnectivity: () => {
      set((state) => ({
        status:
          state.target !== null
            ? EmergencyCallExecutionStatus.WaitingForConnectivity
            : state.status,
        waitingForConnectivitySince:
          state.target !== null
            ? new Date().toISOString()
            : state.waitingForConnectivitySince,
        readyToExecuteAt: null,
        executingAt: null,
        completedAt: null,
        failedAt: null,
        lastErrorMessage: null,
      }));
    },

    markReadyToExecute: () => {
      set((state) => ({
        status:
          state.target !== null
            ? EmergencyCallExecutionStatus.ReadyToExecute
            : state.status,
        readyToExecuteAt:
          state.target !== null
            ? new Date().toISOString()
            : state.readyToExecuteAt,
        failedAt: null,
        lastErrorMessage: null,
      }));
    },

    markExecuting: () => {
      set((state) => ({
        status:
          state.target !== null
            ? EmergencyCallExecutionStatus.Executing
            : state.status,
        executingAt:
          state.target !== null
            ? new Date().toISOString()
            : state.executingAt,
        failedAt: null,
        lastErrorMessage: null,
      }));
    },

    markCompleted: () => {
      set((state) => ({
        status:
          state.target !== null
            ? EmergencyCallExecutionStatus.Completed
            : state.status,
        completedAt:
          state.target !== null
            ? new Date().toISOString()
            : state.completedAt,
        retryOnConnectivityRestored: false,
      }));
    },

    markFailed: (errorMessage) => {
      const normalizedErrorMessage = errorMessage.trim() || 'Unbekannter Fehler.';

      set((state) => ({
        status: EmergencyCallExecutionStatus.Failed,
        failedAt: new Date().toISOString(),
        lastErrorMessage: normalizedErrorMessage,
        retryOnConnectivityRestored:
          state.target !== null ? state.retryOnConnectivityRestored : false,
      }));
    },

    resetEmergencyCallExecution: () => {
      set({
        status: EmergencyCallExecutionStatus.Idle,
        flowType: null,
        target: null,
        retryOnConnectivityRestored: false,
        pendingSince: null,
        waitingForConnectivitySince: null,
        readyToExecuteAt: null,
        executingAt: null,
        completedAt: null,
        failedAt: null,
        lastErrorMessage: null,
      });
    },
  }));