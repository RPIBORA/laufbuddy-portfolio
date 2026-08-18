// src/core/bootstrapLaufBuddyCore.ts
import { voicePrompts as defaultVoicePrompts } from '../config/voicePrompts';
import { useAppReadyStore } from '../state/appReadyStore';
import {
  markLaufBuddyAppNotReady,
  markLaufBuddyAppReady,
} from './appReadyActions';
import type { AppOrchestratorAdapters } from './appOrchestrator';
import type { CreateLaufBuddyRuntimeParams } from './createLaufBuddyRuntime';
import { installRunTrackingBridge } from './installRunTrackingBridge';
import { queueActiveRunSnapshot } from '../services/activeRunSnapshotService';
import { useRunStatus } from '../app_core/state/useRunStatus';
import {
  startLaufBuddyRuntime,
  stopLaufBuddyRuntime,
} from './laufBuddyRuntimeRegistry';

export interface BootstrapLaufBuddyCoreParams {
  lossAnnouncementDelayMs?: number;
  restoreAnnouncementDelayMs?: number;
  voicePrompts?: AppOrchestratorAdapters['voicePrompts'];
  runPassiveImmediately?: boolean;
}

type LaufBuddyCoreCleanup = () => void;

let isBootstrapped = false;
let activeCleanup: LaufBuddyCoreCleanup | null = null;

export async function bootstrapLaufBuddyCore(
  params: BootstrapLaufBuddyCoreParams = {},
): Promise<LaufBuddyCoreCleanup> {
  if (isBootstrapped && activeCleanup) {
    return activeCleanup;
  }

  console.log('[Core] Bootstrapping LaufBuddy Core...');

  markLaufBuddyAppNotReady();

  const runtimeParams: CreateLaufBuddyRuntimeParams = {
    getIsAppReady: () => useAppReadyStore.getState().isAppReady,
    lossAnnouncementDelayMs: params.lossAnnouncementDelayMs,
    restoreAnnouncementDelayMs: params.restoreAnnouncementDelayMs,
    voicePrompts: params.voicePrompts ?? defaultVoicePrompts,
    runPassiveImmediately: params.runPassiveImmediately ?? true,
  };

  startLaufBuddyRuntime(runtimeParams);

  const runTrackingCleanup = await installRunTrackingBridge();
  const unsubscribeActiveRunSnapshot = useRunStatus.subscribe((state) => {
    if (state.sessionStatus === 'running' || state.sessionStatus === 'paused') {
      void queueActiveRunSnapshot(state).catch((error: unknown) => {
        console.error('[ActiveRunSnapshot] Persistierung fehlgeschlagen', error);
      });
    }
  });

  markLaufBuddyAppReady();

  activeCleanup = () => {
    unsubscribeActiveRunSnapshot();
    runTrackingCleanup();
    stopLaufBuddyRuntime();
    markLaufBuddyAppNotReady();

    activeCleanup = null;
    isBootstrapped = false;
  };

  isBootstrapped = true;

  console.log('[Core] LaufBuddy Runtime gestartet');
  console.log('[Core] RunTrackingBridge installiert');

  return activeCleanup;
}

export default bootstrapLaufBuddyCore;
