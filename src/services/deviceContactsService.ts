import * as Contacts from 'expo-contacts';

export type DeviceContactsPermissionState =
  | 'granted'
  | 'denied'
  | 'undetermined';

export interface DeviceEmergencyContactCandidate {
  id: string;
  displayName: string;
  phoneNumber: string;
}

interface PhoneNumberCandidate {
  idSuffix: string;
  label: string | null;
  phoneNumber: string;
}

export type DeviceEmergencyContactLoadOptions = {
  forceRefresh?: boolean;
};

let cachedDeviceEmergencyContactCandidates:
  | DeviceEmergencyContactCandidate[]
  | null = null;

let pendingDeviceEmergencyContactCandidatesLoad:
  | Promise<DeviceEmergencyContactCandidate[]>
  | null = null;

function mapPermissionStatus(status: string): DeviceContactsPermissionState {
  if (status === 'granted') {
    return 'granted';
  }

  if (status === 'denied') {
    return 'denied';
  }

  return 'undetermined';
}

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

function normalizeLabel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  return trimmedValue;
}

function buildDisplayName(contact: Contacts.Contact): string {
  const fullName =
    typeof contact.name === 'string' ? contact.name.trim() : '';

  if (fullName) {
    return fullName;
  }

  const firstName =
    typeof contact.firstName === 'string' ? contact.firstName.trim() : '';
  const lastName =
    typeof contact.lastName === 'string' ? contact.lastName.trim() : '';

  const combinedName = [firstName, lastName]
    .filter((value) => value.length > 0)
    .join(' ')
    .trim();

  if (combinedName) {
    return combinedName;
  }

  return 'Unbekannter Kontakt';
}

function buildContactPhoneDisplayName(
  displayName: string,
  phoneLabel: string | null,
  hasMultipleNumbers: boolean,
): string {
  if (!hasMultipleNumbers || !phoneLabel) {
    return displayName;
  }

  return `${displayName} · ${phoneLabel}`;
}

function getPhoneEntryLabel(phoneEntry: Contacts.PhoneNumber): string | null {
  return normalizeLabel(phoneEntry.label);
}

function getPhoneNumberCandidates(
  contact: Contacts.Contact,
): PhoneNumberCandidate[] {
  if (!Array.isArray(contact.phoneNumbers)) {
    return [];
  }

  const seenNumbers = new Set<string>();
  const candidates: PhoneNumberCandidate[] = [];

  for (const phoneEntry of contact.phoneNumbers) {
    const rawNumber =
      typeof phoneEntry?.number === 'string' ? phoneEntry.number : '';
    const phoneNumber = normalizePhoneNumber(rawNumber);

    if (!phoneNumber || seenNumbers.has(phoneNumber)) {
      continue;
    }

    seenNumbers.add(phoneNumber);

    candidates.push({
      idSuffix: phoneNumber,
      label: getPhoneEntryLabel(phoneEntry),
      phoneNumber,
    });
  }

  return candidates;
}

export async function getDeviceContactsPermissionState(): Promise<DeviceContactsPermissionState> {
  const permissionResponse = await Contacts.getPermissionsAsync();
  const permissionState = mapPermissionStatus(permissionResponse.status);

  if (permissionState !== 'granted') {
    cachedDeviceEmergencyContactCandidates = null;
  }

  return permissionState;
}

export async function requestDeviceContactsPermission(): Promise<DeviceContactsPermissionState> {
  const permissionResponse = await Contacts.requestPermissionsAsync();
  const permissionState = mapPermissionStatus(permissionResponse.status);

  if (permissionState !== 'granted') {
    cachedDeviceEmergencyContactCandidates = null;
  }

  return permissionState;
}

async function loadFreshDeviceEmergencyContactCandidates(): Promise<
  DeviceEmergencyContactCandidate[]
> {
  const permissionState = await getDeviceContactsPermissionState();

  if (permissionState !== 'granted') {
    return [];
  }

  const contactsResponse = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers],
  });

  const seenEntries = new Set<string>();
  const candidates: DeviceEmergencyContactCandidate[] = [];

  for (const contact of contactsResponse.data) {
    const displayName = buildDisplayName(contact);
    const phoneNumberCandidates = getPhoneNumberCandidates(contact);
    const hasMultipleNumbers = phoneNumberCandidates.length > 1;
    const contactId = typeof contact.id === 'string' ? contact.id : displayName;

    for (const phoneNumberCandidate of phoneNumberCandidates) {
      const contactPhoneDisplayName = buildContactPhoneDisplayName(
        displayName,
        phoneNumberCandidate.label,
        hasMultipleNumbers,
      );
      const dedupeKey = `${contactPhoneDisplayName}|${phoneNumberCandidate.phoneNumber}`;

      if (seenEntries.has(dedupeKey)) {
        continue;
      }

      seenEntries.add(dedupeKey);

      candidates.push({
        id: `${contactId}|${phoneNumberCandidate.idSuffix}`,
        displayName: contactPhoneDisplayName,
        phoneNumber: phoneNumberCandidate.phoneNumber,
      });
    }
  }

  return candidates.sort((left, right) =>
    left.displayName.localeCompare(right.displayName, 'de', {
      sensitivity: 'base',
    }),
  );
}

export async function loadDeviceEmergencyContactCandidates(
  options: DeviceEmergencyContactLoadOptions = {},
): Promise<DeviceEmergencyContactCandidate[]> {
  const permissionState = await getDeviceContactsPermissionState();

  if (permissionState !== 'granted') {
    cachedDeviceEmergencyContactCandidates = null;
    return [];
  }

  if (pendingDeviceEmergencyContactCandidatesLoad !== null) {
    return [...(await pendingDeviceEmergencyContactCandidatesLoad)];
  }

  if (
    !options.forceRefresh &&
    cachedDeviceEmergencyContactCandidates !== null
  ) {
    return [...cachedDeviceEmergencyContactCandidates];
  }

  const loadPromise = (async () => {
    const contacts =
      await loadFreshDeviceEmergencyContactCandidates();

    const permissionStateAfterLoad =
      await getDeviceContactsPermissionState();

    if (permissionStateAfterLoad !== 'granted') {
      cachedDeviceEmergencyContactCandidates = null;
      return [];
    }

    cachedDeviceEmergencyContactCandidates = contacts;

    return contacts;
  })();

  pendingDeviceEmergencyContactCandidatesLoad = loadPromise;

  try {
    return [...(await loadPromise)];
  } finally {
    if (pendingDeviceEmergencyContactCandidatesLoad === loadPromise) {
      pendingDeviceEmergencyContactCandidatesLoad = null;
    }
  }
}
