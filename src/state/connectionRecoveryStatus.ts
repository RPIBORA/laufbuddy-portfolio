export enum ConnectionRecoveryStatus {
  Idle = 'idle',
  WaitingToReconnect = 'waiting_to_reconnect',
  Reconnecting = 'reconnecting',
  Recovered = 'recovered',
  Failed = 'failed',
}