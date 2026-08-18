import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../app_core/firebase';
import type { RunHistoryEntry } from '../app_core/models/ShoeModels';
import { getFirebaseAuth } from './firebaseAuthService';
import {
  canSyncActiveLocalData,
  getActiveLocalDataScopeUid,
} from './localDataScopeService';

const ROUTE_CHUNK_SIZE = 400;
const RUN_SYNC_INDEX_STORAGE_KEY_PREFIX = 'laufbuddy_firestore_run_sync_v1';
const RUN_SYNC_SCHEMA_VERSION = 1;
const RUN_SYNC_DEBOUNCE_MS = 1200;

type PendingRunSync = {
  run: RunHistoryEntry;
  localOwnerUid: string | null;
};

const pendingRunSyncTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

const pendingRunsByKey = new Map<string, PendingRunSync>();

type RunSyncResult = 'uploaded' | 'skipped' | 'local-only';

type RunSyncIndexEntry = {
  summaryHash: string;
  routeHash: string;
  syncSchemaVersion: number;
};

type RunSyncIndex = Record<string, RunSyncIndexEntry>;

const runSyncIndexCache = new Map<string, RunSyncIndex>();
const runSyncChainsByUid = new Map<string, Promise<unknown>>();

function getRunSyncIndexStorageKey(uid: string): string {
  return `${RUN_SYNC_INDEX_STORAGE_KEY_PREFIX}:${uid}`;
}

function sortForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortForStableStringify(entry));
  }

  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};

    Object.keys(source)
      .sort()
      .forEach((key) => {
        if (source[key] !== undefined) {
          sorted[key] = sortForStableStringify(source[key]);
        }
      });

    return sorted;
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableStringify(value));
}

function hashString(value: string): string {
  let fnvHash = 2166136261;
  let secondaryHash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    const characterCode = value.charCodeAt(index);

    fnvHash ^= characterCode;
    fnvHash = Math.imul(fnvHash, 16777619);

    secondaryHash =
      Math.imul(secondaryHash, 33) ^ characterCode;
  }

  return [
    value.length.toString(36),
    (fnvHash >>> 0).toString(36),
    (secondaryHash >>> 0).toString(36),
  ].join('-');
}

async function loadRunSyncIndex(uid: string): Promise<RunSyncIndex> {
  const cachedIndex = runSyncIndexCache.get(uid);

  if (cachedIndex) {
    return cachedIndex;
  }

  try {
    const rawValue = await AsyncStorage.getItem(
      getRunSyncIndexStorageKey(uid),
    );

    if (!rawValue) {
      const emptyIndex: RunSyncIndex = {};
      runSyncIndexCache.set(uid, emptyIndex);
      return emptyIndex;
    }

    const parsedValue = JSON.parse(rawValue);

    if (
      parsedValue === null ||
      typeof parsedValue !== 'object' ||
      Array.isArray(parsedValue)
    ) {
      throw new Error('Ungültiges Format des Lauf-Sync-Index');
    }

    const parsedIndex = parsedValue as RunSyncIndex;
    runSyncIndexCache.set(uid, parsedIndex);
    return parsedIndex;
  } catch (error) {
    console.warn('[RunHistoryFirestoreSync] Lokaler Sync-Index konnte nicht gelesen werden:', {
      uid,
      message: error instanceof Error ? error.message : String(error),
    });

    const emptyIndex: RunSyncIndex = {};
    runSyncIndexCache.set(uid, emptyIndex);
    return emptyIndex;
  }
}

async function persistRunSyncIndex(
  uid: string,
  index: RunSyncIndex,
): Promise<void> {
  runSyncIndexCache.set(uid, index);

  await AsyncStorage.setItem(
    getRunSyncIndexStorageKey(uid),
    JSON.stringify(index),
  );
}

async function withRunSyncLock<T>(
  uid: string,
  task: () => Promise<T>,
): Promise<T> {
  const previousTask =
    runSyncChainsByUid.get(uid) ?? Promise.resolve();

  const currentTask = previousTask
    .catch(() => undefined)
    .then(task);

  runSyncChainsByUid.set(uid, currentTask);

  try {
    return await currentTask;
  } finally {
    if (runSyncChainsByUid.get(uid) === currentTask) {
      runSyncChainsByUid.delete(uid);
    }
  }
}


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

function createRouteChunkId(chunkIndex: number): string {
  return String(chunkIndex).padStart(4, '0');
}

function buildRunSummaryPayload(run: RunHistoryEntry): Record<string, unknown> {
  const route = run.route ?? null;
  const routePoints = route?.routePoints ?? [];
  const routeChunksCount =
    routePoints.length === 0 ? 0 : Math.ceil(routePoints.length / ROUTE_CHUNK_SIZE);

  const routeWithoutPoints =
    route === null
      ? null
      : {
          routeDistanceKm: route.routeDistanceKm,
          routeFingerprint: route.routeFingerprint,
          routeGroupId: route.routeGroupId,
          startLatitude: route.startLatitude,
          startLongitude: route.startLongitude,
          endLatitude: route.endLatitude,
          endLongitude: route.endLongitude,
          elevationGainMeters: route.elevationGainMeters,
          elevationLossMeters: route.elevationLossMeters,
          maxAltitudeMeters: route.maxAltitudeMeters,
          minAltitudeMeters: route.minAltitudeMeters,
          climbIntensity: route.climbIntensity,
          descentIntensity: route.descentIntensity,
          flatRatio: route.flatRatio,
          surfaceType: route.surfaceType,
          hasRoutePoints: routePoints.length > 0,
          routePointsCount: routePoints.length,
          routeChunksCount,
          routeChunkSize: ROUTE_CHUNK_SIZE,
        };

  return removeUndefinedDeep({
    ...run,
    route: routeWithoutPoints,
    routePointsStoredSeparately: routePoints.length > 0,
    routePointsCount: routePoints.length,
    routeChunksCount,
    routeChunkSize: ROUTE_CHUNK_SIZE,
    syncSchemaVersion: 1,
  }) as Record<string, unknown>;
}

async function syncRunRouteChunksToFirestore(
  uid: string,
  run: RunHistoryEntry,
  localOwnerUid: string | null,
): Promise<void> {
  if (!canSyncActiveLocalData(localOwnerUid, getFirebaseAuth().currentUser?.uid)) {
    return;
  }
  const routePoints = run.route?.routePoints ?? [];
  const runRef = doc(db, 'users', uid, 'runs', run.id);
  const routeChunksRef = collection(runRef, 'routeChunks');
  const expectedChunkIds = new Set<string>();
  const operations: Promise<void>[] = [];

  for (let startIndex = 0; startIndex < routePoints.length; startIndex += ROUTE_CHUNK_SIZE) {
    if (!canSyncActiveLocalData(localOwnerUid, getFirebaseAuth().currentUser?.uid)) {
      return;
    }
    const chunkIndex = Math.floor(startIndex / ROUTE_CHUNK_SIZE);
    const chunkId = createRouteChunkId(chunkIndex);
    const points = routePoints.slice(startIndex, startIndex + ROUTE_CHUNK_SIZE);

    expectedChunkIds.add(chunkId);

    const chunkPayload = removeUndefinedDeep({
      ownerUid: uid,
      runId: run.id,
      chunkIndex,
      fromPointIndex: startIndex,
      toPointIndex: startIndex + points.length - 1,
      pointsCount: points.length,
      points,
      syncSchemaVersion: 1,
    }) as Record<string, unknown>;

    operations.push(
      setDoc(
        doc(routeChunksRef, chunkId),
        {
          ...chunkPayload,
          syncedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    );
  }

  const existingChunks = await getDocs(routeChunksRef);

  if (!canSyncActiveLocalData(localOwnerUid, getFirebaseAuth().currentUser?.uid)) {
    return;
  }

  existingChunks.docs.forEach((chunkDoc) => {
    if (!expectedChunkIds.has(chunkDoc.id)) {
      operations.push(deleteDoc(chunkDoc.ref));
    }
  });

  await Promise.all(operations);
}

export async function syncRunHistoryEntryToFirestore(
  run: RunHistoryEntry,
  localOwnerUid: string | null,
): Promise<RunSyncResult> {
  const firebaseUser = getFirebaseAuth().currentUser;

  if (!firebaseUser || !canSyncActiveLocalData(localOwnerUid, firebaseUser.uid)) {
    console.log('[RunHistoryFirestoreSync] Kein eingeloggter User - Lauf bleibt lokal.', {
      runId: run.id,
    });
    return 'local-only';
  }

  return withRunSyncLock(firebaseUser.uid, async () => {
    const uid = firebaseUser.uid;
    if (!canSyncActiveLocalData(localOwnerUid, getFirebaseAuth().currentUser?.uid)) {
      return 'local-only';
    }
    const runRef = doc(db, 'users', uid, 'runs', run.id);
    const routePoints = run.route?.routePoints ?? [];
    const summaryPayload = buildRunSummaryPayload(run);

    const summaryHash = hashString(
      stableStringify(summaryPayload),
    );

    const routeHash = hashString(
      stableStringify({
        routePoints,
        routeChunkSize: ROUTE_CHUNK_SIZE,
        syncSchemaVersion: RUN_SYNC_SCHEMA_VERSION,
      }),
    );

    const syncIndex = await loadRunSyncIndex(uid);
    const previousEntry = syncIndex[run.id];

    const summaryChanged =
      previousEntry?.summaryHash !== summaryHash ||
      previousEntry?.syncSchemaVersion !== RUN_SYNC_SCHEMA_VERSION;

    const routeChanged =
      previousEntry?.routeHash !== routeHash ||
      previousEntry?.syncSchemaVersion !== RUN_SYNC_SCHEMA_VERSION;

    if (!summaryChanged && !routeChanged) {
      console.log('[RunHistoryFirestoreSync] Lauf unverändert - Sync übersprungen:', {
        runId: run.id,
        uid,
      });

      return 'skipped';
    }

    if (!canSyncActiveLocalData(localOwnerUid, getFirebaseAuth().currentUser?.uid)) {
      return 'local-only';
    }
    await setDoc(
      runRef,
      {
        ...summaryPayload,
        ownerUid: uid,
        contentHash: summaryHash,
        routeContentHash: routeHash,
        syncedAt: serverTimestamp(),
      },
      { merge: true },
    );

    if (routeChanged) {
      if (!canSyncActiveLocalData(localOwnerUid, getFirebaseAuth().currentUser?.uid)) {
        return 'local-only';
      }
      await syncRunRouteChunksToFirestore(uid, run, localOwnerUid);
    }

    if (!canSyncActiveLocalData(localOwnerUid, getFirebaseAuth().currentUser?.uid)) {
      return 'local-only';
    }

    syncIndex[run.id] = {
      summaryHash,
      routeHash,
      syncSchemaVersion: RUN_SYNC_SCHEMA_VERSION,
    };

    await persistRunSyncIndex(uid, syncIndex);

    console.log('[RunHistoryFirestoreSync] Lauf nach Firestore synchronisiert:', {
      runId: run.id,
      uid,
      routePointsCount: routePoints.length,
      summaryChanged,
      routeChanged,
    });

    return 'uploaded';
  });
}

export async function syncRunHistoryEntriesToFirestore(
  runs: RunHistoryEntry[],
  localOwnerUid: string | null,
): Promise<void> {
  const firebaseUser = getFirebaseAuth().currentUser;

  if (!firebaseUser || !canSyncActiveLocalData(localOwnerUid, firebaseUser.uid)) {
    console.log('[RunHistoryFirestoreSync] Kein eingeloggter User - Laufhistorie bleibt lokal.', {
      runsCount: runs.length,
    });
    return;
  }

  let uploadedCount = 0;
  let skippedCount = 0;

  for (const run of runs) {
    if (!canSyncActiveLocalData(localOwnerUid, getFirebaseAuth().currentUser?.uid)) return;
    const result = await syncRunHistoryEntryToFirestore(run, localOwnerUid);

    if (result === 'uploaded') {
      uploadedCount += 1;
    } else if (result === 'skipped') {
      skippedCount += 1;
    }
  }

  console.log('[RunHistoryFirestoreSync] Laufhistorie nach Firestore synchronisiert:', {
    runsCount: runs.length,
    uploadedCount,
    skippedCount,
    uid: firebaseUser.uid,
  });
}

export function queueRunHistoryFirestoreSync(run: RunHistoryEntry): void {
  const localOwnerUid = getActiveLocalDataScopeUid();
  const scheduledUid = getFirebaseAuth().currentUser?.uid ?? null;
  if (!canSyncActiveLocalData(localOwnerUid, scheduledUid)) return;
  const queueKey = `${localOwnerUid ?? 'local'}:${run.id}`;
  const existingTimer = pendingRunSyncTimers.get(queueKey);

  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  pendingRunsByKey.set(queueKey, {
    run,
    localOwnerUid,
  });

  const timer = setTimeout(() => {
    pendingRunSyncTimers.delete(queueKey);

    const pendingSync = pendingRunsByKey.get(queueKey);
    pendingRunsByKey.delete(queueKey);

    if (!pendingSync) {
      return;
    }

    const currentUid = getFirebaseAuth().currentUser?.uid ?? null;

    if (!canSyncActiveLocalData(pendingSync.localOwnerUid, currentUid)) {
      console.log(
        '[RunHistoryFirestoreSync] Auth geändert - verzögerter Lauf-Sync übersprungen:',
        {
          runId: pendingSync.run.id,
          localOwnerUid: pendingSync.localOwnerUid,
          currentUid,
        },
      );
      return;
    }

    void syncRunHistoryEntryToFirestore(
      pendingSync.run,
      pendingSync.localOwnerUid,
    ).catch((error) => {
      console.warn('[RunHistoryFirestoreSync] Firestore-Sync fehlgeschlagen:', {
        runId: pendingSync.run.id,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, RUN_SYNC_DEBOUNCE_MS);

  pendingRunSyncTimers.set(queueKey, timer);
}

export function queueRunHistoryEntriesFirestoreSync(
  runs: RunHistoryEntry[],
): void {
  const localOwnerUid = getActiveLocalDataScopeUid();
  void syncRunHistoryEntriesToFirestore(runs, localOwnerUid).catch((error) => {
    console.warn('[RunHistoryFirestoreSync] Laufhistorie-Sync fehlgeschlagen:', {
      runsCount: runs.length,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}
