import { strict as assert } from 'node:assert';
import {
  awaitBuddyInvitationResult,
  BuddyInvitationTimeoutError,
} from './buddyInvitationTimeout';

async function expectRejects(
  operation: Promise<unknown>,
  expectedError: new (...args: never[]) => Error,
): Promise<void> {
  await assert.rejects(operation, expectedError);
}

async function run(): Promise<void> {
  const successfulInvitation = { token: 'opaque-token' };
  assert.deepEqual(
    await awaitBuddyInvitationResult(Promise.resolve(successfulInvitation), 20),
    successfulInvitation,
  );

  await expectRejects(
    awaitBuddyInvitationResult(Promise.reject(new Error('Serverfehler')), 20),
    Error,
  );

  await expectRejects(
    awaitBuddyInvitationResult(new Promise<never>(() => undefined), 10),
    BuddyInvitationTimeoutError,
  );

  let resolveLateInvitation: ((value: typeof successfulInvitation) => void) | null = null;
  const lateInvitation = new Promise<typeof successfulInvitation>((resolve) => {
    resolveLateInvitation = resolve;
  });
  let shareCalls = 0;
  const timedOutInvitation = awaitBuddyInvitationResult(lateInvitation, 10)
    .then(() => {
      shareCalls += 1;
    })
    .catch(() => undefined);
  await timedOutInvitation;
  resolveLateInvitation?.(successfulInvitation);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(shareCalls, 0, 'late invitation result must not start sharing');

  let loading = true;
  try {
    await awaitBuddyInvitationResult(new Promise<never>(() => undefined), 10);
  } catch {
    // Expected timeout.
  } finally {
    loading = false;
  }
  assert.equal(loading, false, 'loading must end after a timeout');
}

void run().then(
  () => console.log('buddy invitation timeout checks passed'),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
