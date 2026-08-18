// src/core/laufBuddyRuntimeRegistry.ts
import type { AppOrchestratorResult } from './appOrchestrator';
import {
  createLaufBuddyRuntime,
  type CreateLaufBuddyRuntimeParams,
  type LaufBuddyRuntime,
} from './createLaufBuddyRuntime';
import type { DetectedHotword } from './hotwordDecision';

let laufBuddyRuntime: LaufBuddyRuntime | null = null;

export function ensureLaufBuddyRuntime(
  params: CreateLaufBuddyRuntimeParams = {},
): LaufBuddyRuntime {
  if (!laufBuddyRuntime) {
    laufBuddyRuntime = createLaufBuddyRuntime(params);
  }

  return laufBuddyRuntime;
}

export function getLaufBuddyRuntime(): LaufBuddyRuntime | null {
  return laufBuddyRuntime;
}

export function startLaufBuddyRuntime(
  params: CreateLaufBuddyRuntimeParams = {},
): LaufBuddyRuntime {
  const runtime = ensureLaufBuddyRuntime(params);
  runtime.start();
  return runtime;
}

export function stopLaufBuddyRuntime(): void {
  if (!laufBuddyRuntime) {
    return;
  }

  laufBuddyRuntime.stop();
  laufBuddyRuntime = null;
}

export function isLaufBuddyRuntimeStarted(): boolean {
  return laufBuddyRuntime?.isStarted() ?? false;
}

export function runPassiveOrchestrationOnLaufBuddyRuntime(): boolean {
  if (!laufBuddyRuntime) {
    return false;
  }

  laufBuddyRuntime.runPassiveOrchestration();
  return true;
}

export function submitDetectedHotwordToLaufBuddyRuntime(
  detectedHotword: DetectedHotword,
  nowMs?: number,
): AppOrchestratorResult | null {
  if (!laufBuddyRuntime) {
    return null;
  }

  return laufBuddyRuntime.submitDetectedHotword(detectedHotword, nowMs);
}

export default ensureLaufBuddyRuntime;