import { createHash, randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  createInvitationExpirationMs,
  isValidInvitationToken,
  validateInvitationAcceptance,
} from './invitationPolicy.js';
import { acceptBuddyInvitationTransaction, closeBuddyRoomTransaction, removeBuddyRelationshipTransaction, startBuddyConnectionTransaction } from './buddyTransactionService.js';

initializeApp();

const db = getFirestore();

function buddyRef(uid: string, buddyUid: string) {
  return db.collection('users').doc(uid).collection('buddies').doc(buddyUid);
}
function buddyDocument(buddyUid: string) {
  return {
    schemaVersion: 1,
    buddyUid,
    displayName: null,
    status: 'active',
    source: 'invitation',
    addedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastRunTogetherAt: null,
  };
}

function requireBuddyUid(data: unknown): string {
  const buddyUid = data && typeof data === 'object' && typeof (data as { buddyUid?: unknown }).buddyUid === 'string'
    ? (data as { buddyUid: string }).buddyUid.trim()
    : '';
  if (!buddyUid) throw new HttpsError('invalid-argument', 'Ein gültiger LaufBuddy ist erforderlich.');
  return buddyUid;
}

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Firebase-Anmeldung ist erforderlich.');
  }
  return auth.uid;
}

function requireToken(data: unknown): string {
  if (!data || typeof data !== 'object' || typeof (data as { token?: unknown }).token !== 'string') {
    throw new HttpsError('invalid-argument', 'Ein gültiger Einladungs-Token ist erforderlich.');
  }
  const token = (data as { token: string }).token.trim();
  if (!isValidInvitationToken(token)) {
    throw new HttpsError('invalid-argument', 'Der Einladungs-Token ist ungültig.');
  }
  return token;
}

function invitationIdForToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function errorForAcceptanceFailure(reason: ReturnType<typeof validateInvitationAcceptance>): never {
  if (reason === 'self-acceptance') throw new HttpsError('failed-precondition', 'Eigene Einladungen können nicht angenommen werden.');
  if (reason === 'already-accepted') throw new HttpsError('already-exists', 'Diese Einladung wurde bereits verwendet.');
  throw new HttpsError('failed-precondition', 'Diese Einladung ist abgelaufen.');
}

export const createBuddyInvitation = onCall(async (request) => {
  const inviterUid = requireUid(request.auth);
  const token = randomBytes(32).toString('base64url');
  const invitationId = invitationIdForToken(token);
  const now = Date.now();
  const expiresAtMs = createInvitationExpirationMs(now);

  await db.collection('buddy_invitations').doc(invitationId).create({
    schemaVersion: 1,
    inviterUid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(expiresAtMs),
    acceptedAt: null,
    acceptedByUid: null,
    roomId: null,
  });

  return { invitationId, token, expiresAtMs };
});

export const acceptBuddyInvitation = onCall(async (request) => {
  const calleeUid = requireUid(request.auth);
  const token = requireToken(request.data);
  const result = await acceptBuddyInvitationTransaction(db, calleeUid, token);
  return { roomId: result.roomId, role: 'callee', buddyUid: result.inviterUid };
});

/*
  Transaction implementations live in buddyTransactionService.ts so they can run
  unchanged against the local Firestore emulator.
*/
/*
  Legacy body retained below only temporarily by the patch tool's context; it is
  unreachable and removed by the following block replacement.
*/
/*
  const result = await db.runTransaction(async (transaction) => {
    const invitationSnapshot = await transaction.get(invitationRef);
    if (!invitationSnapshot.exists) {
      throw new HttpsError('not-found', 'Einladung nicht gefunden oder ungültig.');
    }

    const data = invitationSnapshot.data();
    if (!data) {
      throw new HttpsError('failed-precondition', 'Einladung hat ein ungültiges Format.');
    }
    const inviterUid = data.inviterUid;
    const expiresAt = data.expiresAt;
    if (typeof inviterUid !== 'string' || !(expiresAt instanceof Timestamp)) {
      throw new HttpsError('failed-precondition', 'Einladung hat ein ungültiges Format.');
    }

    const reason = validateInvitationAcceptance({
      invitation: {
        inviterUid,
        expiresAtMs: expiresAt.toMillis(),
        acceptedAtMs: data.acceptedAt instanceof Timestamp ? data.acceptedAt.toMillis() : data.acceptedAt ? 0 : null,
      },
      acceptingUid: calleeUid,
      nowMs: Date.now(),
    });
    if (reason) errorForAcceptanceFailure(reason);

    transaction.create(roomRef, {
      schemaVersion: 1,
      participantUids: [inviterUid, calleeUid],
      callerUid: inviterUid,
      calleeUid,
      createdAt: FieldValue.serverTimestamp(),
      offer: null,
      answer: null,
    });
    transaction.update(invitationRef, {
      acceptedAt: FieldValue.serverTimestamp(),
      acceptedByUid: calleeUid,
      roomId: roomRef.id,
    });
    transaction.set(buddyRef(inviterUid, calleeUid), buddyDocument(calleeUid), { merge: true });
    transaction.set(buddyRef(calleeUid, inviterUid), buddyDocument(inviterUid), { merge: true });
    return { roomId: roomRef.id, inviterUid };
  });

  return { roomId: result.roomId, role: 'callee', buddyUid: result.inviterUid };
});
*/

export const startBuddyConnection = onCall(async (request) => {
  const callerUid = requireUid(request.auth);
  const calleeUid = requireBuddyUid(request.data);
  if (callerUid === calleeUid) throw new HttpsError('failed-precondition', 'Eigene LaufBuddys können nicht verbunden werden.');

  return startBuddyConnectionTransaction(db, callerUid, calleeUid);
  /* await db.runTransaction(async (transaction) => {
    const [callerBuddy, calleeBuddy] = await Promise.all([
      transaction.get(buddyRef(callerUid, calleeUid)),
      transaction.get(buddyRef(calleeUid, callerUid)),
    ]);
    if (!callerBuddy.exists || !calleeBuddy.exists || callerBuddy.data()?.status !== 'active' || calleeBuddy.data()?.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Diese LaufBuddy-Verknüpfung besteht nicht mehr.');
    }
    transaction.create(roomRef, {
      schemaVersion: 1,
      participantUids: [callerUid, calleeUid],
      callerUid,
      calleeUid,
      createdAt: FieldValue.serverTimestamp(),
      offer: null,
      answer: null,
    });
  });
  return { roomId: roomRef.id, role: 'caller' as const, buddyUid: calleeUid };
});
  */
});

export const removeBuddyRelationship = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const buddyUid = requireBuddyUid(request.data);
  if (uid === buddyUid) throw new HttpsError('failed-precondition', 'Eigene LaufBuddys können nicht entfernt werden.');

  return removeBuddyRelationshipTransaction(db, uid, buddyUid);
  /* await db.runTransaction(async (transaction) => {
    const [ownBuddy, peerBuddy] = await Promise.all([
      transaction.get(buddyRef(uid, buddyUid)),
      transaction.get(buddyRef(buddyUid, uid)),
    ]);
    if (!ownBuddy.exists || !peerBuddy.exists) {
      throw new HttpsError('not-found', 'Die LaufBuddy-Verknüpfung besteht nicht mehr.');
    }
    transaction.delete(buddyRef(uid, buddyUid));
    transaction.delete(buddyRef(buddyUid, uid));
  });
  return { removed: true };
});
  */
});

export const closeBuddyRoom = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const roomId = request.data && typeof request.data === 'object' && typeof (request.data as { roomId?: unknown }).roomId === 'string'
    ? (request.data as { roomId: string }).roomId.trim()
    : '';
  if (!roomId) throw new HttpsError('invalid-argument', 'Eine Raum-ID ist erforderlich.');

  return closeBuddyRoomTransaction(db, uid, roomId);
  /* await db.runTransaction(async (transaction) => {
    const room = await transaction.get(roomRef);
    const roomData = room.data();
    if (!room.exists || !roomData || !Array.isArray(roomData.participantUids) || !roomData.participantUids.includes(uid)) {
      throw new HttpsError('permission-denied', 'Kein Zugriff auf diesen Buddy-Raum.');
    }
    transaction.update(roomRef, { closedAt: FieldValue.serverTimestamp(), closedByUid: uid });
  });
  return { closed: true };
});
  */
});
