// src/core/runPassiveOrchestration.ts
import { useAudioControlStore } from '../state/audioControlStore';
import { useBuddyAudioStore } from '../state/buddyAudioStore';
import { useBuddyConnectionAnnouncementStore } from '../state/buddyConnectionAnnouncementStore';
import { useConnectivityStore } from '../state/connectivityStore';
import { useHeadphoneStore } from '../state/headphoneStore';
import { useHotwordStore } from '../state/hotwordStore';
import { useNormalEmergencyStore } from '../state/normalEmergencyStore';
import { useSessionStore } from '../state/sessionStore';
import {
  applyOrchestratorResult,
  AppOrchestratorAdapters,
  AppOrchestratorResult,
  evaluatePassiveOrchestration,
} from './appOrchestrator';
import { createAppOrchestratorContext } from './createAppOrchestratorContext';
import { syncBuddyConnectionAnnouncementState } from './syncBuddyConnectionAnnouncementState';

export interface RunPassiveOrchestrationParams {
  isAppReady: boolean;
  nowMs?: number;
  lossAnnouncementDelayMs?: number;
  restoreAnnouncementDelayMs?: number;
  voicePrompts?: AppOrchestratorAdapters['voicePrompts'];
}

function createStoreBackedAdapters(
  params: RunPassiveOrchestrationParams,
): AppOrchestratorAdapters {
  return {
    hotword: {
      enableListening: () => useHotwordStore.getState().enableListening(),
      disableHotword: () => useHotwordStore.getState().disableHotword(),
    },
    normalEmergency: {
      triggerEmergency: () =>
        useNormalEmergencyStore.getState().triggerEmergency(),
    },
    audioControl: {
      allowMusic: () => useAudioControlStore.getState().allowMusic(),
      duckMusic: () => useAudioControlStore.getState().duckMusic(),
      releaseAudioFocus: () =>
        useAudioControlStore.getState().releaseAudioFocus(),
    },
    voicePrompts: params.voicePrompts,
    buddyAnnouncement: {
      markAnnouncementDelivered: (transition, announcedAt) =>
        useBuddyConnectionAnnouncementStore
          .getState()
          .markAnnouncementDelivered(transition, announcedAt),
    },
  };
}

export function runPassiveOrchestration(
  params: RunPassiveOrchestrationParams,
): AppOrchestratorResult {
  const nowMs = params.nowMs ?? Date.now();

  syncBuddyConnectionAnnouncementState(nowMs);

  const sessionState = useSessionStore.getState();
  const buddyAudioState = useBuddyAudioStore.getState();
  const headphoneState = useHeadphoneStore.getState();
  const normalEmergencyState = useNormalEmergencyStore.getState();
  const connectivityState = useConnectivityStore.getState();
  const hotwordState = useHotwordStore.getState();
  const buddyAnnouncementState =
    useBuddyConnectionAnnouncementStore.getState();

  const context = createAppOrchestratorContext({
    nowMs,
    isAppReady: params.isAppReady,
    sessionStatus: sessionState.status,
    buddyAudioStatus: buddyAudioState.status,
    headphoneStatus: headphoneState.status,
    normalEmergencyStatus: normalEmergencyState.status,
    connectivityStatus: connectivityState.status,
    hotwordStatus: hotwordState.status,
    buddyAnnouncementState: {
      hasSeenConnectedBuddySinceReset:
        buddyAnnouncementState.hasSeenConnectedBuddySinceReset,
      buddyDisconnectedAt: buddyAnnouncementState.buddyDisconnectedAt,
      buddyConnectedAt: buddyAnnouncementState.buddyConnectedAt,
      lastAnnouncedTransition:
        buddyAnnouncementState.lastAnnouncedTransition,
      lastAnnouncedAt: buddyAnnouncementState.lastAnnouncedAt,
    },
    lossAnnouncementDelayMs: params.lossAnnouncementDelayMs,
    restoreAnnouncementDelayMs: params.restoreAnnouncementDelayMs,
  });

  const result = evaluatePassiveOrchestration(context);

  applyOrchestratorResult(result, createStoreBackedAdapters(params));

  return result;
}