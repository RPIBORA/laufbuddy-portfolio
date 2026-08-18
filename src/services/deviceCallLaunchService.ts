import {
  Linking,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';

type PhoneCallNativeModule = {
  startDirectCall(phoneNumber: string): Promise<void>;
  openDialer(phoneNumber: string): Promise<void>;
};

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

function buildTelUrl(phoneNumber: string): string {
  return `tel:${phoneNumber}`;
}

function getNativeModule(): PhoneCallNativeModule | null {
  const nativeModule = NativeModules.PhoneCallModule as
    | PhoneCallNativeModule
    | undefined;

  if (!nativeModule) {
    return null;
  }

  if (
    typeof nativeModule.startDirectCall !== 'function' ||
    typeof nativeModule.openDialer !== 'function'
  ) {
    return null;
  }

  return nativeModule;
}

async function openTelUrl(phoneNumber: string): Promise<void> {
  const telUrl = buildTelUrl(phoneNumber);
  const canOpen = await Linking.canOpenURL(telUrl);

  if (!canOpen) {
    throw new Error('Die Telefon-App konnte nicht geöffnet werden.');
  }

  await Linking.openURL(telUrl);
}

async function ensureAndroidCallPermission(): Promise<void> {
  const permission = PermissionsAndroid.PERMISSIONS.CALL_PHONE;

  const alreadyGranted = await PermissionsAndroid.check(permission);

  if (alreadyGranted) {
    return;
  }

  const requestResult = await PermissionsAndroid.request(permission, {
    title: 'Telefonberechtigung erforderlich',
    message:
      'LaufBuddy braucht die Berechtigung, um im Notfall direkt einen Anruf zu starten.',
    buttonPositive: 'Erlauben',
    buttonNegative: 'Abbrechen',
  });

  if (requestResult !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('CALL_PHONE Berechtigung fehlt.');
  }
}

export async function startDirectDeviceCall(
  phoneNumber: string,
): Promise<void> {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  if (!normalizedPhoneNumber) {
    throw new Error('Die Zielrufnummer ist leer oder ungültig.');
  }

  if (Platform.OS !== 'android') {
    await openTelUrl(normalizedPhoneNumber);
    return;
  }

  await ensureAndroidCallPermission();

  const nativeModule = getNativeModule();

  if (!nativeModule) {
    throw new Error('PhoneCallModule ist nicht verfügbar.');
  }

  await nativeModule.startDirectCall(normalizedPhoneNumber);
}

export async function openDeviceDialer(phoneNumber: string): Promise<void> {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  if (!normalizedPhoneNumber) {
    throw new Error('Die Zielrufnummer ist leer oder ungültig.');
  }

  if (Platform.OS !== 'android') {
    await openTelUrl(normalizedPhoneNumber);
    return;
  }

  const nativeModule = getNativeModule();

  if (!nativeModule) {
    await openTelUrl(normalizedPhoneNumber);
    return;
  }

  await nativeModule.openDialer(normalizedPhoneNumber);
}