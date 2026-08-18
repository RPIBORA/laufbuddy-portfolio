// src/core/createBuddyAnnouncementContext.ts
import type { BuddyConnectionAnnouncementState } from '../state/buddyConnectionAnnouncementStore';
import {
  DEFAULT_BUDDY_LOSS_ANNOUNCEMENT_DELAY_MS,
  DEFAULT_BUDDY_RESTORE_ANNOUNCEMENT_DELAY_MS,
  type BuddyConnectionAnnouncementContext,
} from './appOrchestrator';

export interface CreateBuddyAnnouncementContextParams {
  nowMs: number;
  state: Pick<
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

export function createBuddyAnnouncementContext(
  params: CreateBuddyAnnouncementContextParams,
): BuddyConnectionAnnouncementContext {
  return {
    nowMs: params.nowMs,
    hasSeenConnectedBuddySinceReset:
      params.state.hasSeenConnectedBuddySinceReset,
    buddyDisconnectedAt: params.state.buddyDisconnectedAt,
    buddyConnectedAt: params.state.buddyConnectedAt,
    lastAnnouncedTransition: params.state.lastAnnouncedTransition,
    lastAnnouncedAt: params.state.lastAnnouncedAt,
    lossAnnouncementDelayMs:
      params.lossAnnouncementDelayMs ??
      DEFAULT_BUDDY_LOSS_ANNOUNCEMENT_DELAY_MS,
    restoreAnnouncementDelayMs:
      params.restoreAnnouncementDelayMs ??
      DEFAULT_BUDDY_RESTORE_ANNOUNCEMENT_DELAY_MS,
  };
}