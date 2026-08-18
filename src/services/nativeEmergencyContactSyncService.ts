import { NativeModules, Platform } from 'react-native';

type NativeEmergencyContactModule = {
  syncPrimaryEmergencyContact(
    phoneNumber: string | null,
  ): Promise<void>;
  syncTemporaryLiveBuddyContact?(
    phoneNumber: string | null,
  ): Promise<void>;
};

function getNativeModule(): NativeEmergencyContactModule | null {
  if (Platform.OS !== 'android') {
    return null;
  }

  const nativeModule =
    NativeModules.LaufBuddyHotwordControlModule as
      | NativeEmergencyContactModule
      | undefined;

  if (
    !nativeModule ||
    typeof nativeModule.syncPrimaryEmergencyContact !== 'function'
  ) {
    return null;
  }

  return nativeModule;
}

export async function syncPrimaryEmergencyContactToNative(
  phoneNumber: string | null,
): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const nativeModule = getNativeModule();

  if (!nativeModule) {
    throw new Error(
      'Native Telefonkontakt-Synchronisierung ist nicht verfügbar.',
    );
  }

  await nativeModule.syncPrimaryEmergencyContact(phoneNumber);
}

export async function syncTemporaryLiveBuddyContactToNative(
  phoneNumber: string | null,
): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const nativeModule = getNativeModule();

  if (
    !nativeModule ||
    typeof nativeModule.syncTemporaryLiveBuddyContact !== 'function'
  ) {
    throw new Error(
      'Native LiveBuddy-Synchronisierung ist nicht verfügbar.',
    );
  }

  await nativeModule.syncTemporaryLiveBuddyContact(phoneNumber);
}

export default syncPrimaryEmergencyContactToNative;
