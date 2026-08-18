// src/core/syncBuddyConnectionAnnouncementState.ts
import { BuddyAudioStatus } from '../state/buddyAudioStatus';
import { useBuddyAudioStore } from '../state/buddyAudioStore';
import { useBuddyConnectionAnnouncementStore } from '../state/buddyConnectionAnnouncementStore';

function wasBuddyActive(status: BuddyAudioStatus): boolean {
  return status === BuddyAudioStatus.Connected;
}

export function syncBuddyConnectionAnnouncementState(
  nowMs: number = Date.now(),
): void {
  const buddyAudioState = useBuddyAudioStore.getState();
  const announcementState = useBuddyConnectionAnnouncementStore.getState();

  const buddyIsActiveNow = wasBuddyActive(buddyAudioState.status);
  const buddyWasMarkedConnected = announcementState.buddyConnectedAt !== null;
  const buddyWasMarkedDisconnected =
    announcementState.buddyDisconnectedAt !== null;

  if (buddyIsActiveNow && !buddyWasMarkedConnected) {
    announcementState.markBuddyConnected(nowMs);
    return;
  }

  if (!buddyIsActiveNow && !buddyWasMarkedDisconnected) {
    announcementState.markBuddyDisconnected(nowMs);
  }
}