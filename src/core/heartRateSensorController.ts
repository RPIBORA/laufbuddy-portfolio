// src/core/heartRateSensorController.ts
import {
  startHeartRateBleScan,
  stopHeartRateBleScan,
} from '../services/heartRateBleService';
import { useHeartRateSensorStore } from '../state/heartRateSensorStore';

export async function startHeartRateSensor(): Promise<void> {
  const heartRateStore = useHeartRateSensorStore.getState();

  await startHeartRateBleScan({
    onPermissionRequired: () => {
      heartRateStore.setPermissionRequired();
    },

    onBluetoothUnavailable: () => {
      heartRateStore.setBluetoothUnavailable();
    },

    onScanning: () => {
      heartRateStore.setScanning();
    },

    onConnecting: (deviceName) => {
      heartRateStore.setConnecting(deviceName);
    },

    onConnected: (deviceName) => {
      heartRateStore.setConnected(deviceName);
    },

    onDisconnected: () => {
      heartRateStore.setDisconnected();
    },

    onHeartRate: (reading) => {
      heartRateStore.setHeartRate(reading.bpm);
    },

    onError: (message) => {
      heartRateStore.setError(message);
    },
  });
}

export function stopHeartRateSensor(): void {
  stopHeartRateBleScan();
  useHeartRateSensorStore.getState().setDisconnected();
}
