import {
  createRunStopPreparationToken,
  waitForRunStopPreparation,
} from './runStopPreparation';

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
};

function createDeferred(): Deferred {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function waitForTaskQueue(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function test(): Promise<void> {
  let timeoutCount = 0;
  if (
    await waitForRunStopPreparation(Promise.resolve(), 10, {
      onTimeout: () => {
        timeoutCount += 1;
      },
    }) !== 'completed'
  ) {
    throw new Error('completed preparation did not resolve');
  }
  if (timeoutCount !== 0) {
    throw new Error('completed preparation did not clear its timeout');
  }

  if (
    await waitForRunStopPreparation(new Promise<void>(() => {}), 10) !==
    'timed_out'
  ) {
    throw new Error('hung preparation did not time out');
  }

  const lateSuccess = createDeferred();
  const lateSuccessToken = createRunStopPreparationToken();
  let lateSuccessMutationCount = 0;
  void lateSuccess.promise.then(() => {
    if (lateSuccessToken.isCurrent()) {
      lateSuccessMutationCount += 1;
    }
  });
  if (
    await waitForRunStopPreparation(lateSuccess.promise, 10, {
      onTimeout: lateSuccessToken.invalidate,
    }) !== 'timed_out'
  ) {
    throw new Error('late success preparation did not time out');
  }
  lateSuccess.resolve();
  await waitForTaskQueue();
  if (lateSuccessMutationCount !== 0) {
    throw new Error('late success changed state after timeout');
  }

  const lateFailure = createDeferred();
  let lateError: unknown = null;
  let unhandledRejection: unknown = null;
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejection = reason;
  };
  process.on('unhandledRejection', onUnhandledRejection);
  if (
    await waitForRunStopPreparation(lateFailure.promise, 10, {
      onLateError: (error: unknown) => {
        lateError = error;
      },
    }) !== 'timed_out'
  ) {
    throw new Error('late failing preparation did not time out');
  }
  const expectedLateError = new Error('late GPS failure');
  lateFailure.reject(expectedLateError);
  await waitForTaskQueue();
  process.off('unhandledRejection', onUnhandledRejection);
  if (lateError !== expectedLateError) {
    throw new Error('late preparation rejection was not handled');
  }
  if (unhandledRejection !== null) {
    throw new Error('late preparation rejection was unhandled');
  }
}

void test();
