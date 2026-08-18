// src/app_core/models/BuddyModels.ts

export type SavedBuddyStatus = 'active' | 'blocked' | 'removed';

export type SavedBuddySource =
  | 'live_run_code'
  | 'permanent_buddy_code'
  | 'manual';

export interface SavedBuddy {
  /**
   * Firebase Auth UID des gespeicherten Buddies.
   * Das ist die stabile technische Identität.
   */
  buddyUid: string;

  /**
   * Dauerhafter Buddy-Code des Buddies.
   * Nicht verwechseln mit RUN-XXXX.
   */
  buddyCode: string | null;

  email: string | null;
  username: string | null;
  displayName: string | null;
  photoURL: string | null;

  status: SavedBuddyStatus;
  source: SavedBuddySource;

  addedAt: number;
  updatedAt: number;
  lastRunTogetherAt: number | null;
}

export type SaveBuddyParams = {
  buddyUid: string;
  buddyCode?: string | null;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  source: SavedBuddySource;
};