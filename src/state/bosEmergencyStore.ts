// src/state/bosEmergencyStore.ts
import { create } from 'zustand';
import { BOSEmergencyStatus } from './bosEmergencyStatus';

interface BOSEmergencyStoreState {
  status: BOSEmergencyStatus;
  triggeredAt: string | null;
  escalatedAt: string | null;
  evidenceStartedAt: string | null;
  resolvedAt: string | null;

  triggerBOSEmergency: () => void;
  startBOSEscalation: () => void;
  startEvidenceCollection: () => void;
  resolveBOSEmergency: () => void;
  resetBOSEmergency: () => void;
}

export const useBOSEmergencyStore = create<BOSEmergencyStoreState>((set) => ({
  status: BOSEmergencyStatus.Idle,
  triggeredAt: null,
  escalatedAt: null,
  evidenceStartedAt: null,
  resolvedAt: null,

  triggerBOSEmergency: () => {
    set({
      status: BOSEmergencyStatus.Triggered,
      triggeredAt: new Date().toISOString(),
      escalatedAt: null,
      evidenceStartedAt: null,
      resolvedAt: null,
    });
  },

  startBOSEscalation: () => {
    set((state) => ({
      status:
        state.status === BOSEmergencyStatus.Triggered
          ? BOSEmergencyStatus.Escalating
          : state.status,
      escalatedAt:
        state.status === BOSEmergencyStatus.Triggered
          ? new Date().toISOString()
          : state.escalatedAt,
    }));
  },

  startEvidenceCollection: () => {
    set((state) => ({
      status:
        state.status === BOSEmergencyStatus.Escalating
          ? BOSEmergencyStatus.CollectingEvidence
          : state.status,
      evidenceStartedAt:
        state.status === BOSEmergencyStatus.Escalating
          ? new Date().toISOString()
          : state.evidenceStartedAt,
    }));
  },

  resolveBOSEmergency: () => {
    set((state) => ({
      status:
        state.status !== BOSEmergencyStatus.Idle
          ? BOSEmergencyStatus.Resolved
          : state.status,
      resolvedAt:
        state.status !== BOSEmergencyStatus.Idle
          ? new Date().toISOString()
          : state.resolvedAt,
    }));
  },

  resetBOSEmergency: () => {
    set({
      status: BOSEmergencyStatus.Idle,
      triggeredAt: null,
      escalatedAt: null,
      evidenceStartedAt: null,
      resolvedAt: null,
    });
  },
}));