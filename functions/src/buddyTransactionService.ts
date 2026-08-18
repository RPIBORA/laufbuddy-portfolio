import { createHash } from 'node:crypto';
import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { validateInvitationAcceptance } from './invitationPolicy.js';

const buddyRef = (db: Firestore, uid: string, buddyUid: string) => db.collection('users').doc(uid).collection('buddies').doc(buddyUid);
const invitationId = (token: string) => createHash('sha256').update(token).digest('hex');
const buddyDocument = (buddyUid: string) => ({ schemaVersion: 1, buddyUid, displayName: null, status: 'active', source: 'invitation', addedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastRunTogetherAt: null });
const roomDocument = (callerUid: string, calleeUid: string) => ({ schemaVersion: 1, participantUids: [callerUid, calleeUid], callerUid, calleeUid, createdAt: FieldValue.serverTimestamp(), offer: null, answer: null });

export async function acceptBuddyInvitationTransaction(db: Firestore, calleeUid: string, token: string) {
  const invitationRef = db.collection('buddy_invitations').doc(invitationId(token));
  const roomRef = db.collection('rooms').doc();
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(invitationRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Einladung nicht gefunden oder ungültig.');
    const data = snapshot.data(); const inviterUid = data?.inviterUid; const expiresAt = data?.expiresAt;
    if (typeof inviterUid !== 'string' || !(expiresAt instanceof Timestamp)) throw new HttpsError('failed-precondition', 'Einladung hat ein ungültiges Format.');
    const reason = validateInvitationAcceptance({ invitation: { inviterUid, expiresAtMs: expiresAt.toMillis(), acceptedAtMs: data?.acceptedAt instanceof Timestamp ? data.acceptedAt.toMillis() : data?.acceptedAt ? 0 : null }, acceptingUid: calleeUid, nowMs: Date.now() });
    if (reason === 'self-acceptance') throw new HttpsError('failed-precondition', 'Eigene Einladungen können nicht angenommen werden.');
    if (reason === 'already-accepted') throw new HttpsError('already-exists', 'Diese Einladung wurde bereits verwendet.');
    if (reason) throw new HttpsError('failed-precondition', 'Diese Einladung ist abgelaufen.');
    tx.create(roomRef, roomDocument(inviterUid, calleeUid));
    tx.update(invitationRef, { acceptedAt: FieldValue.serverTimestamp(), acceptedByUid: calleeUid, roomId: roomRef.id });
    tx.set(buddyRef(db, inviterUid, calleeUid), buddyDocument(calleeUid), { merge: true }); tx.set(buddyRef(db, calleeUid, inviterUid), buddyDocument(inviterUid), { merge: true });
    return { roomId: roomRef.id, inviterUid };
  });
}
export async function startBuddyConnectionTransaction(db: Firestore, callerUid: string, calleeUid: string) {
  const roomRef = db.collection('rooms').doc();
  await db.runTransaction(async (tx) => { const [a,b] = await Promise.all([tx.get(buddyRef(db, callerUid, calleeUid)), tx.get(buddyRef(db, calleeUid, callerUid))]); if (!a.exists || !b.exists || a.data()?.status !== 'active' || b.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'Diese LaufBuddy-Verknüpfung besteht nicht mehr.'); tx.create(roomRef, roomDocument(callerUid, calleeUid)); });
  return { roomId: roomRef.id, role: 'caller' as const, buddyUid: calleeUid };
}
export async function removeBuddyRelationshipTransaction(db: Firestore, uid: string, buddyUid: string) { await db.runTransaction(async (tx) => { const [a,b] = await Promise.all([tx.get(buddyRef(db, uid, buddyUid)), tx.get(buddyRef(db, buddyUid, uid))]); if (!a.exists || !b.exists) throw new HttpsError('not-found', 'Die LaufBuddy-Verknüpfung besteht nicht mehr.'); tx.delete(buddyRef(db, uid, buddyUid)); tx.delete(buddyRef(db, buddyUid, uid)); }); return { removed: true }; }
export async function closeBuddyRoomTransaction(db: Firestore, uid: string, roomId: string) { const ref = db.collection('rooms').doc(roomId); await db.runTransaction(async (tx) => { const room = await tx.get(ref); if (!room.exists || !Array.isArray(room.data()?.participantUids) || !room.data()?.participantUids.includes(uid)) throw new HttpsError('permission-denied', 'Kein Zugriff auf diesen Buddy-Raum.'); tx.update(ref, { closedAt: FieldValue.serverTimestamp(), closedByUid: uid }); }); return { closed: true }; }
