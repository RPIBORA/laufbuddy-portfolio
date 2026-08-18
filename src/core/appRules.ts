// src/core/appRules.ts
import { SessionStatus } from '../state/sessionStatus';
import { BuddyAudioStatus } from '../state/buddyAudioStatus';
import { HeadphoneStatus } from '../state/headphoneStatus';
import { NormalEmergencyStatus } from '../state/normalEmergencyStatus';
import { ConnectivityStatus } from '../state/connectivityStatus';

export interface AppRuleContext {
  isAppReady: boolean;
  sessionStatus: SessionStatus;
  buddyAudioStatus: BuddyAudioStatus;
  headphoneStatus: HeadphoneStatus;
  normalEmergencyStatus: NormalEmergencyStatus;
  connectivityStatus: ConnectivityStatus;
}

export function isBuddyActive(ctx: AppRuleContext): boolean {
  return ctx.buddyAudioStatus === BuddyAudioStatus.Connected;
}

export function isNormalEmergencyActive(ctx: AppRuleContext): boolean {
  return (
    ctx.normalEmergencyStatus === NormalEmergencyStatus.Triggered ||
    ctx.normalEmergencyStatus === NormalEmergencyStatus.Alerting ||
    ctx.normalEmergencyStatus === NormalEmergencyStatus.Acknowledged
  );
}


export function isAnyEmergencyActive(ctx: AppRuleContext): boolean {
  return isNormalEmergencyActive(ctx);
}

export function hasUsableBuddyConnectivity(ctx: AppRuleContext): boolean {
  return (
    ctx.connectivityStatus === ConnectivityStatus.Online ||
    ctx.connectivityStatus === ConnectivityStatus.Degraded
  );
}

export function isSoloProtected(ctx: AppRuleContext): boolean {
  return (
    ctx.isAppReady &&
    ctx.headphoneStatus === HeadphoneStatus.Connected &&
    !isBuddyActive(ctx) &&
    !isAnyEmergencyActive(ctx)
  );
}

export function canHotwordListen(ctx: AppRuleContext): boolean {
  return isSoloProtected(ctx);
}

export function shouldDisableHotword(ctx: AppRuleContext): boolean {
  return !canHotwordListen(ctx);
}

export function shouldStopMusicCompletely(ctx: AppRuleContext): boolean {
  return isAnyEmergencyActive(ctx);
}

export function shouldBuddyHavePriority(ctx: AppRuleContext): boolean {
  return isBuddyActive(ctx) && !isAnyEmergencyActive(ctx);
}

export function shouldAllowBuddySelectionBeforeRun(ctx: AppRuleContext): boolean {
  return ctx.isAppReady && !isAnyEmergencyActive(ctx);
}

export function shouldRunSessionBasedLogic(ctx: AppRuleContext): boolean {
  return ctx.sessionStatus === SessionStatus.Active;
}

export function shouldFallbackFromBuddyToSoloProtection(ctx: AppRuleContext): boolean {
  return (
    !hasUsableBuddyConnectivity(ctx) &&
    ctx.headphoneStatus === HeadphoneStatus.Connected &&
    !isBuddyActive(ctx) &&
    !isAnyEmergencyActive(ctx)
  );
}