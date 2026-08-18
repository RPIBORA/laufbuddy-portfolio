import assert from 'node:assert/strict';
import test from 'node:test';
import { createBuddyInvitationLinkRouter } from './buddyInvitationLinkRouter';

const invitationUrl = 'https://laufbuddy-v2.web.app/connect?token=opaque-token';

test('cold start and a duplicate URL event route one pending invitation once', () => {
  const received: string[] = [];
  const router = createBuddyInvitationLinkRouter({
    onInvitation: (token) => received.push(token),
  });

  assert.equal(router.receiveUrl(invitationUrl), 'received');
  assert.equal(router.receiveUrl(invitationUrl), 'duplicate');
  assert.deepEqual(received, ['opaque-token']);
  assert.equal(router.pendingToken(), 'opaque-token');
});

test('an invitation remains pending through authentication and can be opened again after cancellation', () => {
  const received: string[] = [];
  const router = createBuddyInvitationLinkRouter({
    onInvitation: (token) => received.push(token),
  });

  router.receiveUrl(invitationUrl);
  assert.equal(router.pendingToken(), 'opaque-token');
  router.resolveInvitation('opaque-token');
  assert.equal(router.pendingToken(), null);
  assert.equal(router.receiveUrl(invitationUrl), 'received');
  assert.deepEqual(received, ['opaque-token', 'opaque-token']);
});

test('invalid links never enter the production invitation route', () => {
  let received = 0;
  const router = createBuddyInvitationLinkRouter({
    onInvitation: () => { received += 1; },
  });

  assert.equal(router.receiveUrl('https://other.example/connect?token=opaque-token'), 'invalid');
  assert.equal(received, 0);
});
