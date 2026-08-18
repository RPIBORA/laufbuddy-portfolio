import assert from 'node:assert/strict';
import test from 'node:test';
import { createBuddyInteractionController } from './buddyInteractionController';

test('link waits for confirmation; cancellation accepts nothing and clears it', async () => {
  let accepts = 0;
  const c = createBuddyInteractionController({ acceptInvitation: async () => { accepts++; }, startConnection: async () => undefined, endConnection: async () => undefined });
  c.receiveLink('opaque'); assert.equal(c.pendingToken(), 'opaque'); c.cancelInvitation();
  assert.equal(accepts, 0); assert.equal(c.pendingToken(), null);
});
test('confirmation accepts exactly once and clears pending token', async () => {
  let accepts = 0; let release!: () => void;
  const c = createBuddyInteractionController({ acceptInvitation: () => new Promise<void>((r) => { accepts++; release = r; }), startConnection: async () => undefined, endConnection: async () => undefined });
  c.receiveLink('opaque'); const first = c.acceptInvitation(); const second = c.acceptInvitation(); release();
  assert.equal(await first, true); assert.equal(await second, false); assert.equal(accepts, 1); assert.equal(c.pendingToken(), null);
});
test('accepting an invitation does not start a later audio connection', async () => {
  let accepts = 0;
  let starts = 0;
  const c = createBuddyInteractionController({
    acceptInvitation: async () => { accepts += 1; },
    startConnection: async () => { starts += 1; },
    endConnection: async () => undefined,
  });

  c.receiveLink('opaque');
  assert.equal(await c.acceptInvitation(), true);
  assert.equal(accepts, 1);
  assert.equal(starts, 0);
});
test('selecting a buddy starts nothing until confirmation; ending changes no relationship', async () => {
  let starts = 0; let ends = 0;
  const c = createBuddyInteractionController({ acceptInvitation: async () => undefined, startConnection: async () => { starts++; }, endConnection: async () => { ends++; } });
  c.selectBuddy('buddy'); assert.equal(starts, 0); assert.equal(await c.confirmConnection(), true); assert.equal(starts, 1); await c.endConnection(); assert.equal(ends, 1);
});
test('cancelled or repeated connection confirmation starts at most once', async () => {
  let starts = 0; let release!: () => void;
  const c = createBuddyInteractionController({ acceptInvitation: async () => undefined, startConnection: () => new Promise<void>((resolve) => { starts++; release = resolve; }), endConnection: async () => undefined });
  c.selectBuddy('buddy'); c.cancelConnection(); assert.equal(await c.confirmConnection(), false);
  c.selectBuddy('buddy'); const first = c.confirmConnection(); const second = c.confirmConnection(); release();
  assert.equal(await first, true); assert.equal(await second, false); assert.equal(starts, 1);
});
