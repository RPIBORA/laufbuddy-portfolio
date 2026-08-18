// src/core/debugScenarioRunner.ts
import { voicePrompts } from '../config/voicePrompts';
import type { LaufBuddyDebugSnapshot } from './debugStateSnapshot';
import { getLaufBuddyDebugSnapshot } from './debugStateSnapshot';
import {
  debugConnectBuddyAudio,
  debugConnectHeadphones,
  debugDisconnectBuddyAudio,
  debugMarkAppReady,
  debugResetBuddyAudio,
  debugResetLaufBuddyState,
  debugSetConnectivityOnline,
  debugStartSession,
} from './debugStateActions';
import {
  debugTriggerHelpHotword,
} from './debugHotwordActions';
import { startLaufBuddyRuntime } from './laufBuddyRuntimeRegistry';
import { useAppReadyStore } from '../state/appReadyStore';

export type LaufBuddyDebugScenarioName =
  | 'soloProtectionReady'
  | 'buddyConnected'
  | 'buddyLostAfterConnection'
  | 'normalEmergencyByHotword';

export interface LaufBuddyDebugScenarioResult {
  scenario: LaufBuddyDebugScenarioName;
  snapshot: LaufBuddyDebugSnapshot;
}

function ensureDebugRuntimeStarted(): void {
  startLaufBuddyRuntime({
    getIsAppReady: () => useAppReadyStore.getState().isAppReady,
    voicePrompts,
    runPassiveImmediately: true,
  });
}

function prepareBaseRunningState(): void {
  ensureDebugRuntimeStarted();
  debugResetLaufBuddyState();
  debugMarkAppReady();
  debugSetConnectivityOnline();
  debugConnectHeadphones();
  debugStartSession();
}

export function runLaufBuddyDebugScenario(
  scenario: LaufBuddyDebugScenarioName,
): LaufBuddyDebugScenarioResult {
  switch (scenario) {
    case 'soloProtectionReady': {
      prepareBaseRunningState();
      debugResetBuddyAudio();
      break;
    }

    case 'buddyConnected': {
      prepareBaseRunningState();
      debugConnectBuddyAudio();
      break;
    }

    case 'buddyLostAfterConnection': {
      prepareBaseRunningState();
      debugConnectBuddyAudio();
      debugDisconnectBuddyAudio();
      break;
    }

    case 'normalEmergencyByHotword': {
      prepareBaseRunningState();
      debugTriggerHelpHotword();
      break;
    }

    default: {
      const neverScenario: never = scenario;
      throw new Error(`Unknown LaufBuddy debug scenario: ${neverScenario}`);
    }
  }

  return {
    scenario,
    snapshot: getLaufBuddyDebugSnapshot(),
  };
}

export function runSoloProtectionReadyScenario(): LaufBuddyDebugScenarioResult {
  return runLaufBuddyDebugScenario('soloProtectionReady');
}

export function runBuddyConnectedScenario(): LaufBuddyDebugScenarioResult {
  return runLaufBuddyDebugScenario('buddyConnected');
}

export function runBuddyLostAfterConnectionScenario(): LaufBuddyDebugScenarioResult {
  return runLaufBuddyDebugScenario('buddyLostAfterConnection');
}

export function runNormalEmergencyByHotwordScenario(): LaufBuddyDebugScenarioResult {
  return runLaufBuddyDebugScenario('normalEmergencyByHotword');
}

export default runLaufBuddyDebugScenario;