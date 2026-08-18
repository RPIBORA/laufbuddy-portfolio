// src/core/submitDetectedHotword.ts
import type {
  AppOrchestratorAdapters,
  AppOrchestratorResult,
} from './appOrchestrator';
import type { DetectedHotword } from './hotwordDecision';
import { runDetectedHotword } from './runDetectedHotword';
import { useHotwordStore } from '../state/hotwordStore';

export interface SubmitDetectedHotwordParams {
  getIsAppReady: () => boolean;
  detectedHotword: DetectedHotword;
  nowMs?: number;
  lossAnnouncementDelayMs?: number;
  restoreAnnouncementDelayMs?: number;
  voicePrompts?: AppOrchestratorAdapters['voicePrompts'];
}

export function submitDetectedHotword(
  params: SubmitDetectedHotwordParams,
): AppOrchestratorResult {
  useHotwordStore.getState().markDetectedHotword(params.detectedHotword);

  return runDetectedHotword({
    isAppReady: params.getIsAppReady(),
    detectedHotword: params.detectedHotword,
    nowMs: params.nowMs,
    lossAnnouncementDelayMs: params.lossAnnouncementDelayMs,
    restoreAnnouncementDelayMs: params.restoreAnnouncementDelayMs,
    voicePrompts: params.voicePrompts,
  });
}

export default submitDetectedHotword;