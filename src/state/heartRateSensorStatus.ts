// src/state/heartRateSensorStatus.ts
export enum HeartRateSensorStatus {
  NotConfigured = 'not_configured',
  PermissionRequired = 'permission_required',
  BluetoothUnavailable = 'bluetooth_unavailable',
  Scanning = 'scanning',
  Connecting = 'connecting',
  Connected = 'connected',
  Disconnected = 'disconnected',
  Error = 'error',
}
