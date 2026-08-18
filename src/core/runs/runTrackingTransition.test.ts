import { canCommitForegroundTransition } from './runTrackingTransition';

const expected = { sequence: 7, runId: 'run-a' };
const current = {
  sequence: 7,
  appState: 'active',
  runId: 'run-a',
  sessionStatus: 'running',
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  !canCommitForegroundTransition(expected, current, false),
  'foreground tracking must not start before the background stop completes',
);
assert(
  canCommitForegroundTransition(expected, current, true),
  'current active run may commit after a completed stop',
);
assert(
  canCommitForegroundTransition(
    expected,
    { ...current, sessionStatus: 'paused' },
    true,
  ),
  'paused run must remain recoverable',
);
assert(
  !canCommitForegroundTransition(
    expected,
    { ...current, sequence: 8 },
    true,
  ),
  'a newer AppState transition must invalidate the old one',
);
assert(
  !canCommitForegroundTransition(
    expected,
    { ...current, appState: 'background' },
    true,
  ),
  'return to background must invalidate the old transition',
);
assert(
  !canCommitForegroundTransition(
    expected,
    { ...current, runId: 'run-b' },
    true,
  ),
  'a different run must invalidate the old transition',
);
assert(
  !canCommitForegroundTransition(
    expected,
    { ...current, sessionStatus: 'stopped' },
    true,
  ),
  'a completed run must not restart foreground tracking',
);

console.log('runTrackingTransition tests passed');
