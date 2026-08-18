// src/app_core/state/useSavedBuddies.ts
import { create } from 'zustand';
import {
  SaveBuddyParams,
  SavedBuddy,
} from '../models/BuddyModels';
import {
  loadSavedBuddiesFromFirestore,
  saveBuddyToFirestore,
} from '../../services/savedBuddiesFirestoreService';
import { removeBuddyRelationship } from '../../services/buddyInvitationService';

type SavedBuddiesState = {
  buddies: SavedBuddy[];
  isLoading: boolean;
  errorMessage: string | null;

  loadSavedBuddies: () => Promise<void>;
  saveBuddy: (params: SaveBuddyParams) => Promise<void>;
  removeBuddy: (buddyUid: string) => Promise<void>;
  removeBuddyLocally: (buddyUid: string) => void;
  isBuddySaved: (buddyUid: string | null | undefined) => boolean;
};

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  return trimmedValue;
}

function createLocalSavedBuddy(params: SaveBuddyParams): SavedBuddy {
  const now = Date.now();

  return {
    buddyUid: params.buddyUid,
    buddyCode: normalizeOptionalText(params.buddyCode),
    email: normalizeOptionalText(params.email),
    username: normalizeOptionalText(params.username),
    displayName: normalizeOptionalText(params.displayName),
    photoURL: normalizeOptionalText(params.photoURL),
    status: 'active',
    source: params.source,
    addedAt: now,
    updatedAt: now,
    lastRunTogetherAt: null,
  };
}

function upsertSavedBuddy(
  buddies: SavedBuddy[],
  nextBuddy: SavedBuddy,
): SavedBuddy[] {
  const existingBuddy = buddies.find(
    (buddy) => buddy.buddyUid === nextBuddy.buddyUid,
  );

  if (!existingBuddy) {
    return [nextBuddy, ...buddies];
  }

  return buddies.map((buddy) =>
    buddy.buddyUid === nextBuddy.buddyUid
      ? {
          ...buddy,
          buddyCode: nextBuddy.buddyCode ?? buddy.buddyCode,
          email: nextBuddy.email ?? buddy.email,
          username: nextBuddy.username ?? buddy.username,
          displayName: nextBuddy.displayName ?? buddy.displayName,
          photoURL: nextBuddy.photoURL ?? buddy.photoURL,
          status: 'active',
          source: nextBuddy.source,
          updatedAt: nextBuddy.updatedAt,
        }
      : buddy,
  );
}

export const useSavedBuddies = create<SavedBuddiesState>((set, get) => ({
  buddies: [],
  isLoading: false,
  errorMessage: null,

  loadSavedBuddies: async () => {
    set({
      isLoading: true,
      errorMessage: null,
    });

    try {
      const buddies = await loadSavedBuddiesFromFirestore();

      set({
        buddies,
        isLoading: false,
        errorMessage: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Buddy-Liste konnte nicht geladen werden.',
      });
    }
  },

  saveBuddy: async (params) => {
    const existingBuddy =
      get().buddies.find((buddy) => buddy.buddyUid === params.buddyUid) ?? null;

    const localBuddy = createLocalSavedBuddy(params);

    set((state) => ({
      buddies: upsertSavedBuddy(state.buddies, localBuddy),
      errorMessage: null,
    }));

    try {
      const savedBuddy = await saveBuddyToFirestore(params, existingBuddy);

      set((state) => ({
        buddies: upsertSavedBuddy(state.buddies, savedBuddy),
        errorMessage: null,
      }));
    } catch (error) {
      set({
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Buddy konnte nicht dauerhaft gespeichert werden.',
      });

      throw error;
    }
  },

  removeBuddyLocally: (buddyUid) => {
    set((state) => ({
      buddies: state.buddies.filter((buddy) => buddy.buddyUid !== buddyUid),
    }));
  },

  removeBuddy: async (buddyUid) => {
    await removeBuddyRelationship(buddyUid);
    get().removeBuddyLocally(buddyUid);
  },

  isBuddySaved: (buddyUid) => {
    if (!buddyUid) {
      return false;
    }

    return get().buddies.some(
      (buddy) => buddy.buddyUid === buddyUid && buddy.status === 'active',
    );
  },
}));
