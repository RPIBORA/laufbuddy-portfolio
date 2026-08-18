// src/core/debugScenarioReport.ts
import type {
  LaufBuddyDebugScenarioResult,
} from './debugScenarioRunner';
import type { LaufBuddyDebugSnapshot } from './debugStateSnapshot';

function line(label: string, value: unknown): string {
  return `${label}: ${String(value)}`;
}

export function formatLaufBuddyDebugSnapshot(
  snapshot: LaufBuddyDebugSnapshot,
): string {
  return [
    '=== LaufBuddy Debug Snapshot ===',
    '',
    '[runtime]',
    line('started', snapshot.runtime.started),
    '',
    '[appReady]',
    line('isAppReady', snapshot.appReady.isAppReady),
    line('readyAt', snapshot.appReady.readyAt),
    line('notReadyAt', snapshot.appReady.notReadyAt),
    '',
    '[session]',
    line('status', snapshot.session.status),
    line('sessionId', snapshot.session.session?.id ?? null),
    line('userId', snapshot.session.session?.userId ?? null),
    line('activityType', snapshot.session.session?.activityType ?? null),
    '',
    '[buddyAudio]',
    line('status', snapshot.buddyAudio.status),
    line('buddyId', snapshot.buddyAudio.buddyId),
    line('callId', snapshot.buddyAudio.callId),
    line('startedAt', snapshot.buddyAudio.startedAt),
    line('endedAt', snapshot.buddyAudio.endedAt),
    line('errorMessage', snapshot.buddyAudio.errorMessage),
    '',
    '[buddyAnnouncement]',
    line(
      'hasSeenConnectedBuddySinceReset',
      snapshot.buddyAnnouncement.hasSeenConnectedBuddySinceReset,
    ),
    line(
      'buddyDisconnectedAt',
      snapshot.buddyAnnouncement.buddyDisconnectedAt,
    ),
    line(
      'buddyConnectedAt',
      snapshot.buddyAnnouncement.buddyConnectedAt,
    ),
    line(
      'lastAnnouncedTransition',
      snapshot.buddyAnnouncement.lastAnnouncedTransition,
    ),
    line('lastAnnouncedAt', snapshot.buddyAnnouncement.lastAnnouncedAt),
    '',
    '[connectivity]',
    line('status', snapshot.connectivity.status),
    line('changedAt', snapshot.connectivity.changedAt),
    line('offlineSince', snapshot.connectivity.offlineSince),
    line('degradedSince', snapshot.connectivity.degradedSince),
    '',
    '[headphones]',
    line('status', snapshot.headphones.status),
    line('connectedAt', snapshot.headphones.connectedAt),
    line('disconnectedAt', snapshot.headphones.disconnectedAt),
    '',
    '[hotword]',
    line('status', snapshot.hotword.status),
    line('lastDetectedHotword', snapshot.hotword.lastDetectedHotword),
    line('listeningStartedAt', snapshot.hotword.listeningStartedAt),
    line('disabledAt', snapshot.hotword.disabledAt),
    '',
    '[normalEmergency]',
    line('status', snapshot.normalEmergency.status),
    line('triggerSource', snapshot.normalEmergency.triggerSource),
    line('triggeredAt', snapshot.normalEmergency.triggeredAt),
    line('acknowledgedAt', snapshot.normalEmergency.acknowledgedAt),
    line('resolvedAt', snapshot.normalEmergency.resolvedAt),
    '',
    '[bosEmergency]',
    line('status', snapshot.bosEmergency.status),
    line('triggeredAt', snapshot.bosEmergency.triggeredAt),
    line('escalatedAt', snapshot.bosEmergency.escalatedAt),
    line('evidenceStartedAt', snapshot.bosEmergency.evidenceStartedAt),
    line('resolvedAt', snapshot.bosEmergency.resolvedAt),
    '',
    '[audioControl]',
    line('status', snapshot.audioControl.status),
    line('focusHeld', snapshot.audioControl.focusHeld),
    line('duckingActive', snapshot.audioControl.duckingActive),
    line(
      'conversationStartedAt',
      snapshot.audioControl.conversationStartedAt,
    ),
    line('focusReleasedAt', snapshot.audioControl.focusReleasedAt),
  ].join('\n');
}

export function formatLaufBuddyDebugScenarioResult(
  result: LaufBuddyDebugScenarioResult,
): string {
  return [
    `=== LaufBuddy Scenario: ${result.scenario} ===`,
    '',
    formatLaufBuddyDebugSnapshot(result.snapshot),
  ].join('\n');
}

export default formatLaufBuddyDebugScenarioResult;