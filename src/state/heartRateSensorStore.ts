// src/state/heartRateSensorStore.ts
import { create } from 'zustand';
import { HeartRateSensorStatus } from './heartRateSensorStatus';

interface HeartRateSensorStoreState {
  status: HeartRateSensorStatus;
  currentHeartRateBpm: number | null;
  lastHeartRateAt: string | null;
  connectedDeviceName: string | null;
  errorMessage: string | null;

  setPermissionRequired: () => void;
  setBluetoothUnavailable: () => void;
  setScanning: () => void;
  setConnecting: (deviceName?: string | null) => void;
  setConnected: (deviceName?: string | null) => void;
  setDisconnected: () => void;
  setHeartRate: (heartRateBpm: number) => void;
  setError: (message: string) => void;
  resetHeartRateSensorState: () => void;
}

export const useHeartRateSensorStore = create<HeartRateSensorStoreState>((set) => ({
  status: HeartRateSensorStatus.NotConfigured,
  currentHeartRateBpm: null,
  lastHeartRateAt: null,
  connectedDeviceName: null,
  errorMessage: null,

  setPermissionRequired: () => {
    set({
      status: HeartRateSensorStatus.PermissionRequired,
      errorMessage: null,
    });
  },

  setBluetoothUnavailable: () => {
    set({
      status: HeartRateSensorStatus.BluetoothUnavailable,
      currentHeartRateBpm: null,
      lastHeartRateAt: null,
      connectedDeviceName: null,
      errorMessage: null,
    });
  },

  setScanning: () => {
    set({
      status: HeartRateSensorStatus.Scanning,
      errorMessage: null,
    });
  },

  setConnecting: (deviceName = null) => {
    set({
      status: HeartRateSensorStatus.Connecting,
      connectedDeviceName: deviceName,
      errorMessage: null,
    });
  },

  setConnected: (deviceName = null) => {
    set({
      status: HeartRateSensorStatus.Connected,
      connectedDeviceName: deviceName,
      errorMessage: null,
    });
  },

  setDisconnected: () => {
    set({
      status: HeartRateSensorStatus.Disconnected,
      currentHeartRateBpm: null,
      lastHeartRateAt: null,
      connectedDeviceName: null,
      errorMessage: null,
    });
  },

  setHeartRate: (heartRateBpm: number) => {
    set({
      status: HeartRateSensorStatus.Connected,
      currentHeartRateBpm: heartRateBpm,
      lastHeartRateAt: new Date().toISOString(),
      errorMessage: null,
    });
  },

  setError: (message: string) => {
    set({
      status: HeartRateSensorStatus.Error,
      errorMessage: message,
    });
  },

  resetHeartRateSensorState: () => {
    set({
      status: HeartRateSensorStatus.NotConfigured,
      currentHeartRateBpm: null,
      lastHeartRateAt: null,
      connectedDeviceName: null,
      errorMessage: null,
    });
  },
}));
