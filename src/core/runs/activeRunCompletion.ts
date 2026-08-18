export type ActiveRunCompletionDependencies = {
  runId: string;
  saveRun: () => Promise<unknown>;
  clearSnapshot: (runId: string) => Promise<void>;
  clearBackgroundBuffer: (runId: string) => Promise<void>;
};

const completionByRunId = new Map<string, Promise<void>>();

/**
 * Persists a completed run before removing its recovery data. A repeated
 * completion request for the same run joins the original operation instead of
 * storing a second history entry.
 */
export function completeActiveRun(
  dependencies: ActiveRunCompletionDependencies,
): Promise<void> {
  const existingCompletion = completionByRunId.get(dependencies.runId);

  if (existingCompletion) {
    return existingCompletion;
  }

  const completion = (async () => {
    await dependencies.saveRun();
    await Promise.all([
      dependencies.clearSnapshot(dependencies.runId),
      dependencies.clearBackgroundBuffer(dependencies.runId),
    ]);
  })();

  completionByRunId.set(dependencies.runId, completion);

  void completion.finally(() => {
    if (completionByRunId.get(dependencies.runId) === completion) {
      completionByRunId.delete(dependencies.runId);
    }
  }).catch(() => undefined);

  return completion;
}
