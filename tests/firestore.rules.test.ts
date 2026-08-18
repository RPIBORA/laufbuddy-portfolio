import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after, before, beforeEach } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
} from 'firebase/firestore';

const projectId = 'laufbuddy-security-test';
let testEnv: RulesTestEnvironment;

const room = {
  schemaVersion: 1,
  participantUids: ['uid-a', 'uid-b'],
  callerUid: 'uid-a',
  calleeUid: 'uid-b',
  createdAt: new Date(),
  offer: null,
  answer: null,
};

const candidate = {
  authorUid: 'uid-a',
  candidate: 'candidate:1 1 UDP 1 127.0.0.1 9 typ host',
  sdpMid: '0',
  sdpMLineIndex: 0,
  usernameFragment: null,
};

function firestore(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'rooms', 'room-1'), room);
    await setDoc(doc(db, 'buddy_invitations', 'owned-invitation'), {
      inviterUid: 'uid-a',
      acceptedAt: null,
      acceptedByUid: null,
      roomId: null,
    });
    await setDoc(doc(db, 'users', 'uid-a'), { buddyCode: 'LB-ABC123' });
  });
});

test('participants A and B can read their own room, C cannot read a known room ID', async () => {
  await assertSucceeds(getDoc(doc(firestore('uid-a'), 'rooms', 'room-1')));
  await assertSucceeds(getDoc(doc(firestore('uid-b'), 'rooms', 'room-1')));
  await assertFails(getDoc(doc(firestore('uid-c'), 'rooms', 'room-1')));
  await assertFails(getDocs(collection(firestore('uid-c'), 'rooms')));
});

test('only room participants can read ICE and only their assigned side can create it', async () => {
  await assertSucceeds(addDoc(collection(firestore('uid-a'), 'rooms', 'room-1', 'callerCandidates'), candidate));
  await assertSucceeds(addDoc(collection(firestore('uid-b'), 'rooms', 'room-1', 'calleeCandidates'), { ...candidate, authorUid: 'uid-b' }));
  await assertFails(getDocs(collection(firestore('uid-c'), 'rooms', 'room-1', 'callerCandidates')));
  await assertFails(addDoc(collection(firestore('uid-c'), 'rooms', 'room-1', 'callerCandidates'), { ...candidate, authorUid: 'uid-c' }));
  await assertFails(addDoc(collection(firestore('uid-b'), 'rooms', 'room-1', 'callerCandidates'), { ...candidate, authorUid: 'uid-b' }));
});

test('clients cannot alter UID membership, add fields, or inject an answer as the caller', async () => {
  await assertFails(updateDoc(doc(firestore('uid-a'), 'rooms', 'room-1'), { participantUids: ['uid-a', 'uid-c'] }));
  await assertFails(updateDoc(doc(firestore('uid-a'), 'rooms', 'room-1'), { unexpected: true }));
  await assertFails(updateDoc(doc(firestore('uid-a'), 'rooms', 'room-1'), { answer: { type: 'answer', sdp: 'x' } }));
  await assertSucceeds(updateDoc(doc(firestore('uid-a'), 'rooms', 'room-1'), { offer: { type: 'offer', sdp: 'x' } }));
  await assertSucceeds(updateDoc(doc(firestore('uid-b'), 'rooms', 'room-1'), { answer: { type: 'answer', sdp: 'y' } }));
});

test('invitations and legacy direct Buddy paths cannot be accessed by strangers', async () => {
  await assertSucceeds(getDoc(doc(firestore('uid-a'), 'buddy_invitations', 'owned-invitation')));
  await assertFails(getDoc(doc(firestore('uid-c'), 'buddy_invitations', 'owned-invitation')));
  await assertFails(getDocs(collection(firestore('uid-c'), 'buddy_invitations')));
  await assertFails(getDoc(doc(firestore('uid-c'), 'waiting_buddies', 'RUN-ABCD')));
  await assertFails(setDoc(doc(firestore('uid-c'), 'waiting_buddies', 'RUN-ABCD'), { ownerUid: 'uid-c' }));
  await assertFails(getDoc(doc(firestore('uid-c'), 'run_rooms', 'ROOM-RUN-ABCD-RUN-EFGH')));
  await assertFails(getDoc(doc(firestore('uid-c'), 'users', 'uid-a')));
  await assertFails(setDoc(doc(firestore('uid-c'), 'rooms', 'known-room'), room));
});

test('candidate field validation rejects client supplied extras', async () => {
  await assertFails(addDoc(collection(firestore('uid-a'), 'rooms', 'room-1', 'callerCandidates'), { ...candidate, injected: true }));
});

test('rules test harness is initialized with the local ruleset', () => {
  assert.ok(testEnv);
});

test('a Live companion can get only a known session and write only its presence document', async () => {
  const sessionId = 'a'.repeat(64);
  const validSession = {
    ownerUid: 'uid-a',
    runnerName: 'Runner',
    sessionStatus: 'active',
    route: [],
    distanceKm: 0,
    durationSeconds: 0,
    averagePaceSecondsPerKm: null,
  };
  await assertSucceeds(setDoc(doc(firestore('uid-a'), 'liveSessions', sessionId), validSession));
  await assertFails(setDoc(doc(firestore('uid-c'), 'liveSessions', 'c'.repeat(64)), { ...validSession, ownerUid: 'uid-a' }));
  await assertFails(setDoc(doc(firestore('uid-a'), 'liveSessions', 'bad-id'), validSession));
  const owner = firestore('uid-a');
  const companion = firestore('uid-c');
  await assertSucceeds(getDoc(doc(owner, 'liveSessions', sessionId)));
  await assertSucceeds(getDoc(doc(companion, 'liveSessions', sessionId)));
  await assertFails(getDocs(collection(companion, 'liveSessions')));
  await assertFails(getDoc(doc(companion, 'liveSessions', 'b'.repeat(64))));
  await assertFails(getDoc(doc(companion, 'liveSessions', 'bad-id')));
  await assertSucceeds(setDoc(doc(companion, 'liveSessions', sessionId, 'connections', 'uid-c'), { status: 'connected', lastHeartbeatAt: new Date() }));
  await assertSucceeds(getDoc(doc(owner, 'liveSessions', sessionId, 'connections', 'uid-c')));
  await assertSucceeds(getDocs(collection(owner, 'liveSessions', sessionId, 'connections')));
  await assertSucceeds(getDoc(doc(companion, 'liveSessions', sessionId, 'connections', 'uid-c')));
  await assertFails(getDocs(collection(companion, 'liveSessions', sessionId, 'connections')));
  await assertFails(getDoc(doc(firestore('uid-b'), 'liveSessions', sessionId, 'connections', 'uid-c')));
  await assertFails(getDocs(collection(firestore('uid-b'), 'liveSessions', sessionId, 'connections')));
  await assertFails(setDoc(doc(companion, 'liveSessions', sessionId, 'connections', 'uid-a'), { status: 'connected' }));
  await assertFails(setDoc(doc(companion, 'liveSessions', sessionId, 'connections', 'uid-c'), { status: 'connected', latitude: 1 }));
  await assertFails(setDoc(doc(companion, 'liveSessions', sessionId, 'connections', 'uid-c'), { status: 'connected', lastHeartbeatAt: 'not-a-timestamp' }));
  await assertFails(setDoc(doc(companion, 'liveSessions', sessionId, 'connections', 'uid-c'), { status: 'unknown' }));
  await assertFails(setDoc(doc(companion, 'liveSessions', 'd'.repeat(64), 'connections', 'uid-c'), { status: 'connected' }));
  await assertFails(updateDoc(doc(owner, 'liveSessions', sessionId), { injected: true }));
  await assertFails(updateDoc(doc(companion, 'liveSessions', sessionId), { route: [] }));
});

test('owners can read their Buddy list but no client can mutate it', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'uid-a', 'buddies', 'uid-b'), { buddyUid: 'uid-b', status: 'active' });
  });
  const own = firestore('uid-a');
  await assertSucceeds(getDoc(doc(own, 'users', 'uid-a', 'buddies', 'uid-b')));
  await assertFails(getDoc(doc(firestore('uid-c'), 'users', 'uid-a', 'buddies', 'uid-b')));
  await assertFails(setDoc(doc(own, 'users', 'uid-a', 'buddies', 'uid-c'), { buddyUid: 'uid-c', status: 'active' }));
  await assertFails(updateDoc(doc(own, 'users', 'uid-a', 'buddies', 'uid-b'), { status: 'removed' }));
});

after(async () => {
  await testEnv.cleanup();
});
