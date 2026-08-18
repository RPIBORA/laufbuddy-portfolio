// src/core/appOrchestrator.ts
import { VoicePromptKey } from '../config/voicePrompts';
import type { BuddyTransitionAnnouncement } from '../state/buddyConnectionAnnouncementStore';
import { HotwordStatus } from '../state/hotwordStatus';
import {
  AppRuleContext,
  canHotwordListen,
  isBuddyActive,
  shouldBuddyHavePriority,
  shouldDisableHotword,
  shouldFallbackFromBuddyToSoloProtection,
  shouldStopMusicCompletely,
} from './appRules';
import {
  decideHotwordAction,
  DetectedHotword,
  HotwordDecisionContext,
  HotwordDecisionResult,
} from './hotwordDecision';

export const DEFAULT_BUDDY_LOSS_ANNOUNCEMENT_DELAY_MS = 8000;
export const DEFAULT_BUDDY_RESTORE_ANNOUNCEMENT_DELAY_MS = 3000;

export type OrchestratorAction =
  | 'enableHotwordListening'
  | 'disableHotword'
  | 'triggerNormalEmergency'
  | 'allowMusic'
  | 'duckMusic'
  | 'stopMusicCompletely';

export interface BuddyConnectionAnnouncementContext {
  nowMs: number;
  hasSeenConnectedBuddySinceReset: boolean;
  buddyDisconnectedAt: number | null;
  buddyConnectedAt: number | null;
  lastAnnouncedTransition: BuddyTransitionAnnouncement;
  lastAnnouncedAt: number | null;
  lossAnnouncementDelayMs?: number;
  restoreAnnouncementDelayMs?: number;
}

export interface BuddyAnnouncementUpdate {
  lastAnnouncedTransition: BuddyTransitionAnnouncement;
  lastAnnouncedAt: number | null;
}

export interface AppOrchestratorContext extends AppRuleContext {
  hotwordStatus: HotwordStatus;
  buddyAnnouncement?: BuddyConnectionAnnouncementContext;
}

export interface AppOrchestratorResult {
  actions: OrchestratorAction[];
  spokenPrompts: VoicePromptKey[];
  nextHotwordStatus: HotwordStatus;
  buddyAnnouncementUpdate?: BuddyAnnouncementUpdate;
  hotwordDecision?: HotwordDecisionResult;
}

export interface AppOrchestratorAdapters {
  hotword: {
    enableListening(): void;
    disableHotword(): void;
  };
  normalEmergency: {
    triggerEmergency(): void;
  };
  audioControl: {
    allowMusic(): void;
    duckMusic(): void;
    releaseAudioFocus(): void;
    playEmergencyBeep?(): void;
  };
  voicePrompts?: {
    speakMany(promptKeys: VoicePromptKey[]): void;
  };
  buddyAnnouncement?: {
    markAnnouncementDelivered(
      transition: Exclude<BuddyTransitionAnnouncement, null>,
      announcedAt: number,
    ): void;
  };
}

function uniqueActions(actions: OrchestratorAction[]): OrchestratorAction[] {
  return [...new Set(actions)];
}

function uniquePromptKeys(promptKeys: VoicePromptKey[]): VoicePromptKey[] {
  return [...new Set(promptKeys)];
}

function toHotwordDecisionContext(
  ctx: AppOrchestratorContext,
): HotwordDecisionContext {
  return ctx;
}

function derivePassiveHotwordStatus(
  ctx: AppOrchestratorContext,
): HotwordStatus {
  if (shouldDisableHotword(ctx)) {
    return HotwordStatus.Disabled;
  }


  if (canHotwordListen(ctx)) {
    return HotwordStatus.Listening;
  }

  return HotwordStatus.Disabled;
}

function hasFreshTransitionAnnouncement(
  transitionStartedAt: number | null,
  expectedTransition: BuddyTransitionAnnouncement,
  announcement: BuddyConnectionAnnouncementContext,
): boolean {
  if (transitionStartedAt === null) {
    return false;
  }

  if (announcement.lastAnnouncedTransition !== expectedTransition) {
    return true;
  }

  if (announcement.lastAnnouncedAt === null) {
    return true;
  }

  return announcement.lastAnnouncedAt < transitionStartedAt;
}

function shouldAnnounceBuddyLoss(ctx: AppOrchestratorContext): boolean {
  const announcement = ctx.buddyAnnouncement;

  if (!announcement) {
    return false;
  }

  if (!announcement.hasSeenConnectedBuddySinceReset) {
    return false;
  }

  if (!shouldFallbackFromBuddyToSoloProtection(ctx)) {
    return false;
  }

  if (announcement.buddyDisconnectedAt === null) {
    return false;
  }

  const lossDelayMs =
    announcement.lossAnnouncementDelayMs ??
    DEFAULT_BUDDY_LOSS_ANNOUNCEMENT_DELAY_MS;

  if (announcement.nowMs - announcement.buddyDisconnectedAt < lossDelayMs) {
    return false;
  }

  return hasFreshTransitionAnnouncement(
    announcement.buddyDisconnectedAt,
    'lost',
    announcement,
  );
}

function shouldAnnounceBuddyRestored(ctx: AppOrchestratorContext): boolean {
  const announcement = ctx.buddyAnnouncement;

  if (!announcement) {
    return false;
  }

  if (!announcement.hasSeenConnectedBuddySinceReset) {
    return false;
  }

  if (!isBuddyActive(ctx)) {
    return false;
  }

  if (announcement.buddyConnectedAt === null) {
    return false;
  }

  const restoreDelayMs =
    announcement.restoreAnnouncementDelayMs ??
    DEFAULT_BUDDY_RESTORE_ANNOUNCEMENT_DELAY_MS;

  if (announcement.nowMs - announcement.buddyConnectedAt < restoreDelayMs) {
    return false;
  }

  return hasFreshTransitionAnnouncement(
    announcement.buddyConnectedAt,
    'restored',
    announcement,
  );
}

export function evaluatePassiveOrchestration(
  ctx: AppOrchestratorContext,
): AppOrchestratorResult {
  const actions: OrchestratorAction[] = [];
  const spokenPrompts: VoicePromptKey[] = [];
  const nextHotwordStatus = derivePassiveHotwordStatus(ctx);

  let buddyAnnouncementUpdate: BuddyAnnouncementUpdate | undefined;

  if (shouldAnnounceBuddyLoss(ctx)) {
    spokenPrompts.push('buddyConnectionLostSoloProtectionActive');
    buddyAnnouncementUpdate = {
      lastAnnouncedTransition: 'lost',
      lastAnnouncedAt: ctx.buddyAnnouncement?.nowMs ?? null,
    };
  }

  if (shouldAnnounceBuddyRestored(ctx)) {
    spokenPrompts.push('buddyConnectionRestored');
    buddyAnnouncementUpdate = {
      lastAnnouncedTransition: 'restored',
      lastAnnouncedAt: ctx.buddyAnnouncement?.nowMs ?? null,
    };
  }

  if (
    nextHotwordStatus === HotwordStatus.Listening &&
    ctx.hotwordStatus !== HotwordStatus.Listening
  ) {
    actions.push('enableHotwordListening');
  }

  if (
    nextHotwordStatus === HotwordStatus.Disabled &&
    ctx.hotwordStatus !== HotwordStatus.Disabled
  ) {
    actions.push('disableHotword');
  }

  if (shouldStopMusicCompletely(ctx)) {
    actions.push('stopMusicCompletely');
  } else if (shouldBuddyHavePriority(ctx)) {
    actions.push('duckMusic');
  } else {
    actions.push('allowMusic');
  }

  return {
    actions: uniqueActions(actions),
    spokenPrompts: uniquePromptKeys(spokenPrompts),
    nextHotwordStatus,
    buddyAnnouncementUpdate,
  };
}

export function handleDetectedHotword(
  detectedHotword: DetectedHotword,
  ctx: AppOrchestratorContext,
): AppOrchestratorResult {
  const decision = decideHotwordAction(
    detectedHotword,
    toHotwordDecisionContext(ctx),
  );

  const actions: OrchestratorAction[] = [];

  if (decision.shouldStartNormalEmergency) {
    actions.push('triggerNormalEmergency');
    actions.push('stopMusicCompletely');
  }

  if (decision.shouldDisableHotword) {
    actions.push('disableHotword');
  }

  return {
    actions: uniqueActions(actions),
    spokenPrompts: decision.spokenPrompts,
    nextHotwordStatus: decision.nextHotwordStatus,
    hotwordDecision: decision,
  };
}

export function applyOrchestratorResult(
  result: AppOrchestratorResult,
  adapters: AppOrchestratorAdapters,
): void {
  if (result.spokenPrompts.length > 0) {
    adapters.voicePrompts?.speakMany(result.spokenPrompts);
  }

  for (const action of result.actions) {
    switch (action) {
      case 'enableHotwordListening':
        adapters.hotword.enableListening();
        break;

      case 'disableHotword':
        adapters.hotword.disableHotword();
        break;

      case 'triggerNormalEmergency':
        adapters.audioControl.playEmergencyBeep?.();
        adapters.normalEmergency.triggerEmergency();
        break;

      case 'allowMusic':
        adapters.audioControl.allowMusic();
        break;

      case 'duckMusic':
        adapters.audioControl.duckMusic();
        break;

      case 'stopMusicCompletely':
        adapters.audioControl.releaseAudioFocus();
        break;
    }
  }

  if (
    result.buddyAnnouncementUpdate &&
    result.buddyAnnouncementUpdate.lastAnnouncedTransition !== null &&
    result.buddyAnnouncementUpdate.lastAnnouncedAt !== null
  ) {
    adapters.buddyAnnouncement?.markAnnouncementDelivered(
      result.buddyAnnouncementUpdate.lastAnnouncedTransition,
      result.buddyAnnouncementUpdate.lastAnnouncedAt,
    );
  }
}