import {
  StoredEmergencyContact,
  loadStoredEmergencyContacts,
} from './emergencyContactsStorageService';
import { loadStoredBOSEmergencyNumber } from './bosEmergencyNumberStorageService';
import { EmergencyCallExecutionTarget } from '../state/emergencyCallExecutionStore';
import { getTemporaryLiveBuddyContact } from './live/liveBuddyContactService';

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

function toExecutionTarget(
  contact: StoredEmergencyContact,
): EmergencyCallExecutionTarget | null {
  const displayName = contact.displayName.trim();
  const phoneNumber = normalizePhoneNumber(contact.phoneNumber);

  if (!displayName || !phoneNumber) {
    return null;
  }

  return {
    label: displayName,
    phoneNumber,
  };
}

export async function loadPrimaryEmergencyContactTarget(): Promise<EmergencyCallExecutionTarget | null> {
  const storedContacts = await loadStoredEmergencyContacts();

  if (storedContacts.length === 0) {
    return null;
  }

  return toExecutionTarget(storedContacts[0]);
}

export async function loadHotwordEmergencyContactTarget(): Promise<EmergencyCallExecutionTarget | null> {
  const temporaryLiveBuddy = getTemporaryLiveBuddyContact();

  if (temporaryLiveBuddy) {
    const liveBuddyTarget = toExecutionTarget(temporaryLiveBuddy);

    if (liveBuddyTarget) {
      return liveBuddyTarget;
    }
  }

  return loadPrimaryEmergencyContactTarget();
}

export async function loadStoredBOSEmergencyTarget(): Promise<EmergencyCallExecutionTarget | null> {
  const phoneNumber = await loadStoredBOSEmergencyNumber();

  if (!phoneNumber) {
    return null;
  }

  return {
    label: 'BOS / Polizei',
    phoneNumber,
  };
}