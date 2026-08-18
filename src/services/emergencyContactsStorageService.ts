import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncPrimaryEmergencyContactToNative } from './nativeEmergencyContactSyncService';

const STORAGE_KEY = 'laufbuddy.emergencyContacts.selected.v1';

export interface StoredEmergencyContact {
  id: string;
  displayName: string;
  phoneNumber: string;
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizePhoneNumber(value: unknown): string {
  const normalizedText = normalizeText(value);

  if (!normalizedText) {
    return '';
  }

  const digitsAndPlusOnly = normalizedText.replace(/[^\d+]/g, '');

  if (!digitsAndPlusOnly) {
    return '';
  }

  if (!digitsAndPlusOnly.startsWith('+')) {
    return digitsAndPlusOnly.replace(/\+/g, '');
  }

  const withoutExtraPlus =
    digitsAndPlusOnly.slice(1).replace(/\+/g, '');

  return `+${withoutExtraPlus}`;
}

function isStoredEmergencyContact(
  value: unknown,
): value is StoredEmergencyContact {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    normalizeText(candidate.id).length > 0 &&
    normalizeText(candidate.displayName).length > 0 &&
    normalizePhoneNumber(candidate.phoneNumber).length > 0
  );
}

function sanitizeStoredEmergencyContact(
  contact: StoredEmergencyContact,
): StoredEmergencyContact {
  return {
    id: normalizeText(contact.id),
    displayName: normalizeText(contact.displayName),
    phoneNumber: normalizePhoneNumber(contact.phoneNumber),
  };
}

function dedupeStoredEmergencyContacts(
  contacts: StoredEmergencyContact[],
): StoredEmergencyContact[] {
  const seenKeys = new Set<string>();
  const result: StoredEmergencyContact[] = [];

  for (const contact of contacts) {
    const sanitizedContact =
      sanitizeStoredEmergencyContact(contact);

    if (
      !sanitizedContact.id ||
      !sanitizedContact.displayName ||
      !sanitizedContact.phoneNumber
    ) {
      continue;
    }

    const dedupeKey =
      `${sanitizedContact.id}|${sanitizedContact.phoneNumber}`;

    if (seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    result.push(sanitizedContact);
  }

  return result;
}

async function syncPrimaryContact(
  contacts: StoredEmergencyContact[],
): Promise<void> {
  const primaryPhoneNumber =
    contacts[0]?.phoneNumber ?? null;

  await syncPrimaryEmergencyContactToNative(
    primaryPhoneNumber,
  );
}

export async function loadStoredEmergencyContacts(): Promise<
  StoredEmergencyContact[]
> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEY);

  let storedContacts: StoredEmergencyContact[] = [];

  if (rawValue) {
    try {
      const parsedValue: unknown = JSON.parse(rawValue);

      if (Array.isArray(parsedValue)) {
        const validContacts =
          parsedValue.filter(isStoredEmergencyContact);

        storedContacts =
          dedupeStoredEmergencyContacts(validContacts);
      }
    } catch {
      storedContacts = [];
    }
  }

  await syncPrimaryContact(storedContacts);

  return storedContacts;
}

export async function saveStoredEmergencyContacts(
  contacts: StoredEmergencyContact[],
): Promise<void> {
  const sanitizedContacts =
    dedupeStoredEmergencyContacts(contacts);

  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(sanitizedContacts),
  );

  await syncPrimaryContact(sanitizedContacts);
}

export async function clearStoredEmergencyContacts(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  await syncPrimaryContact([]);
}
