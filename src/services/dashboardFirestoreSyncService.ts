import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../app_core/firebase';
import type { RunHistoryEntry, Shoe } from '../app_core/models/ShoeModels';
import { getFirebaseAuth } from './firebaseAuthService';
import {
  canSyncActiveLocalData,
  getActiveLocalDataScopeUid,
} from './localDataScopeService';
import { syncRunHistoryEntriesToFirestore } from './runHistoryFirestoreSyncService';

type BodyProfileSyncSnapshot = {
  currentWeightKg: number | null;
  heightCm: number | null;
  shoeSizeEu?: number | null;
  updatedAt: number | null;
};

type DashboardSyncSnapshot = {
  runs: RunHistoryEntry[];
  shoes: Shoe[];
  bodyProfile: BodyProfileSyncSnapshot;
};

function removeUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => removeUndefinedDeep(entry));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};

    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (entry === undefined) {
        return;
      }

      result[key] = removeUndefinedDeep(entry);
    });

    return result;
  }

  return value;
}

function currentFirebaseUid(): string | null {
  return getFirebaseAuth().currentUser?.uid ?? null;
}

function canSyncForOwner(localOwnerUid: string | null): boolean {
  return canSyncActiveLocalData(localOwnerUid, currentFirebaseUid());
}

export async function syncShoesToFirestore(
  shoes: Shoe[],
  localOwnerUid: string | null,
): Promise<void> {
  const firebaseUser = getFirebaseAuth().currentUser;

  if (!firebaseUser || !canSyncForOwner(localOwnerUid)) {
    console.log('[DashboardFirestoreSync] Kein eingeloggter User - Schuhe bleiben lokal.', {
      shoesCount: shoes.length,
    });
    return;
  }

  for (const shoe of shoes) {
    if (!canSyncForOwner(localOwnerUid)) return;
    const shoePayload = removeUndefinedDeep({
      ...shoe,
      ownerUid: firebaseUser.uid,
      syncSchemaVersion: 1,
    }) as Record<string, unknown>;

    await setDoc(
      doc(db, 'users', firebaseUser.uid, 'shoes', shoe.id),
      {
        ...shoePayload,
        syncedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  console.log('[DashboardFirestoreSync] Schuhe nach Firestore synchronisiert:', {
    shoesCount: shoes.length,
    uid: firebaseUser.uid,
  });
}

export function queueShoeFirestoreSync(shoe: Shoe): void {
  const localOwnerUid = getActiveLocalDataScopeUid();
  void syncShoesToFirestore([shoe], localOwnerUid).catch((error) => {
    console.warn('[DashboardFirestoreSync] Schuh-Sync fehlgeschlagen:', {
      shoeId: shoe.id,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

export function queueShoesFirestoreSync(shoes: Shoe[]): void {
  const localOwnerUid = getActiveLocalDataScopeUid();
  void syncShoesToFirestore(shoes, localOwnerUid).catch((error) => {
    console.warn('[DashboardFirestoreSync] Schuhe-Sync fehlgeschlagen:', {
      shoesCount: shoes.length,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function syncBodyProfileToFirestore(
  bodyProfile: BodyProfileSyncSnapshot,
  localOwnerUid: string | null,
): Promise<void> {
  const firebaseUser = getFirebaseAuth().currentUser;

  if (!firebaseUser || !canSyncForOwner(localOwnerUid)) {
    console.log('[DashboardFirestoreSync] Kein eingeloggter User - Körperprofil bleibt lokal.');
    return;
  }

  const bodyPayload = removeUndefinedDeep({
    currentWeightKg: bodyProfile.currentWeightKg,
    heightCm: bodyProfile.heightCm,
    shoeSizeEu: bodyProfile.shoeSizeEu ?? null,
    updatedAt: bodyProfile.updatedAt,
    syncSchemaVersion: 1,
  }) as Record<string, unknown>;

  await setDoc(
    doc(db, 'users', firebaseUser.uid, 'body', 'profile'),
    {
      ...bodyPayload,
      ownerUid: firebaseUser.uid,
      syncedAt: serverTimestamp(),
    },
    { merge: true },
  );

  console.log('[DashboardFirestoreSync] Körperprofil nach Firestore synchronisiert:', {
    uid: firebaseUser.uid,
  });
}

export function queueBodyProfileFirestoreSync(
  bodyProfile: BodyProfileSyncSnapshot,
): void {
  const localOwnerUid = getActiveLocalDataScopeUid();
  void syncBodyProfileToFirestore(bodyProfile, localOwnerUid).catch((error) => {
    console.warn('[DashboardFirestoreSync] Körperprofil-Sync fehlgeschlagen:', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function syncDashboardSnapshotToFirestore(
  snapshot: DashboardSyncSnapshot,
  localOwnerUid: string | null,
): Promise<void> {
  const firebaseUser = getFirebaseAuth().currentUser;

  if (!firebaseUser || !canSyncForOwner(localOwnerUid)) {
    console.log('[DashboardFirestoreSync] Kein eingeloggter User - Dashboard-Sync bleibt lokal.', {
      runsCount: snapshot.runs.length,
      shoesCount: snapshot.shoes.length,
    });
    return;
  }

  await syncRunHistoryEntriesToFirestore(snapshot.runs, localOwnerUid);
  if (!canSyncForOwner(localOwnerUid)) return;
  await syncShoesToFirestore(snapshot.shoes, localOwnerUid);
  if (!canSyncForOwner(localOwnerUid)) return;
  await syncBodyProfileToFirestore(snapshot.bodyProfile, localOwnerUid);
  if (!canSyncForOwner(localOwnerUid)) return;

  await setDoc(
    doc(db, 'users', firebaseUser.uid, 'sync', 'dashboard'),
    {
      ownerUid: firebaseUser.uid,
      runsCount: snapshot.runs.length,
      shoesCount: snapshot.shoes.length,
      bodyProfileUpdatedAt: snapshot.bodyProfile.updatedAt,
      syncSchemaVersion: 1,
      lastFullSyncAt: serverTimestamp(),
    },
    { merge: true },
  );

  console.log('[DashboardFirestoreSync] Dashboard-Snapshot synchronisiert:', {
    runsCount: snapshot.runs.length,
    shoesCount: snapshot.shoes.length,
    uid: firebaseUser.uid,
  });
}

export function queueDashboardSnapshotFirestoreSync(
  snapshot: DashboardSyncSnapshot,
  localOwnerUid: string | null,
): void {
  void syncDashboardSnapshotToFirestore(snapshot, localOwnerUid).catch((error) => {
    console.warn('[DashboardFirestoreSync] Dashboard-Snapshot-Sync fehlgeschlagen:', {
      runsCount: snapshot.runs.length,
      shoesCount: snapshot.shoes.length,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}
