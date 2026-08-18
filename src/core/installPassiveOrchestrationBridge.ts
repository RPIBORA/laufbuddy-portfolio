// src/core/installPassiveOrchestrationBridge.ts
import type { AppOrchestratorAdapters } from './appOrchestrator';
import { runPassiveOrchestration } from './runPassiveOrchestration';
import { useAppReadyStore } from '../state/appReadyStore';
import { useBuddyAudioStore } from '../state/buddyAudioStore';
import { useBuddyConnectionAnnouncementStore } from '../state/buddyConnectionAnnouncementStore';
import { useConnectivityStore } from '../state/connectivityStore';
import { useHeadphoneStore } from '../state/headphoneStore';
import { useHotwordStore } from '../state/hotwordStore';
import { useNormalEmergencyStore } from '../state/normalEmergencyStore';
import { useSessionStore } from '../state/sessionStore';

export interface InstallPassiveOrchestrationBridgeParams {
  getIsAppReady: () => boolean;
  lossAnnouncementDelayMs?: number;
  restoreAnnouncementDelayMs?: number;
  voicePrompts?: AppOrchestratorAdapters['voicePrompts'];
  runImmediately?: boolean;
}

interface PassiveOrchestrationBridgeSnapshot {
  isAppReady: boolean;
  sessionStatus: string;
  buddyAudioStatus: string;
  headphoneStatus: string;
  normalEmergencyStatus: string;
  connectivityStatus: string;
  hotwordStatus: string;
  hasSeenConnectedBuddySinceReset: boolean;
  buddyDisconnectedAt: number | null;
  buddyConnectedAt: number | null;
  lastAnnouncedTransition: 'lost' | 'restored' | null;
  lastAnnouncedAt: number | null;
}

export type PassiveOrchestrationBridgeCleanup = () => void;

function createSnapshot(
  params: InstallPassiveOrchestrationBridgeParams,
): PassiveOrchestrationBridgeSnapshot {
  const sessionState = useSessionStore.getState();
  const buddyAudioState = useBuddyAudioStore.getState();
  const headphoneState = useHeadphoneStore.getState();
  const normalEmergencyState = useNormalEmergencyStore.getState();
  const connectivityState = useConnectivityStore.getState();
  const hotwordState = useHotwordStore.getState();
  const buddyAnnouncementState =
    useBuddyConnectionAnnouncementStore.getState();

  return {
    isAppReady: params.getIsAppReady(),
    sessionStatus: String(sessionState.status),
    buddyAudioStatus: String(buddyAudioState.status),
    headphoneStatus: String(headphoneState.status),
    normalEmergencyStatus: String(normalEmergencyState.status),
    connectivityStatus: String(connectivityState.status),
    hotwordStatus: String(hotwordState.status),
    hasSeenConnectedBuddySinceReset:
      buddyAnnouncementState.hasSeenConnectedBuddySinceReset,
    buddyDisconnectedAt: buddyAnnouncementState.buddyDisconnectedAt,
    buddyConnectedAt: buddyAnnouncementState.buddyConnectedAt,
    lastAnnouncedTransition:
      buddyAnnouncementState.lastAnnouncedTransition,
    lastAnnouncedAt: buddyAnnouncementState.lastAnnouncedAt,
  };
}

function createSnapshotKey(
  snapshot: PassiveOrchestrationBridgeSnapshot,
): string {
  return JSON.stringify(snapshot);
}

export function installPassiveOrchestrationBridge(
  params: InstallPassiveOrchestrationBridgeParams,
): PassiveOrchestrationBridgeCleanup {
  let disposed = false;
  let flushScheduled = false;
  let lastHandledSnapshotKey: string | null = null;

  const flush = () => {
    flushScheduled = false;

    if (disposed) {
      return;
    }

    const currentSnapshotKey = createSnapshotKey(createSnapshot(params));

    if (currentSnapshotKey === lastHandledSnapshotKey) {
      return;
    }

    runPassiveOrchestration({
      isAppReady: params.getIsAppReady(),
      lossAnnouncementDelayMs: params.lossAnnouncementDelayMs,
      restoreAnnouncementDelayMs: params.restoreAnnouncementDelayMs,
      voicePrompts: params.voicePrompts,
    });

    lastHandledSnapshotKey = createSnapshotKey(createSnapshot(params));
  };

  const scheduleFlush = () => {
    if (disposed || flushScheduled) {
      return;
    }

    flushScheduled = true;
    Promise.resolve().then(flush);
  };

  const unsubscribes = [
    useAppReadyStore.subscribe(() => scheduleFlush()),
    useSessionStore.subscribe(() => scheduleFlush()),
    useBuddyAudioStore.subscribe(() => scheduleFlush()),
    useHeadphoneStore.subscribe(() => scheduleFlush()),
    useNormalEmergencyStore.subscribe(() => scheduleFlush()),
    useConnectivityStore.subscribe(() => scheduleFlush()),
    useHotwordStore.subscribe(() => scheduleFlush()),
    useBuddyConnectionAnnouncementStore.subscribe(() => scheduleFlush()),
  ];

  if (params.runImmediately ?? true) {
    scheduleFlush();
  } else {
    lastHandledSnapshotKey = createSnapshotKey(createSnapshot(params));
  }

  return () => {
    disposed = true;

    unsubscribes.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}

export default installPassiveOrchestrationBridge;