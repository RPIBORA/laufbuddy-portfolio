import {
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';

const EVENT_NAME = 'LaufBuddyCellularServiceStateChanged';

interface CellularServiceStateNativeModule {
  startMonitoring: () => Promise<boolean>;
  stopMonitoring: () => Promise<boolean>;
}

export interface CellularServiceStateSnapshot {
  hasCellService: boolean;
  state: string;
  source: string;
  errorMessage?: string | null;
}

type Cleanup = () => void;

function getNativeModule(): CellularServiceStateNativeModule | null {
  if (Platform.OS !== 'android') {
    return null;
  }

  return (
    NativeModules.CellularServiceStateModule as
      | CellularServiceStateNativeModule
      | undefined
  ) ?? null;
}

export async function startCellularServiceStateMonitoring(): Promise<boolean> {
  const nativeModule = getNativeModule();

  if (nativeModule === null) {
    return false;
  }

  return nativeModule.startMonitoring();
}

export async function stopCellularServiceStateMonitoring(): Promise<boolean> {
  const nativeModule = getNativeModule();

  if (nativeModule === null) {
    return false;
  }

  return nativeModule.stopMonitoring();
}

export function installCellularServiceStateListener(
  onChange: (snapshot: CellularServiceStateSnapshot) => void,
): Cleanup {
  const nativeModule = getNativeModule();

  if (nativeModule === null) {
    return () => undefined;
  }

  const emitter = new NativeEventEmitter(
    NativeModules.CellularServiceStateModule,
  );

  const subscription = emitter.addListener(
    EVENT_NAME,
    (payload: CellularServiceStateSnapshot) => {
      onChange(payload);
    },
  );

  return () => {
    subscription.remove();
  };
}
