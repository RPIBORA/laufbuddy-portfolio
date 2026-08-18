// src/services/savedBuddiesFirestoreService.ts
import {
  collection,
  doc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { db } from '../app_core/firebase';
import { getFirebaseAuth } from './firebaseAuthService';
import {
  SaveBuddyParams,
  SavedBuddy,
} from '../app_core/models/BuddyModels';

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  return trimmedValue;
}

function getCurrentUserUid(): string {
  const currentUser = getFirebaseAuth().currentUser;

  if (!currentUser) {
    throw new Error('Kein eingeloggter User für Buddy-Liste gefunden.');
  }

  return currentUser.uid;
}

function createSavedBuddyFromParams(
  params: SaveBuddyParams,
  existingBuddy?: SavedBuddy | null,
): SavedBuddy {
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
    addedAt: existingBuddy?.addedAt ?? now,
    updatedAt: now,
    lastRunTogetherAt: existingBuddy?.lastRunTogetherAt ?? null,
  };
}

function mapFirestoreBuddy(data: Record<string, unknown>): SavedBuddy | null {
  const buddyUid = normalizeOptionalText(data.buddyUid);

  if (!buddyUid) {
    return null;
  }

  const status =
    data.status === 'blocked' || data.status === 'removed'
      ? data.status
      : 'active';

  const source =
    data.source === 'permanent_buddy_code' ||
    data.source === 'manual' ||
    data.source === 'live_run_code'
      ? data.source
      : 'manual';

  return {
    buddyUid,
    buddyCode: normalizeOptionalText(data.buddyCode),
    email: normalizeOptionalText(data.email),
    username: normalizeOptionalText(data.username),
    displayName: normalizeOptionalText(data.displayName),
    photoURL: normalizeOptionalText(data.photoURL),
    status,
    source,
    addedAt: typeof data.addedAt === 'number' ? data.addedAt : Date.now(),
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
    lastRunTogetherAt:
      typeof data.lastRunTogetherAt === 'number' ? data.lastRunTogetherAt : null,
  };
}

export async function loadSavedBuddiesFromFirestore(): Promise<SavedBuddy[]> {
  const uid = getCurrentUserUid();

  const buddiesRef = collection(db, 'users', uid, 'buddies');
  const snapshot = await getDocs(buddiesRef);

  const buddies: SavedBuddy[] = [];

  snapshot.forEach((entry) => {
    const buddy = mapFirestoreBuddy(entry.data());

    if (buddy && buddy.status === 'active') {
      buddies.push(buddy);
    }
  });

  return buddies.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveBuddyToFirestore(
  params: SaveBuddyParams,
  existingBuddy?: SavedBuddy | null,
): Promise<SavedBuddy> {
  const uid = getCurrentUserUid();
  const savedBuddy = createSavedBuddyFromParams(params, existingBuddy);

  await setDoc(
    doc(db, 'users', uid, 'buddies', savedBuddy.buddyUid),
    savedBuddy,
    { merge: true },
  );

  return savedBuddy;
}