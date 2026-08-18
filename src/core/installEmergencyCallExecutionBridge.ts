import { executeReadyEmergencyCall } from '../services/emergencyCallExecutorService';
import { hasUsableCallConnectivity } from '../services/emergencyCallExecutionService';
import { useConnectivityStore } from '../state/connectivityStore';
import { EmergencyCallExecutionStatus } from '../state/emergencyCallExecutionStatus';
import { useEmergencyCallExecutionStore } from '../state/emergencyCallExecutionStore';

interface EmergencyCallExecutionBridgeSnapshot {
  connectivityStatus: string;
  executionStatus: string;
  retryOnConnectivityRestored: boolean;
  targetPhoneNumber: string | null;
}

export type EmergencyCallExecutionBridgeCleanup = () => void;

function createSnapshot(): EmergencyCallExecutionBridgeSnapshot {
  const connectivityState = useConnectivityStore.getState();
  const executionState = useEmergencyCallExecutionStore.getState();

  return {
    connectivityStatus: String(connectivityState.status),
    executionStatus: String(executionState.status),
    retryOnConnectivityRestored: executionState.retryOnConnectivityRestored,
    targetPhoneNumber: executionState.target?.phoneNumber ?? null,
  };
}

function createSnapshotKey(
  snapshot: EmergencyCallExecutionBridgeSnapshot,
): string {
  return JSON.stringify(snapshot);
}

export function installEmergencyCallExecutionBridge(): EmergencyCallExecutionBridgeCleanup {
  let disposed = false;
  let flushScheduled = false;
  let executionInFlight = false;
  let lastHandledSnapshotKey: string | null = null;

  const flush = async () => {
    flushScheduled = false;

    if (disposed) {
      return;
    }

    const currentSnapshotKey = createSnapshotKey(createSnapshot());

    if (currentSnapshotKey === lastHandledSnapshotKey) {
      return;
    }

    const connectivityStatus = useConnectivityStore.getState().status;
    const executionState = useEmergencyCallExecutionStore.getState();
    const hasUsableConnectivity = hasUsableCallConnectivity(connectivityStatus);

    if (
      executionState.target !== null &&
      executionState.retryOnConnectivityRestored &&
      (executionState.status === EmergencyCallExecutionStatus.Pending ||
        executionState.status ===
          EmergencyCallExecutionStatus.WaitingForConnectivity)
    ) {
      if (hasUsableConnectivity) {
        useEmergencyCallExecutionStore.getState().markReadyToExecute();
      } else {
        useEmergencyCallExecutionStore.getState().markWaitingForConnectivity();
      }
    }

    const updatedExecutionState = useEmergencyCallExecutionStore.getState();

    if (
      !executionInFlight &&
      updatedExecutionState.target !== null &&
      updatedExecutionState.status ===
        EmergencyCallExecutionStatus.ReadyToExecute
    ) {
      executionInFlight = true;

      try {
        await executeReadyEmergencyCall();
      } finally {
        executionInFlight = false;

        if (!disposed) {
          scheduleFlush();
        }
      }
    }

    lastHandledSnapshotKey = createSnapshotKey(createSnapshot());
  };

  const scheduleFlush = () => {
    if (disposed || flushScheduled) {
      return;
    }

    flushScheduled = true;

    Promise.resolve().then(() => {
      void flush();
    });
  };

  const unsubscribes = [
    useConnectivityStore.subscribe(() => scheduleFlush()),
    useEmergencyCallExecutionStore.subscribe(() => scheduleFlush()),
  ];

  scheduleFlush();

  return () => {
    disposed = true;

    unsubscribes.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}

export default installEmergencyCallExecutionBridge;