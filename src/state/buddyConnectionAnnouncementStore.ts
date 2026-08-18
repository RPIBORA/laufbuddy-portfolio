// src/state/buddyConnectionAnnouncementStore.ts
import { create } from 'zustand';

export type BuddyTransitionAnnouncement = 'lost' | 'restored' | null;

export interface BuddyConnectionAnnouncementState {
  hasSeenConnectedBuddySinceReset: boolean;
  buddyDisconnectedAt: number | null;
  buddyConnectedAt: number | null;
  lastAnnouncedTransition: BuddyTransitionAnnouncement;
  lastAnnouncedAt: number | null;

  markBuddyDisconnected(disconnectedAt: number): void;
  markBuddyConnected(connectedAt: number): void;
  markAnnouncementDelivered(
    transition: Exclude<BuddyTransitionAnnouncement, null>,
    announcedAt: number,
  ): void;
  resetBuddyConnectionAnnouncementState(): void;
}

export const useBuddyConnectionAnnouncementStore =
  create<BuddyConnectionAnnouncementState>((set) => ({
    hasSeenConnectedBuddySinceReset: false,
    buddyDisconnectedAt: null,
    buddyConnectedAt: null,
    lastAnnouncedTransition: null,
    lastAnnouncedAt: null,

    markBuddyDisconnected: (disconnectedAt: number) =>
      set((state) => ({
        hasSeenConnectedBuddySinceReset: state.hasSeenConnectedBuddySinceReset,
        buddyDisconnectedAt: disconnectedAt,
        buddyConnectedAt: null,
      })),

    markBuddyConnected: (connectedAt: number) =>
      set(() => ({
        hasSeenConnectedBuddySinceReset: true,
        buddyDisconnectedAt: null,
        buddyConnectedAt: connectedAt,
      })),

    markAnnouncementDelivered: (
      transition: Exclude<BuddyTransitionAnnouncement, null>,
      announcedAt: number,
    ) =>
      set(() => ({
        lastAnnouncedTransition: transition,
        lastAnnouncedAt: announcedAt,
      })),

    resetBuddyConnectionAnnouncementState: () =>
      set(() => ({
        hasSeenConnectedBuddySinceReset: false,
        buddyDisconnectedAt: null,
        buddyConnectedAt: null,
        lastAnnouncedTransition: null,
        lastAnnouncedAt: null,
      })),
  }));