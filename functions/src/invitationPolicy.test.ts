import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUDDY_INVITATION_TTL_MS,
  createInvitationExpirationMs,
  isValidInvitationToken,
  validateInvitationAcceptance,
} from './invitationPolicy.js';

const invitation = { inviterUid: 'uid-a', expiresAtMs: 2_000, acceptedAtMs: null };

test('new invitations expire exactly 24 hours after creation', () => {
  const createdAtMs = 1_000_000;
  assert.equal(BUDDY_INVITATION_TTL_MS, 24 * 60 * 60 * 1000);
  assert.equal(createInvitationExpirationMs(createdAtMs), createdAtMs + 24 * 60 * 60 * 1000);
});

test('acceptance permits a different UID shortly before expiry', () => {
  const expiresAtMs = createInvitationExpirationMs(1_000_000);
  assert.equal(validateInvitationAcceptance({
    invitation: { inviterUid: 'uid-a', expiresAtMs, acceptedAtMs: null },
    acceptingUid: 'uid-b',
    nowMs: expiresAtMs - 1,
  }), null);
});

test('acceptance rejects a self connection', () => {
  assert.equal(validateInvitationAcceptance({ invitation, acceptingUid: 'uid-a', nowMs: 1_000 }), 'self-acceptance');
});

test('acceptance rejects reused and expired invitations', () => {
  assert.equal(validateInvitationAcceptance({ invitation: { ...invitation, acceptedAtMs: 1_000 }, acceptingUid: 'uid-b', nowMs: 1_001 }), 'already-accepted');
  assert.equal(validateInvitationAcceptance({ invitation, acceptingUid: 'uid-b', nowMs: 2_000 }), 'expired');
});

test('acceptance uses the stored expiry without recalculating or extending it', () => {
  const storedInvitation = { inviterUid: 'uid-a', expiresAtMs: 1_500, acceptedAtMs: null };
  assert.equal(validateInvitationAcceptance({ invitation: storedInvitation, acceptingUid: 'uid-b', nowMs: 1_499 }), null);
  assert.equal(validateInvitationAcceptance({ invitation: storedInvitation, acceptingUid: 'uid-b', nowMs: 1_500 }), 'expired');
  assert.equal(storedInvitation.expiresAtMs, 1_500);
});

test('only a 256-bit base64url invitation token is accepted', () => {
  assert.equal(isValidInvitationToken('A'.repeat(43)), true);
  assert.equal(isValidInvitationToken('RUN-ABCD'), false);
  assert.equal(isValidInvitationToken('A'.repeat(44)), false);
});
