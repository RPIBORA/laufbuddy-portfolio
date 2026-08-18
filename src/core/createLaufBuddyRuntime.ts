import { voicePrompts as defaultVoicePrompts } from '../config/voicePrompts';
import { loadStoredEmergencyContacts } from '../services/emergencyContactsStorageService';
import { startNativeHotwordDetectedListener } from '../services/laufBuddyHotwordControlService';
import type {
  AppOrchestratorAdapters,
  AppOrchestratorResult,
} from './appOrchestrator';
import type { DetectedHotword } from './hotwordDecision';
import {
  installPassiveOrchestrationBridge,
  type PassiveOrchestrationBridgeCleanup,
} from './installPassiveOrchestrationBridge';
import {
  installEmergencyCallExecutionBridge,
  type EmergencyCallExecutionBridgeCleanup,
} from './installEmergencyCallExecutionBridge';
import {
  installCellularConnectivityBridge,
  type CellularConnectivityBridgeCleanup,
} from './installCellularConnectivityBridge';
import {
  installEmergencyCallPreparationBridge,
  type EmergencyCallPreparationBridgeCleanup,
} from './installEmergencyCallPreparationBridge';
import { runPassiveOrchestration } from './runPassiveOrchestration';
import { submitDetectedHotword } from './submitDetectedHotword';

export interface CreateLaufBuddyRuntimeParams {
  getIsAppReady?: () => boolean;
  lossAnnouncementDelayMs?: number;
  restoreAnnouncementDelayMs?: number;
  voicePrompts?: AppOrchestratorAdapters['voicePrompts'];
  runPassiveImmediately?: boolean;
}

export interface LaufBuddyRuntime {
  start: () => void;
  stop: () => void;
  isStarted: () => boolean;
  runPassiveOrchestration: () => void;
  submitDetectedHotword: (
    detectedHotword: DetectedHotword,
    nowMs?: number,
  ) => AppOrchestratorResult;
}

export function createLaufBuddyRuntime(
  params: CreateLaufBuddyRuntimeParams = {},
): LaufBuddyRuntime {
  const getIsAppReady = params.getIsAppReady ?? (() => true);
  const spokenPrompts = params.voicePrompts ?? defaultVoicePrompts;

  let passiveBridgeCleanup: PassiveOrchestrationBridgeCleanup | null = null;
  let emergencyCallPreparationBridgeCleanup: EmergencyCallPreparationBridgeCleanup | null =
    null;
  let emergencyCallExecutionBridgeCleanup: EmergencyCallExecutionBridgeCleanup | null =
    null;
  let cellularConnectivityBridgeCleanup: CellularConnectivityBridgeCleanup | null =
    null;
  let nativeHotwordDetectedListenerCleanup: (() => void) | null = null;

  const runPassive = () => {
    runPassiveOrchestration({
      isAppReady: getIsAppReady(),
      lossAnnouncementDelayMs: params.lossAnnouncementDelayMs,
      restoreAnnouncementDelayMs: params.restoreAnnouncementDelayMs,
      voicePrompts: spokenPrompts,
    });
  };

  const start = () => {
    if (
      passiveBridgeCleanup ||
      emergencyCallPreparationBridgeCleanup ||
      emergencyCallExecutionBridgeCleanup ||
      cellularConnectivityBridgeCleanup ||
      nativeHotwordDetectedListenerCleanup
    ) {
      return;
    }

    void loadStoredEmergencyContacts().catch((error) => {
      console.warn(
        '[LaufBuddyRuntime] Primärer Notfallkontakt konnte nicht nativ synchronisiert werden.',
        error,
      );
    });

    passiveBridgeCleanup = installPassiveOrchestrationBridge({
      getIsAppReady,
      lossAnnouncementDelayMs: params.lossAnnouncementDelayMs,
      restoreAnnouncementDelayMs: params.restoreAnnouncementDelayMs,
      voicePrompts: spokenPrompts,
      runImmediately: params.runPassiveImmediately,
    });

    emergencyCallPreparationBridgeCleanup =
      installEmergencyCallPreparationBridge();

    cellularConnectivityBridgeCleanup = installCellularConnectivityBridge();

    emergencyCallExecutionBridgeCleanup =
      installEmergencyCallExecutionBridge();

    nativeHotwordDetectedListenerCleanup = startNativeHotwordDetectedListener();
  };

  const stop = () => {
    if (passiveBridgeCleanup) {
      passiveBridgeCleanup();
      passiveBridgeCleanup = null;
    }

    if (emergencyCallPreparationBridgeCleanup) {
      emergencyCallPreparationBridgeCleanup();
      emergencyCallPreparationBridgeCleanup = null;
    }

    if (cellularConnectivityBridgeCleanup) {
      cellularConnectivityBridgeCleanup();
      cellularConnectivityBridgeCleanup = null;
    }

    if (emergencyCallExecutionBridgeCleanup) {
      emergencyCallExecutionBridgeCleanup();
      emergencyCallExecutionBridgeCleanup = null;
    }

    if (nativeHotwordDetectedListenerCleanup) {
      nativeHotwordDetectedListenerCleanup();
      nativeHotwordDetectedListenerCleanup = null;
    }
  };

  const isStarted = () =>
    passiveBridgeCleanup !== null &&
    emergencyCallPreparationBridgeCleanup !== null &&
    emergencyCallExecutionBridgeCleanup !== null &&
    cellularConnectivityBridgeCleanup !== null &&
    nativeHotwordDetectedListenerCleanup !== null;

  const submitHotword = (
    detectedHotword: DetectedHotword,
    nowMs?: number,
  ): AppOrchestratorResult => {
    return submitDetectedHotword({
      getIsAppReady,
      detectedHotword,
      nowMs,
      lossAnnouncementDelayMs: params.lossAnnouncementDelayMs,
      restoreAnnouncementDelayMs: params.restoreAnnouncementDelayMs,
      voicePrompts: spokenPrompts,
    });
  };

  return {
    start,
    stop,
    isStarted,
    runPassiveOrchestration: runPassive,
    submitDetectedHotword: submitHotword,
  };
}

export default createLaufBuddyRuntime;