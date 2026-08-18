// src/core/debugScenarioSmokeCheckReports.ts
import { runAndFormatAllLaufBuddyScenarioSmokeChecks } from './runAllLaufBuddyScenarioSmokeChecks';
import { runAndFormatLaufBuddyScenarioSmokeCheck } from './runAndFormatLaufBuddyScenarioSmokeCheck';

export function runSoloProtectionReadySmokeCheckReport(): string {
  return runAndFormatLaufBuddyScenarioSmokeCheck('soloProtectionReady');
}

export function runBuddyConnectedSmokeCheckReport(): string {
  return runAndFormatLaufBuddyScenarioSmokeCheck('buddyConnected');
}

export function runBuddyLostAfterConnectionSmokeCheckReport(): string {
  return runAndFormatLaufBuddyScenarioSmokeCheck('buddyLostAfterConnection');
}

export function runNormalEmergencyByHotwordSmokeCheckReport(): string {
  return runAndFormatLaufBuddyScenarioSmokeCheck('normalEmergencyByHotword');
}


export function runAllSmokeCheckReports(): string {
  return runAndFormatAllLaufBuddyScenarioSmokeChecks();
}