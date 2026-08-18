// src/state/normalEmergencyStore.ts
import { create } from 'zustand';
import { NormalEmergencyStatus } from './normalEmergencyStatus';

type NormalEmergencyTriggerSource = 'hotword_detected';

interface NormalEmergencyStoreState {
  status: NormalEmergencyStatus;
  triggerSource: NormalEmergencyTriggerSource | null;
  triggeredAt: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;

  triggerEmergency: () => void;
  startAlerting: () => void;
  acknowledgeEmergency: () => void;
  resolveEmergency: () => void;
  resetEmergency: () => void;
}

export const useNormalEmergencyStore = create<NormalEmergencyStoreState>((set) => ({
  status: NormalEmergencyStatus.Idle,
  triggerSource: null,
  triggeredAt: null,
  acknowledgedAt: null,
  resolvedAt: null,

  triggerEmergency: () => {
    set({
      status: NormalEmergencyStatus.Triggered,
      triggerSource: 'hotword_detected',
      triggeredAt: new Date().toISOString(),
      acknowledgedAt: null,
      resolvedAt: null,
    });
  },

  startAlerting: () => {
    set((state) => ({
      status: state.status === NormalEmergencyStatus.Triggered
        ? NormalEmergencyStatus.Alerting
        : state.status,
    }));
  },

  acknowledgeEmergency: () => {
    set((state) => ({
      status: state.status === NormalEmergencyStatus.Alerting
        ? NormalEmergencyStatus.Acknowledged
        : state.status,
      acknowledgedAt:
        state.status === NormalEmergencyStatus.Alerting
          ? new Date().toISOString()
          : state.acknowledgedAt,
    }));
  },

  resolveEmergency: () => {
    set((state) => ({
      status:
        state.status !== NormalEmergencyStatus.Idle
          ? NormalEmergencyStatus.Resolved
          : state.status,
      resolvedAt:
        state.status !== NormalEmergencyStatus.Idle
          ? new Date().toISOString()
          : state.resolvedAt,
    }));
  },

  resetEmergency: () => {
    set({
      status: NormalEmergencyStatus.Idle,
      triggerSource: null,
      triggeredAt: null,
      acknowledgedAt: null,
      resolvedAt: null,
    });
  },
}));