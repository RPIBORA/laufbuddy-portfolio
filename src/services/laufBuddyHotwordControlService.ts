import {
  DeviceEventEmitter,
  EmitterSubscription,
  NativeModules,
  Platform,
} from 'react-native';
import type { DetectedHotword } from '../core/hotwordDecision';
import { useHotwordStore } from '../state/hotwordStore';
import { publishLiveCallAttempt } from './live/liveSessionService';

type LaufBuddyHotwordControlNativeModule = {
  setHotwordEnabledForCurrentRun(enabled: boolean): Promise<void>;
  refreshHotwordState(): Promise<void>;
  getHotwordStatus(): Promise<NativeHotwordStatusPayload>;
  pauseHotwordForWebRtc(): Promise<void>;
  resumeHotwordAfterWebRtc(): Promise<void>;
};

type NativeHotwordDetectedPayload = {
  hotword?: string;
  detectedAtMs?: number;
};

type NativeHotwordStatusPayload = {
  active?: boolean;
  reason?: string;
};

type NativeEmergencyCallDispatchedPayload = {
  dispatchedAtMs?: number;
};

const EVENT_NATIVE_HOTWORD_DETECTED = 'laufBuddyNativeHotwordDetected';
const EVENT_NATIVE_HOTWORD_STATUS = 'laufBuddyNativeHotwordStatus';
const EVENT_NATIVE_EMERGENCY_CALL_DISPATCHED =
  'laufBuddyNativeEmergencyCallDispatched';

function getNativeModule(): LaufBuddyHotwordControlNativeModule | null {
  const nativeModule = NativeModules.LaufBuddyHotwordControlModule as
    | LaufBuddyHotwordControlNativeModule
    | undefined;

  if (!nativeModule) {
    return null;
  }

  if (
    typeof nativeModule.setHotwordEnabledForCurrentRun !== 'function' ||
    typeof nativeModule.refreshHotwordState !== 'function' ||
    typeof nativeModule.getHotwordStatus !== 'function' ||
    typeof nativeModule.pauseHotwordForWebRtc !== 'function' ||
    typeof nativeModule.resumeHotwordAfterWebRtc !== 'function'
  ) {
    return null;
  }

  return nativeModule;
}

export async function setNativeHotwordEnabledForCurrentRun(
  enabled: boolean,
): Promise<void> {
  if (Platform.OS !== 'android') return;

  const nativeModule = getNativeModule();
  if (!nativeModule) {
    throw new Error('LaufBuddyHotwordControlModule ist nicht verfügbar.');
  }

  await nativeModule.setHotwordEnabledForCurrentRun(enabled);
}

function isDetectedHotword(value: string): value is DetectedHotword {
  return value === 'hilfe';
}

export function startNativeHotwordDetectedListener(): () => void {
  if (Platform.OS !== 'android') {
    return () => {};
  }

  console.log('[LaufBuddyHotwordControl] Native Hotword Listener gestartet');

  const subscription: EmitterSubscription = DeviceEventEmitter.addListener(
    EVENT_NATIVE_HOTWORD_DETECTED,
    (payload: NativeHotwordDetectedPayload) => {
      const hotword = typeof payload?.hotword === 'string' ? payload.hotword : '';
      const detectedAtMs =
        typeof payload?.detectedAtMs === 'number' ? payload.detectedAtMs : Date.now();

      console.log('[LaufBuddyHotwordControl] Native Hotword Event empfangen:', {
        hotword,
        detectedAtMs,
      });

      if (!isDetectedHotword(hotword)) {
        console.warn('[LaufBuddyHotwordControl] Native Hotword ignoriert:', hotword);
        return;
      }

      useHotwordStore
        .getState()
        .markDetectedHotword(hotword);

      console.log(
        '[LaufBuddyHotwordControl] Hotword protokolliert; ' +
          'der native ForegroundService führt den Notruf aus.',
        {
          hotword,
          detectedAtMs,
        },
      );
    },
  );

  const emergencyCallDispatchedSubscription: EmitterSubscription =
    DeviceEventEmitter.addListener(
      EVENT_NATIVE_EMERGENCY_CALL_DISPATCHED,
      (payload: NativeEmergencyCallDispatchedPayload) => {
        const dispatchedAtMs =
          typeof payload?.dispatchedAtMs === 'number'
            ? payload.dispatchedAtMs
            : Date.now();

        console.log(
          '[LaufBuddyHotwordControl] Nativer Telefonanruf an Telecom übergeben.',
          { dispatchedAtMs },
        );

        void publishLiveCallAttempt().catch((error: unknown) => {
          console.warn(
            '[LaufBuddyHotwordControl] Live-Anrufhinweis konnte nicht veröffentlicht werden.',
            error,
          );
        });
      },
    );

  const statusSubscription: EmitterSubscription = DeviceEventEmitter.addListener(
    EVENT_NATIVE_HOTWORD_STATUS,
    (payload: NativeHotwordStatusPayload) => {
      useHotwordStore.getState().setNativeStatus(
        payload.active === true,
        typeof payload.reason === 'string' ? payload.reason : 'Dienst konnte nicht gestartet werden.',
      );
    },
  );

  void getNativeModule()?.getHotwordStatus().then((status) => {
    useHotwordStore.getState().setNativeStatus(
      status.active === true,
      typeof status.reason === 'string' ? status.reason : 'Dienst konnte nicht gestartet werden.',
    );
  }).catch(() => undefined);

  return () => {
    console.log('[LaufBuddyHotwordControl] Native Hotword Listener beendet');
    subscription.remove();
    emergencyCallDispatchedSubscription.remove();
    statusSubscription.remove();
  };
}

export async function refreshNativeHotwordState(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const nativeModule = getNativeModule();

  if (!nativeModule) {
    return;
  }

  await nativeModule.refreshHotwordState();
  const status = await nativeModule.getHotwordStatus();
  useHotwordStore.getState().setNativeStatus(
    status.active === true,
    typeof status.reason === 'string' ? status.reason : 'Dienst konnte nicht gestartet werden.',
  );
}

export async function pauseNativeHotwordForWebRtc(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const nativeModule = getNativeModule();

  if (!nativeModule) {
    throw new Error('LaufBuddyHotwordControlModule ist nicht verfügbar.');
  }

  await nativeModule.pauseHotwordForWebRtc();
}

export async function resumeNativeHotwordAfterWebRtc(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const nativeModule = getNativeModule();

  if (!nativeModule) {
    return;
  }

  await nativeModule.resumeHotwordAfterWebRtc();
}
