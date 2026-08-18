export interface TemporaryLiveBuddyContact {
  id: string;
  displayName: string;
  phoneNumber: string;
}

let temporaryLiveBuddyContact: TemporaryLiveBuddyContact | null = null;

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

export function setTemporaryLiveBuddyContact(
  contact: TemporaryLiveBuddyContact,
): void {
  const displayName = contact.displayName.trim();
  const phoneNumber = normalizePhoneNumber(contact.phoneNumber);

  if (!displayName || !phoneNumber) {
    throw new Error('Der ausgewählte LiveBuddy hat keine gültige Telefonnummer.');
  }

  temporaryLiveBuddyContact = {
    id: contact.id.trim() || `${displayName}|${phoneNumber}`,
    displayName,
    phoneNumber,
  };
}

export function getTemporaryLiveBuddyContact(): TemporaryLiveBuddyContact | null {
  return temporaryLiveBuddyContact
    ? { ...temporaryLiveBuddyContact }
    : null;
}

export function clearTemporaryLiveBuddyContact(): void {
  temporaryLiveBuddyContact = null;
}
