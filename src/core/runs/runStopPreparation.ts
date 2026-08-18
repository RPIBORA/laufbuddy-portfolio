export type RunStopPreparationToken = {
  isCurrent: () => boolean;
  invalidate: () => void;
};

export function createRunStopPreparationToken(): RunStopPreparationToken {
  let current = true;

  return {
    isCurrent: () => current,
    invalidate: () => {
      current = false;
    },
  };
}

type WaitForRunStopPreparationOptions = {
  onTimeout?: () => void;
  onLateError?: (error: unknown) => void;
};

export async function waitForRunStopPreparation(
  preparation: Promise<void>,
  timeoutMs = 4000,
  options: WaitForRunStopPreparationOptions = {},
): Promise<'completed' | 'timed_out'> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutResult = new Promise<'timed_out'>((resolve) => {
    timeout = setTimeout(() => {
      timedOut = true;
      options.onTimeout?.();
      resolve('timed_out');
    }, timeoutMs);
  });
  const completionResult = preparation.then(
    () => 'completed' as const,
    (error: unknown) => {
      if (timedOut) {
        options.onLateError?.(error);
        return 'timed_out' as const;
      }

      throw error;
    },
  );
  const result = await Promise.race([
    completionResult,
    timeoutResult,
  ]);
  if (timeout) clearTimeout(timeout);

  return result;
}
