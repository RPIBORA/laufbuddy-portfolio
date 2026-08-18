import type { RunSessionStatus } from './runTrackingTypes';

export function shouldCancelPendingAutoPause(
  previousStatus: RunSessionStatus,
  nextStatus: RunSessionStatus,
): boolean {
  return previousStatus === 'running' && nextStatus !== 'running';
}

export function shouldCancelPendingAutoResume(
  previousStatus: RunSessionStatus,
  nextStatus: RunSessionStatus,
): boolean {
  return previousStatus === 'paused' && nextStatus !== 'paused';
}
