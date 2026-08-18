import { completeActiveRun } from './activeRunCompletion';

type RecordedCalls = {
  saves: string[];
  snapshots: string[];
  buffers: string[];
};

function createDependencies(
  runId: string,
  calls: RecordedCalls,
  saveRun: () => Promise<unknown>,
) {
  return {
    runId,
    saveRun: async () => {
      calls.saves.push(runId);
      return saveRun();
    },
    clearSnapshot: async (id: string) => {
      calls.snapshots.push(id);
    },
    clearBackgroundBuffer: async (id: string) => {
      calls.buffers.push(id);
    },
  };
}

export async function runActiveRunCompletionSmokeCheck(): Promise<{
  passed: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  const calls: RecordedCalls = { saves: [], snapshots: [], buffers: [] };

  await completeActiveRun(
    createDependencies('run-success', calls, async () => undefined),
  );

  if (calls.saves.join() !== 'run-success') errors.push('successful persistence was not awaited');
  if (calls.snapshots.join() !== 'run-success') errors.push('snapshot was not cleared after successful persistence');
  if (calls.buffers.join() !== 'run-success') errors.push('buffer was not cleared for the matching run only');

  const failedCalls: RecordedCalls = { saves: [], snapshots: [], buffers: [] };
  try {
    await completeActiveRun(
      createDependencies('run-failure', failedCalls, async () => {
        throw new Error('AsyncStorage write failed');
      }),
    );
    errors.push('failed persistence was reported as success');
  } catch {
    // Expected: recovery data must remain available after a write error.
  }

  if (failedCalls.snapshots.length !== 0) errors.push('snapshot was cleared after failed persistence');
  if (failedCalls.buffers.length !== 0) errors.push('buffer was cleared after failed persistence');

  const duplicateCalls: RecordedCalls = { saves: [], snapshots: [], buffers: [] };
  const duplicateDependencies = createDependencies(
    'run-idempotent',
    duplicateCalls,
    async () => undefined,
  );
  await Promise.all([
    completeActiveRun(duplicateDependencies),
    completeActiveRun(duplicateDependencies),
  ]);

  if (duplicateCalls.saves.length !== 1) errors.push('double completion stored the run more than once');
  if (duplicateCalls.snapshots.length !== 1) errors.push('double completion cleared the snapshot more than once');
  if (duplicateCalls.buffers.length !== 1 || duplicateCalls.buffers[0] !== 'run-idempotent') {
    errors.push('double completion cleared a wrong background buffer');
  }

  const normalCalls: RecordedCalls = { saves: [], snapshots: [], buffers: [] };
  await completeActiveRun(
    createDependencies('normal-finish', normalCalls, async () => undefined),
  );
  if (normalCalls.saves.length !== 1 || normalCalls.snapshots.length !== 1 || normalCalls.buffers.length !== 1) {
    errors.push('normal run completion no longer uses the confirmed completion contract');
  }

  return { passed: errors.length === 0, errors };
}
