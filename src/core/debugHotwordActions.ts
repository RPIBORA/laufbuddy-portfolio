// src/core/debugHotwordActions.ts
import type { AppOrchestratorResult } from './appOrchestrator';
import type { DetectedHotword } from './hotwordDecision';
import { submitDetectedHotwordToLaufBuddyRuntime } from './laufBuddyRuntimeRegistry';

export function debugSubmitDetectedHotword(
  detectedHotword: DetectedHotword,
  nowMs?: number,
): AppOrchestratorResult | null {
  return submitDetectedHotwordToLaufBuddyRuntime(detectedHotword, nowMs);
}

export function debugTriggerHelpHotword(
  nowMs?: number,
): AppOrchestratorResult | null {
  return debugSubmitDetectedHotword('hilfe', nowMs);
}

export default debugSubmitDetectedHotword;
