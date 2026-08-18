import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'laufbuddy.bosEmergencyNumber.v1';

function normalizeEmergencyPhoneNumber(value: string): string {
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

export async function loadStoredBOSEmergencyNumber(): Promise<string | null> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  const normalizedValue = normalizeEmergencyPhoneNumber(rawValue);

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue;
}

export async function saveStoredBOSEmergencyNumber(
  phoneNumber: string,
): Promise<string> {
  const normalizedValue = normalizeEmergencyPhoneNumber(phoneNumber);

  if (!normalizedValue) {
    throw new Error('Die BOS-Nummer ist leer oder ungültig.');
  }

  await AsyncStorage.setItem(STORAGE_KEY, normalizedValue);

  return normalizedValue;
}

export async function clearStoredBOSEmergencyNumber(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}