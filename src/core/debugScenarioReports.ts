// src/core/debugScenarioReports.ts
import { runAndFormatLaufBuddyDebugScenario } from './runAndFormatLaufBuddyDebugScenario';

export function runSoloProtectionReadyScenarioReport(): string {
  return runAndFormatLaufBuddyDebugScenario('soloProtectionReady');
}

export function runBuddyConnectedScenarioReport(): string {
  return runAndFormatLaufBuddyDebugScenario('buddyConnected');
}

export function runBuddyLostAfterConnectionScenarioReport(): string {
  return runAndFormatLaufBuddyDebugScenario('buddyLostAfterConnection');
}

export function runNormalEmergencyByHotwordScenarioReport(): string {
  return runAndFormatLaufBuddyDebugScenario('normalEmergencyByHotword');
}

