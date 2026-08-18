// src/services/heartRateBleService.ts
import {
  BleError,
  BleManager,
  Characteristic,
  Device,
  State,
  Subscription,
} from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';

const HEART_RATE_SERVICE_UUID = '180D';
const HEART_RATE_MEASUREMENT_CHARACTERISTIC_UUID = '2A37';

export interface HeartRateBleReading {
  bpm: number;
  deviceId: string;
  deviceName: string | null;
}

export interface HeartRateBleCallbacks {
  onPermissionRequired: () => void;
  onBluetoothUnavailable: () => void;
  onScanning: () => void;
  onConnecting: (deviceName: string | null) => void;
  onConnected: (deviceName: string | null) => void;
  onDisconnected: () => void;
  onHeartRate: (reading: HeartRateBleReading) => void;
  onError: (message: string) => void;
}

let bleManager: BleManager | null = null;
let bluetoothStateSubscription: Subscription | null = null;
let bluetoothPowerWaitResolver: ((isPoweredOn: boolean) => void) | null =
  null;
let heartRateSubscription: Subscription | null = null;
let deviceDisconnectSubscription: Subscription | null = null;
let connectedDevice: Device | null = null;
let activeStartPromise: Promise<void> | null = null;
let scanGeneration = 0;

function getBleManager(): BleManager {
  if (bleManager === null) {
    bleManager = new BleManager();
  }

  return bleManager;
}

function cancelBluetoothPowerWait(): void {
  bluetoothStateSubscription?.remove();
  bluetoothStateSubscription = null;

  const resolvePowerWait = bluetoothPowerWaitResolver;
  bluetoothPowerWaitResolver = null;
  resolvePowerWait?.(false);
}

function decodeBase64ToBytes(value: string): number[] {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleanedValue = value.replace(/=+$/, '');

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const character of cleanedValue) {
    const index = alphabet.indexOf(character);

    if (index < 0) {
      continue;
    }

    buffer = (buffer << 6) | index;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return bytes;
}

function parseHeartRateBpm(characteristic: Characteristic): number | null {
  if (!characteristic.value) {
    return null;
  }

  const bytes = decodeBase64ToBytes(characteristic.value);

  if (bytes.length < 2) {
    return null;
  }

  const flags = bytes[0];
  const isSixteenBitValue = (flags & 0x01) === 0x01;

  if (isSixteenBitValue) {
    if (bytes.length < 3) {
      return null;
    }

    return bytes[1] | (bytes[2] << 8);
  }

  return bytes[1];
}

async function hasRequiredAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);

    return (
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

async function waitForBluetoothPowerOn(callbacks: HeartRateBleCallbacks) {
  const manager = getBleManager();
  const currentState = await manager.state();

  if (currentState === State.PoweredOn) {
    return true;
  }

  if (currentState === State.Unsupported || currentState === State.Unauthorized) {
    callbacks.onBluetoothUnavailable();
    return false;
  }

  return new Promise<boolean>((resolve) => {
    cancelBluetoothPowerWait();

    let isSettled = false;
    const settle = (isPoweredOn: boolean) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      bluetoothStateSubscription?.remove();
      bluetoothStateSubscription = null;

      if (bluetoothPowerWaitResolver === settle) {
        bluetoothPowerWaitResolver = null;
      }

      resolve(isPoweredOn);
    };

    bluetoothPowerWaitResolver = settle;

    bluetoothStateSubscription = manager.onStateChange((state) => {
      if (state === State.PoweredOn) {
        settle(true);
        return;
      }

      if (state === State.Unsupported || state === State.Unauthorized) {
        callbacks.onBluetoothUnavailable();
        settle(false);
      }
    }, true);
  });
}

export async function startHeartRateBleScan(
  callbacks: HeartRateBleCallbacks,
): Promise<void> {
  if (connectedDevice !== null) {
    return;
  }

  if (activeStartPromise !== null) {
    await activeStartPromise;
    return;
  }

  stopHeartRateBleScan();

  const generation = ++scanGeneration;

  activeStartPromise = startHeartRateBleScanForGeneration(
    callbacks,
    generation,
  ).finally(() => {
    activeStartPromise = null;
  });

  await activeStartPromise;
}

async function startHeartRateBleScanForGeneration(
  callbacks: HeartRateBleCallbacks,
  generation: number,
): Promise<void> {
  const manager = getBleManager();

  const hasPermissions = await hasRequiredAndroidPermissions();

  if (!hasPermissions) {
    callbacks.onPermissionRequired();
    return;
  }

  if (generation !== scanGeneration) {
    return;
  }

  const isBluetoothReady = await waitForBluetoothPowerOn(callbacks);

  if (!isBluetoothReady) {
    return;
  }

  if (generation !== scanGeneration) {
    return;
  }

  callbacks.onScanning();

  manager.startDeviceScan(
    [HEART_RATE_SERVICE_UUID],
    null,
    async (scanError: BleError | null, scannedDevice: Device | null) => {
      if (generation !== scanGeneration) {
        return;
      }

      if (scanError) {
        callbacks.onError(scanError.message);
        stopHeartRateBleScan();
        return;
      }

      if (!scannedDevice) {
        return;
      }

      manager.stopDeviceScan();

      try {
        callbacks.onConnecting(scannedDevice.name ?? scannedDevice.localName ?? null);

        const device = await scannedDevice.connect();
        const discoveredDevice =
          await device.discoverAllServicesAndCharacteristics();

        if (generation !== scanGeneration) {
          void discoveredDevice.cancelConnection().catch(() => undefined);
          return;
        }

        connectedDevice = discoveredDevice;

        callbacks.onConnected(
          connectedDevice.name ?? connectedDevice.localName ?? null,
        );

        deviceDisconnectSubscription?.remove();
        deviceDisconnectSubscription = manager.onDeviceDisconnected(
          connectedDevice.id,
          (disconnectError) => {
            if (generation !== scanGeneration) {
              return;
            }

            heartRateSubscription?.remove();
            heartRateSubscription = null;
            deviceDisconnectSubscription?.remove();
            deviceDisconnectSubscription = null;
            connectedDevice = null;

            if (disconnectError) {
              callbacks.onError(disconnectError.message);
              return;
            }

            callbacks.onDisconnected();
          },
        );

        heartRateSubscription =
          connectedDevice.monitorCharacteristicForService(
            HEART_RATE_SERVICE_UUID,
            HEART_RATE_MEASUREMENT_CHARACTERISTIC_UUID,
            (monitorError, characteristic) => {
              if (monitorError) {
                callbacks.onError(monitorError.message);
                return;
              }

              if (!characteristic) {
                return;
              }

              const bpm = parseHeartRateBpm(characteristic);

              if (bpm === null) {
                return;
              }

              callbacks.onHeartRate({
                bpm,
                deviceId: connectedDevice?.id ?? scannedDevice.id,
                deviceName:
                  connectedDevice?.name ??
                  connectedDevice?.localName ??
                  scannedDevice.name ??
                  scannedDevice.localName ??
                  null,
              });
            },
          );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Pulssensor konnte nicht verbunden werden.';

        callbacks.onError(message);
        stopHeartRateBleScan();
      }
    },
  );
}

export function stopHeartRateBleScan(): void {
  const manager = getBleManager();

  scanGeneration += 1;

  manager.stopDeviceScan();

  heartRateSubscription?.remove();
  heartRateSubscription = null;

  deviceDisconnectSubscription?.remove();
  deviceDisconnectSubscription = null;

  cancelBluetoothPowerWait();

  if (connectedDevice) {
    void connectedDevice.cancelConnection().catch(() => undefined);
    connectedDevice = null;
  }
}

export function destroyHeartRateBleService(): void {
  stopHeartRateBleScan();

  bleManager?.destroy();
  bleManager = null;
}
