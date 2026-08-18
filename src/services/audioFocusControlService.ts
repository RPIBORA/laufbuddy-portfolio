import { NativeModules, Platform } from 'react-native';

type AudioFocusControlNativeModule = {
  requestSpeechAudioFocus(): Promise<void>;
  requestDuckAudioFocus(): Promise<void>;
  abandonAudioFocus(): Promise<void>;
  playEmergencyBeep(): Promise<void>;
  speakRunCoachText?(message: string): Promise<void>;
};

function getNativeModule(): AudioFocusControlNativeModule | null {
  const nativeModule = NativeModules.AudioFocusControlModule as
    | AudioFocusControlNativeModule
    | undefined;

  if (!nativeModule) {
    return null;
  }

  if (
    typeof nativeModule.requestSpeechAudioFocus !== 'function' ||
    typeof nativeModule.requestDuckAudioFocus !== 'function' ||
    typeof nativeModule.abandonAudioFocus !== 'function' ||
    typeof nativeModule.playEmergencyBeep !== 'function'
  ) {
    return null;
  }

  return nativeModule;
}

export async function requestSpeechAudioFocus(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const nativeModule = getNativeModule();

  if (!nativeModule) {
    throw new Error('AudioFocusControlModule ist nicht verfügbar.');
  }

  await nativeModule.requestSpeechAudioFocus();
}

export async function requestDuckAudioFocus(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const nativeModule = getNativeModule();

  if (!nativeModule) {
    throw new Error('AudioFocusControlModule ist nicht verfügbar.');
  }

  await nativeModule.requestDuckAudioFocus();
}

export async function abandonAudioFocus(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const nativeModule = getNativeModule();

  if (!nativeModule) {
    return;
  }

  await nativeModule.abandonAudioFocus();
}

export async function speakRunCoachText(
  message: string,
): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const trimmedMessage = message.trim();

  if (trimmedMessage.length === 0) {
    return;
  }

  const nativeModule = getNativeModule();

  if (
    !nativeModule ||
    typeof nativeModule.speakRunCoachText !== 'function'
  ) {
    throw new Error(
      'Native Kilometer-Sprachausgabe ist nicht verfügbar.',
    );
  }

  await nativeModule.speakRunCoachText(trimmedMessage);
}

export async function playEmergencyBeep(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const nativeModule = getNativeModule();

  if (!nativeModule) {
    return;
  }

  await nativeModule.playEmergencyBeep();
}
