// src/core/debugStateActions.ts
import type { Session } from '../models/Session';
import {
  markLaufBuddyAppNotReady,
  markLaufBuddyAppReady,
  resetLaufBuddyAppReadyState,
} from './appReadyActions';
import { runPassiveOrchestrationOnLaufBuddyRuntime } from './laufBuddyRuntimeRegistry';
import { useAudioControlStore } from '../state/audioControlStore';
import { useBOSEmergencyStore } from '../state/bosEmergencyStore';
import { useBuddyAudioStore } from '../state/buddyAudioStore';
import { useBuddyConnectionAnnouncementStore } from '../state/buddyConnectionAnnouncementStore';
import { useConnectivityStore } from '../state/connectivityStore';
import { useConnectionRecoveryStore } from '../state/connectionRecoveryStore';
import { useHeadphoneStore } from '../state/headphoneStore';
import { useHotwordStore } from '../state/hotwordStore';
import { useNormalEmergencyStore } from '../state/normalEmergencyStore';
import { useSessionStore } from '../state/sessionStore';

export interface DebugStartSessionParams {
  sessionId?: string;
  userId?: string;
  activityType?: string;
  startedAt?: string;
}

function rerunRuntime(): void {
  runPassiveOrchestrationOnLaufBuddyRuntime();
}

export function debugMarkAppReady(): void {
  markLaufBuddyAppReady();
}

export function debugMarkAppNotReady(): void {
  markLaufBuddyAppNotReady();
}

export function debugConnectHeadphones(): void {
  useHeadphoneStore.getState().setConnected();
  rerunRuntime();
}

export function debugDisconnectHeadphones(): void {
  useHeadphoneStore.getState().setDisconnected();
  rerunRuntime();
}

export function debugSetConnectivityOnline(): void {
  useConnectivityStore.getState().setOnline();
  rerunRuntime();
}

export function debugSetConnectivityDegraded(): void {
  useConnectivityStore.getState().setDegraded();
  rerunRuntime();
}

export function debugSetConnectivityOffline(): void {
  useConnectivityStore.getState().setOffline();
  rerunRuntime();
}

export function debugStartSession(
  params: DebugStartSessionParams = {},
): Session {
  const startedAt = params.startedAt ?? new Date().toISOString();

  const session: Session = {
    id: params.sessionId ?? `debug-session-${Date.now()}`,
    userId: params.userId ?? 'debug-user',
    activityType: params.activityType ?? 'running',
  };

  useSessionStore.getState().startSession(session, startedAt);
  rerunRuntime();

  return session;
}

export function debugEndSession(
  endedAt: string = new Date().toISOString(),
): void {
  useSessionStore.getState().endSession(endedAt);
  rerunRuntime();
}

export function debugResetSession(): void {
  useSessionStore.getState().resetSession();
  rerunRuntime();
}

export function debugConnectBuddyAudio(
  buddyId: string = 'debug-buddy',
  callId: string = `debug-call-${Date.now()}`,
): void {
  const buddyAudioStore = useBuddyAudioStore.getState();
  buddyAudioStore.startAudioSession(buddyId);
  buddyAudioStore.setConnected(callId);
  rerunRuntime();
}

export function debugDisconnectBuddyAudio(): void {
  useBuddyAudioStore.getState().setAudioDisconnected();
  rerunRuntime();
}

export function debugFailBuddyAudio(
  message: string = 'debug_buddy_audio_error',
): void {
  useBuddyAudioStore.getState().setAudioError(message);
  rerunRuntime();
}

export function debugResetBuddyAudio(): void {
  useBuddyAudioStore.getState().resetAudioSession();
  rerunRuntime();
}

export function debugTriggerNormalEmergency(): void {
  useNormalEmergencyStore.getState().triggerEmergency();
  rerunRuntime();
}

export function debugResetNormalEmergency(): void {
  useNormalEmergencyStore.getState().resetEmergency();
  rerunRuntime();
}

export function debugTriggerBOSEmergency(): void {
  useBOSEmergencyStore.getState().triggerBOSEmergency();
  rerunRuntime();
}

export function debugResetBOSEmergency(): void {
  useBOSEmergencyStore.getState().resetBOSEmergency();
  rerunRuntime();
}

export function debugResetLaufBuddyState(): void {
  resetLaufBuddyAppReadyState();
  useSessionStore.getState().resetSession();
  useBuddyAudioStore.getState().resetAudioSession();
  useBuddyConnectionAnnouncementStore
    .getState()
    .resetBuddyConnectionAnnouncementState();
  useConnectivityStore.getState().resetConnectivity();
  useConnectionRecoveryStore.getState().resetRecovery();
  useHeadphoneStore.getState().resetHeadphoneState();
  useHotwordStore.getState().resetHotwordState();
  useNormalEmergencyStore.getState().resetEmergency();
  useBOSEmergencyStore.getState().resetBOSEmergency();
  useAudioControlStore.getState().resetAudioControl();
  rerunRuntime();
}