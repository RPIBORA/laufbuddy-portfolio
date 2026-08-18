// src/core/debugStateSnapshot.ts
import type { Session } from '../models/Session';
import { isLaufBuddyRuntimeStarted } from './laufBuddyRuntimeRegistry';
import { useAppReadyStore } from '../state/appReadyStore';
import { useAudioControlStore } from '../state/audioControlStore';
import { useBOSEmergencyStore } from '../state/bosEmergencyStore';
import { useBuddyAudioStore } from '../state/buddyAudioStore';
import { useBuddyConnectionAnnouncementStore } from '../state/buddyConnectionAnnouncementStore';
import { useConnectivityStore } from '../state/connectivityStore';
import { useHeadphoneStore } from '../state/headphoneStore';
import { useHotwordStore } from '../state/hotwordStore';
import { useNormalEmergencyStore } from '../state/normalEmergencyStore';
import { useSessionStore } from '../state/sessionStore';

export interface LaufBuddyDebugSnapshot {
  runtime: {
    started: boolean;
  };
  appReady: {
    isAppReady: boolean;
    readyAt: string | null;
    notReadyAt: string | null;
  };
  session: {
    status: string;
    session: Session | null;
  };
  buddyAudio: {
    status: string;
    buddyId: string | null;
    callId: string | null;
    startedAt: string | null;
    endedAt: string | null;
    errorMessage: string | null;
  };
  buddyAnnouncement: {
    hasSeenConnectedBuddySinceReset: boolean;
    buddyDisconnectedAt: number | null;
    buddyConnectedAt: number | null;
    lastAnnouncedTransition: 'lost' | 'restored' | null;
    lastAnnouncedAt: number | null;
  };
  connectivity: {
    status: string;
    changedAt: string | null;
    offlineSince: string | null;
    degradedSince: string | null;
  };
  headphones: {
    status: string;
    connectedAt: string | null;
    disconnectedAt: string | null;
  };
  hotword: {
    status: string;
    lastDetectedHotword: 'hilfe' | null;
    listeningStartedAt: string | null;
    disabledAt: string | null;
  };
  normalEmergency: {
    status: string;
    triggerSource: string | null;
    triggeredAt: string | null;
    acknowledgedAt: string | null;
    resolvedAt: string | null;
  };
  bosEmergency: {
    status: string;
    triggeredAt: string | null;
    escalatedAt: string | null;
    evidenceStartedAt: string | null;
    resolvedAt: string | null;
  };
  audioControl: {
    status: string;
    focusHeld: boolean;
    duckingActive: boolean;
    conversationStartedAt: string | null;
    focusReleasedAt: string | null;
  };
}

export function getLaufBuddyDebugSnapshot(): LaufBuddyDebugSnapshot {
  const appReadyState = useAppReadyStore.getState();
  const sessionState = useSessionStore.getState();
  const buddyAudioState = useBuddyAudioStore.getState();
  const buddyAnnouncementState =
    useBuddyConnectionAnnouncementStore.getState();
  const connectivityState = useConnectivityStore.getState();
  const headphoneState = useHeadphoneStore.getState();
  const hotwordState = useHotwordStore.getState();
  const normalEmergencyState = useNormalEmergencyStore.getState();
  const bosEmergencyState = useBOSEmergencyStore.getState();
  const audioControlState = useAudioControlStore.getState();

  return {
    runtime: {
      started: isLaufBuddyRuntimeStarted(),
    },
    appReady: {
      isAppReady: appReadyState.isAppReady,
      readyAt: appReadyState.readyAt,
      notReadyAt: appReadyState.notReadyAt,
    },
    session: {
      status: String(sessionState.status),
      session: sessionState.session,
    },
    buddyAudio: {
      status: String(buddyAudioState.status),
      buddyId: buddyAudioState.buddyId,
      callId: buddyAudioState.callId,
      startedAt: buddyAudioState.startedAt,
      endedAt: buddyAudioState.endedAt,
      errorMessage: buddyAudioState.errorMessage,
    },
    buddyAnnouncement: {
      hasSeenConnectedBuddySinceReset:
        buddyAnnouncementState.hasSeenConnectedBuddySinceReset,
      buddyDisconnectedAt: buddyAnnouncementState.buddyDisconnectedAt,
      buddyConnectedAt: buddyAnnouncementState.buddyConnectedAt,
      lastAnnouncedTransition:
        buddyAnnouncementState.lastAnnouncedTransition,
      lastAnnouncedAt: buddyAnnouncementState.lastAnnouncedAt,
    },
    connectivity: {
      status: String(connectivityState.status),
      changedAt: connectivityState.changedAt,
      offlineSince: connectivityState.offlineSince,
      degradedSince: connectivityState.degradedSince,
    },
    headphones: {
      status: String(headphoneState.status),
      connectedAt: headphoneState.connectedAt,
      disconnectedAt: headphoneState.disconnectedAt,
    },
    hotword: {
      status: String(hotwordState.status),
      lastDetectedHotword: hotwordState.lastDetectedHotword,
      listeningStartedAt: hotwordState.listeningStartedAt,
      disabledAt: hotwordState.disabledAt,
    },
    normalEmergency: {
      status: String(normalEmergencyState.status),
      triggerSource: normalEmergencyState.triggerSource,
      triggeredAt: normalEmergencyState.triggeredAt,
      acknowledgedAt: normalEmergencyState.acknowledgedAt,
      resolvedAt: normalEmergencyState.resolvedAt,
    },
    bosEmergency: {
      status: String(bosEmergencyState.status),
      triggeredAt: bosEmergencyState.triggeredAt,
      escalatedAt: bosEmergencyState.escalatedAt,
      evidenceStartedAt: bosEmergencyState.evidenceStartedAt,
      resolvedAt: bosEmergencyState.resolvedAt,
    },
    audioControl: {
      status: String(audioControlState.status),
      focusHeld: audioControlState.focusHeld,
      duckingActive: audioControlState.duckingActive,
      conversationStartedAt: audioControlState.conversationStartedAt,
      focusReleasedAt: audioControlState.focusReleasedAt,
    },
  };
}

export default getLaufBuddyDebugSnapshot;