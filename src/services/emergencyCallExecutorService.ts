import { startDirectDeviceCall } from './deviceCallLaunchService';
import { EmergencyCallExecutionStatus } from '../state/emergencyCallExecutionStatus';
import { useEmergencyCallExecutionStore } from '../state/emergencyCallExecutionStore';
import { useNormalEmergencyStore } from '../state/normalEmergencyStore';
import { useBOSEmergencyStore } from '../state/bosEmergencyStore';
import { publishLiveCallAttempt } from './live/liveSessionService';

function resetEmergencyRuntimeState(): void {
  console.log('[EmergencyCallExecutor] Runtime-State wird zurückgesetzt.');

  useNormalEmergencyStore.getState().resetEmergency();
  useBOSEmergencyStore.getState().resetBOSEmergency();
  useEmergencyCallExecutionStore.getState().resetEmergencyCallExecution();
}

export async function executeReadyEmergencyCall(): Promise<void> {
  const executionState = useEmergencyCallExecutionStore.getState();

  console.log('[EmergencyCallExecutor] executeReadyEmergencyCall gestartet:', {
    status: executionState.status,
    flowType: executionState.flowType,
    hasTarget: executionState.target !== null,
    targetLabel: executionState.target?.label ?? null,
    targetPhoneNumber: executionState.target?.phoneNumber ?? null,
  });

  if (executionState.target === null) {
    console.warn('[EmergencyCallExecutor] Abbruch: Kein Notrufziel vorhanden.');

    executionState.markFailed('Kein Notrufziel vorhanden.');
    return;
  }

  if (
    executionState.status !== EmergencyCallExecutionStatus.ReadyToExecute
  ) {
    console.warn('[EmergencyCallExecutor] Abbruch: Status ist nicht ready_to_execute.', {
      status: executionState.status,
    });

    return;
  }

  try {
    executionState.markExecuting();

    console.log('[EmergencyCallExecutor] Status auf executing gesetzt:', {
      flowType: executionState.flowType,
      targetPhoneNumber: executionState.target.phoneNumber,
    });

    if (
      executionState.flowType === 'normal_contact' ||
      executionState.flowType === 'bos_police'
    ) {
      console.log('[EmergencyCallExecutor] startDirectDeviceCall wird aufgerufen:', {
        phoneNumber: executionState.target.phoneNumber,
      });

      await startDirectDeviceCall(executionState.target.phoneNumber);

      // A Live companion sees only that the already selected contact is being
      // called; no emergency terminology or alternative call flow is exposed.
      void publishLiveCallAttempt().catch(() => undefined);

      console.log('[EmergencyCallExecutor] startDirectDeviceCall erfolgreich beendet.');
    } else {
      throw new Error('Unbekannter Notruf-Ausführungstyp.');
    }

    useEmergencyCallExecutionStore.getState().markCompleted();

    console.log('[EmergencyCallExecutor] Anrufausführung abgeschlossen.');

    resetEmergencyRuntimeState();
  } catch (error) {
    const errorMessage =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : 'Die Telefon-App konnte nicht gestartet werden.';

    console.error('[EmergencyCallExecutor] Anrufausführung fehlgeschlagen:', {
      message: errorMessage,
      error,
    });

    useEmergencyCallExecutionStore.getState().markFailed(errorMessage);
  }
}
