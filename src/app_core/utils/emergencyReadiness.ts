import { HeadphoneStatus } from '../../state/headphoneStatus';
import { HotwordStatus } from '../../state/hotwordStatus';
import type { FullScreenIntentAccessStatus } from '../../services/fullScreenIntentAccessService';

export type EmergencyReadinessContact = {
  displayName?: string | null;
  phoneNumber?: string | null;
};

export type EmergencyReadinessState = {
  label: string;
  subline: string;
  tone: 'ready' | 'warning';
};

function hasUsablePhoneNumber(
  contact: EmergencyReadinessContact | null | undefined,
): boolean {
  const phoneNumber =
    typeof contact?.phoneNumber === 'string'
      ? contact.phoneNumber.trim()
      : '';

  return phoneNumber.replace(/[^\d+]/g, '').length >= 3;
}

function findPrimaryEmergencyContact(
  contacts: EmergencyReadinessContact[],
): EmergencyReadinessContact | null {
  return (
    contacts.find((contact) => hasUsablePhoneNumber(contact)) ??
    null
  );
}

function formatEmergencyContactName(
  contact: EmergencyReadinessContact,
): string {
  const displayName =
    typeof contact.displayName === 'string'
      ? contact.displayName.trim()
      : '';

  return displayName.length > 0 ? displayName : 'Kontakt';
}

export function createEmergencyReadinessState(
  headphoneStatus: HeadphoneStatus,
  contacts: EmergencyReadinessContact[],
  hotwordStatus?: HotwordStatus,
  inactiveReason?: string | null,
  fullScreenIntentAccess?: FullScreenIntentAccessStatus,
): EmergencyReadinessState {
  const primaryEmergencyContact =
    findPrimaryEmergencyContact(contacts);

  const isHeadsetMissing =
    headphoneStatus !== HeadphoneStatus.Connected;

  if (primaryEmergencyContact === null && isHeadsetMissing) {
    return {
      label: 'LaufBuddy nicht aktiv',
      subline: 'Telefonkontakt fehlt · Headset nicht verbunden',
      tone: 'warning',
    };
  }

  if (primaryEmergencyContact === null) {
    return {
      label: 'LaufBuddy nicht aktiv',
      subline: 'Telefonkontakt fehlt',
      tone: 'warning',
    };
  }

  if (isHeadsetMissing) {
    return {
      label: 'LaufBuddy nicht aktiv',
      subline: 'Headset nicht verbunden',
      tone: 'warning',
    };
  }

  if (hotwordStatus !== HotwordStatus.Listening) {
    return {
      label: 'LaufBuddy nicht aktiv',
      subline: inactiveReason?.trim() || 'Hotword-Dienst nicht aktiv',
      tone: 'warning',
    };
  }

  if (fullScreenIntentAccess?.required && !fullScreenIntentAccess.granted) {
    return {
      label: 'LaufBuddy nicht aktiv',
      subline: 'Anruf bei gesperrtem Bildschirm nicht freigegeben',
      tone: 'warning',
    };
  }

  return {
    label: 'LaufBuddy aktiv',
    subline:
      `Headset verbunden · Telefonkontakt: ${
        formatEmergencyContactName(primaryEmergencyContact)
      }`,
    tone: 'ready',
  };
}
