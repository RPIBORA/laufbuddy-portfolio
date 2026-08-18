import {
  DeviceEventEmitter,
  EmitterSubscription,
  NativeModules,
  Platform,
} from 'react-native';
import { useHeadphoneStore } from '../state/headphoneStore';
import { refreshNativeHotwordState } from './laufBuddyHotwordControlService';

type HeadphoneStatePayload = {
  connected?: boolean;
};

type HeadphoneConnectionNativeModule = {
  getCurrentHeadphoneState(): Promise<HeadphoneStatePayload>;
};

const EVENT_NAME = 'headphoneConnectionChanged';

function getNativeModule(): HeadphoneConnectionNativeModule | null {
  const nativeModule = NativeModules.HeadphoneConnectionModule as
    | HeadphoneConnectionNativeModule
    | undefined;

  if (!nativeModule) {
    return null;
  }

  return nativeModule;
}

function applyHeadphoneState(connected: boolean): void {
  const headphoneStore = useHeadphoneStore.getState();
  if (connected) {
    headphoneStore.setConnected();
    void refreshNativeHotwordState();
    return;
  }

  headphoneStore.setDisconnected();
  void refreshNativeHotwordState();
}

export async function syncInitialHeadphoneState(): Promise<void> {
  if (Platform.OS !== 'android') {
    applyHeadphoneState(false);
    return;
  }

  const nativeModule = getNativeModule();

  if (!nativeModule) {
    applyHeadphoneState(false);
    return;
  }

  try {
    const payload = await nativeModule.getCurrentHeadphoneState();
    applyHeadphoneState(payload.connected === true);
  } catch (error) {
    console.warn('Headset-Status konnte nicht initial gelesen werden.', error);
    applyHeadphoneState(false);
  }
}

export function startHeadphoneConnectionListener(): () => void {
  if (Platform.OS !== 'android') {
    applyHeadphoneState(false);
    return () => {};
  }

  const nativeModule = getNativeModule();

  if (!nativeModule) {
    applyHeadphoneState(false);
    return () => {};
  }

  void syncInitialHeadphoneState();

  const subscription: EmitterSubscription = DeviceEventEmitter.addListener(
    EVENT_NAME,
    (payload: HeadphoneStatePayload) => {
      applyHeadphoneState(payload.connected === true);
    },
  );

  return () => {
    subscription.remove();
  };
}
