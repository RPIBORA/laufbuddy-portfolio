import * as Crypto from 'expo-crypto';
import { Share } from 'react-native';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../app_core/firebase';
import { useRunStatus } from '../../app_core/state/useRunStatus';
import { useAuthStore } from '../../state/authStore';
import { getFirebaseAuth } from '../firebaseAuthService';
import { voicePrompts } from '../../config/voicePrompts';
import { LIVE_CONNECTION_GRACE_MS, createLiveCompanionMachine, createLiveSessionId, isLiveShareAllowed, reduceLiveCompanionState } from './liveSessionLogic';
import { clearTemporaryLiveBuddyContact } from './liveBuddyContactService';
import { syncTemporaryLiveBuddyContactToNative } from '../nativeEmergencyContactSyncService';

const LIVE_HOST = 'https://live.laufbuddy.app';
const HEARTBEAT_MS = 5_000;
let sessionId: string | null = null, lastPositionTimestamp: number | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null, connectionUnsubscribe: Unsubscribe | null = null, evaluationTimer: ReturnType<typeof setInterval> | null = null;
let machine = createLiveCompanionMachine();

const toMs = (value: unknown): number | null => value && typeof (value as { toMillis?: unknown }).toMillis === 'function' ? (value as { toMillis(): number }).toMillis() : null;
const ref = () => sessionId ? doc(db, 'liveSessions', sessionId) : null;

async function publish(): Promise<void> {
  const user = getFirebaseAuth().currentUser, currentRef = ref(); if (!user || !currentRef) return;
  const run = useRunStatus.getState(), last = run.routePoints.at(-1) ?? null;
  const payload: Record<string, unknown> = { ownerUid: user.uid, runnerName: useAuthStore.getState().user?.username?.trim() || useAuthStore.getState().user?.displayName?.trim() || 'LaufBuddy', sessionStatus: ['stopped', 'failed'].includes(run.sessionStatus) ? 'ended' : 'active', lastAppHeartbeatAt: serverTimestamp(), route: run.routePoints.slice(-160).map(point => ({ latitude: point.latitude, longitude: point.longitude })), distanceKm: run.distanceKm, durationSeconds: run.durationSeconds, averagePaceSecondsPerKm: run.averagePaceSecondsPerKm, updatedAt: serverTimestamp() };
  if (last && last.timestamp !== lastPositionTimestamp) { payload.lastPosition = { latitude: last.latitude, longitude: last.longitude, accuracyMeters: last.accuracyMeters }; payload.lastPositionReceivedAt = serverTimestamp(); lastPositionTimestamp = last.timestamp; }
  await setDoc(currentRef, payload, { merge: true });
}
function beginConnectionMonitor(): void {
  connectionUnsubscribe?.(); if (evaluationTimer) clearInterval(evaluationTimer); machine = createLiveCompanionMachine(); if (!sessionId) return;
  let values: Record<string, unknown>[] = [];
  const evaluate = () => { let confirmed = false, connected = false, endedRevision = 0; const now = Date.now(); values.forEach(value => { confirmed ||= toMs(value.confirmedAt) !== null; const beat = toMs(value.lastHeartbeatAt); connected ||= value.status === 'connected' && beat !== null && now - beat < LIVE_CONNECTION_GRACE_MS; endedRevision = Math.max(endedRevision, typeof value.endedRevision === 'number' ? value.endedRevision : 0); }); const result = reduceLiveCompanionState(machine, { confirmed, connected, endedRevision }); machine = result.state; const texts = { confirmed: 'Begleitung wurde bestätigt.', disconnected: 'Verbindung zur Begleitung unterbrochen.', restored: 'Begleitperson ist wieder da.', ended: 'Begleitung beendet.' }; if (result.transition) voicePrompts.speakText(texts[result.transition]); };
  connectionUnsubscribe = onSnapshot(collection(db, 'liveSessions', sessionId, 'connections'), snapshot => { values = snapshot.docs.map(entry => entry.data()); evaluate(); });
  evaluationTimer = setInterval(evaluate, 1_000);
}

function startHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    void publish().catch((error: unknown) => {
      console.warn('[LiveSession] Heartbeat konnte nicht veröffentlicht werden.', error);
    });
  }, HEARTBEAT_MS);
}

async function cleanupLocalSession(): Promise<void> {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;

  connectionUnsubscribe?.();
  connectionUnsubscribe = null;

  if (evaluationTimer) clearInterval(evaluationTimer);
  evaluationTimer = null;

  sessionId = null;
  lastPositionTimestamp = null;
  machine = createLiveCompanionMachine();
  clearTemporaryLiveBuddyContact();

  try {
    await syncTemporaryLiveBuddyContactToNative(null);
  } catch (error) {
    console.warn(
      '[LiveSession] Temporärer nativer LiveBuddy konnte nicht gelöscht werden.',
      error,
    );
  }
}

export async function shareLiveSession(): Promise<void> {
  const run = useRunStatus.getState();

  if (!isLiveShareAllowed({
    runMode: run.runMode,
    sessionStatus: run.sessionStatus,
  })) {
    throw new Error('Live-Teilen ist für diesen Lauf gerade nicht verfügbar.');
  }

  const user = getFirebaseAuth().currentUser;

  if (!user) {
    throw new Error('Für LaufBuddy Live ist eine Anmeldung erforderlich.');
  }

  if (!sessionId) {
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    sessionId = createLiveSessionId(randomBytes);
    lastPositionTimestamp = null;

    const currentRef = ref();

    if (!currentRef) {
      throw new Error('Live-Sitzung konnte nicht erstellt werden.');
    }

    await setDoc(
      currentRef,
      {
        ownerUid: user.uid,
        runnerName:
          useAuthStore.getState().user?.username?.trim() ||
          useAuthStore.getState().user?.displayName?.trim() ||
          'LaufBuddy',
        sessionStatus: 'active',
        createdAt: serverTimestamp(),
        lastAppHeartbeatAt: serverTimestamp(),
        route: [],
        distanceKm: run.distanceKm,
        durationSeconds: run.durationSeconds,
        averagePaceSecondsPerKm: run.averagePaceSecondsPerKm,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  await publish();
  startHeartbeat();
  beginConnectionMonitor();

  const result = await Share.share({
    message: `Ich teile diesen Lauf live mit dir:\n\n${LIVE_HOST}/${sessionId}`,
  });

  if (result.action === Share.dismissedAction) {
    throw new Error('Das Teilen des Live-Links wurde abgebrochen.');
  }
}

export function activateLiveSessionForStartedRun(): void {
  if (!sessionId) {
    return;
  }

  try {
    if (!heartbeatTimer) {
      startHeartbeat();
    }

    if (!connectionUnsubscribe) {
      beginConnectionMonitor();
    }

    void publish().catch((error: unknown) => {
      console.warn(
        '[LiveSession] Live-Sitzung konnte nach Laufstart nicht aktualisiert werden.',
        error,
      );
    });
  } catch (error) {
    console.warn(
      '[LiveSession] Live-Aktivierung nach Laufstart wurde übersprungen.',
      error,
    );
  }
}

export async function publishLiveCallAttempt(): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  const currentRef = ref();

  if (!user || !currentRef) {
    return;
  }

  await setDoc(
    currentRef,
    {
      ownerUid: user.uid,
      callAttemptRevision: Date.now(),
      callAttemptAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function endLiveSessionSync(
  options: { preserveSessionOnError?: boolean } = {},
): Promise<void> {
  const currentRef = ref();

  if (!sessionId || !currentRef) {
    await cleanupLocalSession();
    return;
  }

  const user = getFirebaseAuth().currentUser;

  if (!user) {
    const error = new Error(
      'Live-Freigabe konnte ohne angemeldeten Benutzer nicht beendet werden.',
    );

    if (options.preserveSessionOnError) {
      throw error;
    }

    console.warn('[LiveSession] Remote-Ende übersprungen.', error);
    await cleanupLocalSession();
    return;
  }

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  try {
    await setDoc(
      currentRef,
      {
        ownerUid: user.uid,
        sessionStatus: 'ended',
        lastAppHeartbeatAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    if (options.preserveSessionOnError) {
      startHeartbeat();
      throw error;
    }

    console.warn(
      '[LiveSession] Remote-Ende fehlgeschlagen; lokale Sitzung wird trotzdem beendet.',
      error,
    );
  }

  await cleanupLocalSession();
}
