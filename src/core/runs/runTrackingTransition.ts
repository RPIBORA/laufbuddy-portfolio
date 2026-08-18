export type ForegroundTransitionExpectation = {
  sequence: number;
  runId: string;
};

export type ForegroundTransitionState = {
  sequence: number;
  appState: string;
  runId: string | null;
  sessionStatus: string;
};

/**
 * A foreground transition may commit only when its awaited background stop
 * still belongs to the current active/paused run.
 */
export function canCommitForegroundTransition(
  expected: ForegroundTransitionExpectation,
  current: ForegroundTransitionState,
  backgroundStopCompleted: boolean,
): boolean {
  return (
    backgroundStopCompleted &&
    current.sequence === expected.sequence &&
    current.appState === 'active' &&
    current.runId === expected.runId &&
    (current.sessionStatus === 'running' || current.sessionStatus === 'paused')
  );
}
