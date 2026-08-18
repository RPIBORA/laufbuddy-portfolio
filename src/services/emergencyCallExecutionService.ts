import { ConnectivityStatus } from '../state/connectivityStatus';
import {
  EmergencyCallExecutionTarget,
  useEmergencyCallExecutionStore,
} from '../state/emergencyCallExecutionStore';
import { useConnectivityStore } from '../state/connectivityStore';

function normalizePhoneNumber(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return '';
  }

  const digitsAndPlusOnly = trimmedValue.replace(/[^\d+]/g, '');

  if (!digitsAndPlusOnly) {
    return '';
  }

  if (!digitsAndPlusOnly.startsWith('+')) {
    return digitsAndPlusOnly.replace(/\+/g, '');
  }

  const withoutExtraPlus = digitsAndPlusOnly.slice(1).replace(/\+/g, '');

  return `+${withoutExtraPlus}`;
}

export function hasUsableCallConnectivity(status: ConnectivityStatus): boolean {
  return (
    status === ConnectivityStatus.Online ||
    status === ConnectivityStatus.Degraded
  );
}

export function queueEmergencyCallExecution(
  flowType: 'normal_contact' | 'bos_police',
  target: EmergencyCallExecutionTarget,
): void {
  const normalizedPhoneNumber = normalizePhoneNumber(target.phoneNumber);

  if (!normalizedPhoneNumber) {
    useEmergencyCallExecutionStore
      .getState()
      .markFailed('Die Zielrufnummer ist leer oder ungültig.');
    return;
  }

  useEmergencyCallExecutionStore.getState().queuePendingExecution(flowType, {
    label: target.label.trim() || 'Unbekanntes Ziel',
    phoneNumber: normalizedPhoneNumber,
  });

  const connectivityStatus = useConnectivityStore.getState().status;

  if (hasUsableCallConnectivity(connectivityStatus)) {
    useEmergencyCallExecutionStore.getState().markReadyToExecute();
    return;
  }

  useEmergencyCallExecutionStore.getState().markWaitingForConnectivity();
}