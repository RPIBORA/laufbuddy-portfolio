import { NativeModules, Platform } from 'react-native';

export type FullScreenIntentAccessStatus = {
  required: boolean;
  granted: boolean;
};

type PhoneCallFullScreenIntentNativeModule = {
  getFullScreenIntentAccessStatus(): Promise<FullScreenIntentAccessStatus>;
  openFullScreenIntentSettings(): Promise<boolean>;
};

function getNativeModule(): PhoneCallFullScreenIntentNativeModule | null {
  const nativeModule = NativeModules.PhoneCallModule as
    | PhoneCallFullScreenIntentNativeModule
    | undefined;

  if (
    !nativeModule ||
    typeof nativeModule.getFullScreenIntentAccessStatus !== 'function' ||
    typeof nativeModule.openFullScreenIntentSettings !== 'function'
  ) {
    return null;
  }

  return nativeModule;
}

export async function getFullScreenIntentAccessStatus(): Promise<FullScreenIntentAccessStatus> {
  if (Platform.OS !== 'android') {
    return { required: false, granted: true };
  }

  const nativeModule = getNativeModule();

  if (!nativeModule) {
    throw new Error('Der Android-Anrufzugriff ist nicht verfügbar.');
  }

  return nativeModule.getFullScreenIntentAccessStatus();
}

export async function openFullScreenIntentAccessSettings(): Promise<void> {
  const status = await getFullScreenIntentAccessStatus();

  if (!status.required) {
    return;
  }

  const nativeModule = getNativeModule();

  if (!nativeModule) {
    throw new Error('Der Android-Anrufzugriff ist nicht verfügbar.');
  }

  await nativeModule.openFullScreenIntentSettings();
}
