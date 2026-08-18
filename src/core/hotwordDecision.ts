// src/core/hotwordDecision.ts
import { VoicePromptKey } from '../config/voicePrompts';
import { HotwordStatus } from '../state/hotwordStatus';
import { AppRuleContext, canHotwordListen } from './appRules';

export type DetectedHotword = 'hilfe';

export interface HotwordDecisionContext extends AppRuleContext {
  hotwordStatus: HotwordStatus;
}

export interface HotwordDecisionResult {
  ignore: boolean;
  shouldStartNormalEmergency: boolean;
  shouldDisableHotword: boolean;
  nextHotwordStatus: HotwordStatus;
  spokenPrompts: VoicePromptKey[];
}

export function decideHotwordAction(
  detectedHotword: DetectedHotword,
  ctx: HotwordDecisionContext,
): HotwordDecisionResult {
  const listeningAllowed = canHotwordListen(ctx);

  if (detectedHotword !== 'hilfe') {
    return {
      ignore: true,
      shouldStartNormalEmergency: false,
      shouldDisableHotword: false,
      nextHotwordStatus: ctx.hotwordStatus,
      spokenPrompts: [],
    };
  }

  if (ctx.hotwordStatus !== HotwordStatus.Listening) {
    return {
      ignore: true,
      shouldStartNormalEmergency: false,
      shouldDisableHotword: false,
      nextHotwordStatus: ctx.hotwordStatus,
      spokenPrompts: [],
    };
  }

  if (!listeningAllowed) {
    return {
      ignore: true,
      shouldStartNormalEmergency: false,
      shouldDisableHotword: false,
      nextHotwordStatus: ctx.hotwordStatus,
      spokenPrompts: [],
    };
  }

  return {
    ignore: false,
    shouldStartNormalEmergency: true,
    shouldDisableHotword: true,
    nextHotwordStatus: HotwordStatus.Disabled,
    spokenPrompts: [],
  };
}
