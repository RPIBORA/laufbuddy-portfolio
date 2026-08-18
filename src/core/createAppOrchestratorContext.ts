// src/core/createAppOrchestratorContext.ts
import type { BuddyConnectionAnnouncementState } from '../state/buddyConnectionAnnouncementStore';
import { BuddyAudioStatus } from '../state/buddyAudioStatus';
import { ConnectivityStatus } from '../state/connectivityStatus';
import { HeadphoneStatus } from '../state/headphoneStatus';
import { HotwordStatus } from '../state/hotwordStatus';
import { NormalEmergencyStatus } from '../state/normalEmergencyStatus';
import { SessionStatus } from '../state/sessionStatus';
import type { AppOrchestratorContext } from './appOrchestrator';
import { createBuddyAnnouncementContext } from './createBuddyAnnouncementContext';

export interface CreateAppOrchestratorContextParams {
  nowMs: number;
  isAppReady: boolean;
  sessionStatus: SessionStatus;
  buddyAudioStatus: BuddyAudioStatus;
  headphoneStatus: HeadphoneStatus;
  normalEmergencyStatus: NormalEmergencyStatus;
  connectivityStatus: ConnectivityStatus;
  hotwordStatus: HotwordStatus;
  buddyAnnouncementState?: Pick<
    BuddyConnectionAnnouncementState,
    | 'hasSeenConnectedBuddySinceReset'
    | 'buddyDisconnectedAt'
    | 'buddyConnectedAt'
    | 'lastAnnouncedTransition'
    | 'lastAnnouncedAt'
  >;
  lossAnnouncementDelayMs?: number;
  restoreAnnouncementDelayMs?: number;
}

export function createAppOrchestratorContext(
  params: CreateAppOrchestratorContextParams,
): AppOrchestratorContext {
  return {
    isAppReady: params.isAppReady,
    sessionStatus: params.sessionStatus,
    buddyAudioStatus: params.buddyAudioStatus,
    headphoneStatus: params.headphoneStatus,
    normalEmergencyStatus: params.normalEmergencyStatus,
    connectivityStatus: params.connectivityStatus,
    hotwordStatus: params.hotwordStatus,
    buddyAnnouncement: params.buddyAnnouncementState
      ? createBuddyAnnouncementContext({
          nowMs: params.nowMs,
          state: params.buddyAnnouncementState,
          lossAnnouncementDelayMs: params.lossAnnouncementDelayMs,
          restoreAnnouncementDelayMs: params.restoreAnnouncementDelayMs,
        })
      : undefined,
  };
}