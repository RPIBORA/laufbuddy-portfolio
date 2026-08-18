import {
  loadHotwordEmergencyContactTarget,
} from '../services/emergencyCallTargetService';
import { queueEmergencyCallExecution } from '../services/emergencyCallExecutionService';
import { EmergencyCallExecutionStatus } from '../state/emergencyCallExecutionStatus';
import { useEmergencyCallExecutionStore } from '../state/emergencyCallExecutionStore';
import { NormalEmergencyStatus } from '../state/normalEmergencyStatus';
import { useNormalEmergencyStore } from '../state/normalEmergencyStore';

interface EmergencyCallPreparationBridgeSnapshot {
  normalEmergencyStatus: string;
  executionStatus: string;
  executionFlowType: string | null;
  executionTargetPhoneNumber: string | null;
}

export type EmergencyCallPreparationBridgeCleanup = () => void;

function createSnapshot(): EmergencyCallPreparationBridgeSnapshot {
  const normalEmergencyState = useNormalEmergencyStore.getState();
  const executionState = useEmergencyCallExecutionStore.getState();

  return {
    normalEmergencyStatus: String(normalEmergencyState.status),
    executionStatus: String(executionState.status),
    executionFlowType: executionState.flowType,
    executionTargetPhoneNumber: executionState.target?.phoneNumber ?? null,
  };
}

function createSnapshotKey(
  snapshot: EmergencyCallPreparationBridgeSnapshot,
): string {
  return JSON.stringify(snapshot);
}

async function prepareNormalEmergencyExecution(): Promise<void> {
  console.log('[EmergencyCallPreparation] Normaler Notfall wird vorbereitet.');

  const target = await loadHotwordEmergencyContactTarget();

  console.log('[EmergencyCallPreparation] Geladenes Hotword-Anrufziel:', {
    hasTarget: target !== null,
    label: target?.label ?? null,
    phoneNumber: target?.phoneNumber ?? null,
  });

  if (!target) {
    console.warn(
      '[EmergencyCallPreparation] Abbruch: Kein Notfallkontakt ausgewählt.',
    );

    useEmergencyCallExecutionStore
      .getState()
      .markFailed('Kein Telefonkontakt ausgewählt.');
    return;
  }

  queueEmergencyCallExecution('normal_contact', target);

  console.log('[EmergencyCallPreparation] Hotword-Kontaktanruf wurde eingereiht:', {
    label: target.label,
    phoneNumber: target.phoneNumber,
  });
}

export function installEmergencyCallPreparationBridge(): EmergencyCallPreparationBridgeCleanup {
  let disposed = false;
  let flushScheduled = false;
  let preparationInFlight = false;
  let lastHandledSnapshotKey: string | null = null;

  const scheduleFlush = () => {
    if (disposed || flushScheduled) {
      return;
    }

    flushScheduled = true;

    Promise.resolve().then(() => {
      void flush();
    });
  };

  const flush = async () => {
    flushScheduled = false;

    if (disposed) {
      return;
    }

    const currentSnapshot = createSnapshot();
    const currentSnapshotKey = createSnapshotKey(currentSnapshot);

    if (currentSnapshotKey === lastHandledSnapshotKey) {
      return;
    }

    console.log('[EmergencyCallPreparation] Snapshot:', currentSnapshot);

    const normalEmergencyState = useNormalEmergencyStore.getState();
    const executionState = useEmergencyCallExecutionStore.getState();

    const canPrepareExecution =
      executionState.status === EmergencyCallExecutionStatus.Idle;

    console.log('[EmergencyCallPreparation] Prüfe Vorbereitung:', {
      canPrepareExecution,
      preparationInFlight,
      normalEmergencyStatus: normalEmergencyState.status,
      executionStatus: executionState.status,
    });

    if (
      !preparationInFlight &&
      canPrepareExecution &&
      normalEmergencyState.status === NormalEmergencyStatus.Triggered
    ) {
      preparationInFlight = true;

      try {
        await prepareNormalEmergencyExecution();
      } finally {
        preparationInFlight = false;

        if (!disposed) {
          scheduleFlush();
        }
      }
    }

    lastHandledSnapshotKey = createSnapshotKey(createSnapshot());
  };

  const unsubscribes = [
    useNormalEmergencyStore.subscribe(() => scheduleFlush()),
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

export default installEmergencyCallPreparationBridge;
