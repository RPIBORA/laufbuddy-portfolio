// src/core/debugScenarioSmokeChecks.ts
import { AudioControlStatus } from '../state/audioControlStatus';
import { BOSEmergencyStatus } from '../state/bosEmergencyStatus';
import { BuddyAudioStatus } from '../state/buddyAudioStatus';
import { ConnectivityStatus } from '../state/connectivityStatus';
import { HeadphoneStatus } from '../state/headphoneStatus';
import { HotwordStatus } from '../state/hotwordStatus';
import { NormalEmergencyStatus } from '../state/normalEmergencyStatus';
import { SessionStatus } from '../state/sessionStatus';
import { formatLaufBuddyDebugScenarioResult } from './debugScenarioReport';
import {
  runLaufBuddyDebugScenario,
  type LaufBuddyDebugScenarioName,
} from './debugScenarioRunner';

export interface LaufBuddyScenarioSmokeCheckResult {
  scenario: LaufBuddyDebugScenarioName;
  passed: boolean;
  errors: string[];
  report: string;
}

function expectCondition(
  errors: string[],
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    errors.push(message);
  }
}

export function runLaufBuddyScenarioSmokeCheck(
  scenario: LaufBuddyDebugScenarioName,
): LaufBuddyScenarioSmokeCheckResult {
  const result = runLaufBuddyDebugScenario(scenario);
  const { snapshot } = result;
  const errors: string[] = [];

  switch (scenario) {
    case 'soloProtectionReady': {
      expectCondition(errors, snapshot.runtime.started, 'Runtime läuft nicht.');
      expectCondition(
        errors,
        snapshot.appReady.isAppReady,
        'App ist nicht bereit.',
      );
      expectCondition(
        errors,
        snapshot.session.status === SessionStatus.Active,
        'Session ist nicht aktiv.',
      );
      expectCondition(
        errors,
        snapshot.connectivity.status === ConnectivityStatus.Online,
        'Connectivity ist nicht online.',
      );
      expectCondition(
        errors,
        snapshot.headphones.status === HeadphoneStatus.Connected,
        'Kopfhörer sind nicht verbunden.',
      );
      expectCondition(
        errors,
        snapshot.buddyAudio.status === BuddyAudioStatus.Idle,
        'Buddy-Audio ist nicht im Idle-Zustand.',
      );
      expectCondition(
        errors,
        snapshot.hotword.status === HotwordStatus.Listening,
        'Hotword hört nicht im Solo-Schutz.',
      );
      expectCondition(
        errors,
        snapshot.normalEmergency.status === NormalEmergencyStatus.Idle,
        'Normaler Notfall ist unerwartet aktiv.',
      );
      expectCondition(
        errors,
        snapshot.bosEmergency.status === BOSEmergencyStatus.Idle,
        'BOS-Notfall ist unerwartet aktiv.',
      );
      expectCondition(
        errors,
        snapshot.audioControl.status === AudioControlStatus.MusicAllowed,
        'Audio ist nicht auf normales Musikhören gestellt.',
      );
      break;
    }

    case 'buddyConnected': {
      expectCondition(errors, snapshot.runtime.started, 'Runtime läuft nicht.');
      expectCondition(
        errors,
        snapshot.appReady.isAppReady,
        'App ist nicht bereit.',
      );
      expectCondition(
        errors,
        snapshot.session.status === SessionStatus.Active,
        'Session ist nicht aktiv.',
      );
      expectCondition(
        errors,
        snapshot.buddyAudio.status === BuddyAudioStatus.Connected,
        'Buddy-Audio ist nicht verbunden.',
      );
      expectCondition(
        errors,
        snapshot.buddyAnnouncement.hasSeenConnectedBuddySinceReset,
        'Buddy wurde nicht als schon einmal verbunden gemerkt.',
      );
      expectCondition(
        errors,
        snapshot.hotword.status === HotwordStatus.Disabled,
        'Hotword ist trotz verbundenem Buddy nicht aus.',
      );
      expectCondition(
        errors,
        snapshot.audioControl.status === AudioControlStatus.MusicDucked,
        'Audio ist bei verbundenem Buddy nicht geduckt.',
      );
      break;
    }

    case 'buddyLostAfterConnection': {
      expectCondition(errors, snapshot.runtime.started, 'Runtime läuft nicht.');
      expectCondition(
        errors,
        snapshot.session.status === SessionStatus.Active,
        'Session ist nicht aktiv.',
      );
      expectCondition(
        errors,
        snapshot.buddyAudio.status === BuddyAudioStatus.Disconnected,
        'Buddy-Audio ist nicht getrennt.',
      );
      expectCondition(
        errors,
        snapshot.buddyAnnouncement.hasSeenConnectedBuddySinceReset,
        'Vorherige Buddy-Verbindung wurde nicht gemerkt.',
      );
      expectCondition(
        errors,
        snapshot.hotword.status === HotwordStatus.Listening,
        'Hotword ist nach Buddy-Verlust nicht wieder aktiv.',
      );
      expectCondition(
        errors,
        snapshot.audioControl.status === AudioControlStatus.MusicAllowed,
        'Audio ist nach Buddy-Verlust nicht wieder freigegeben.',
      );
      break;
    }

    case 'normalEmergencyByHotword': {
      expectCondition(errors, snapshot.runtime.started, 'Runtime läuft nicht.');
      expectCondition(
        errors,
        snapshot.hotword.lastDetectedHotword === 'hilfe',
        'Letztes Hotword ist nicht hilfe.',
      );
      expectCondition(
        errors,
        snapshot.hotword.status === HotwordStatus.Disabled,
        'Hotword wurde nach hilfe nicht deaktiviert.',
      );
      expectCondition(
        errors,
        snapshot.normalEmergency.status === NormalEmergencyStatus.Triggered,
        'Normaler Notfall wurde durch hilfe nicht ausgelöst.',
      );
      expectCondition(
        errors,
        snapshot.bosEmergency.status === BOSEmergencyStatus.Idle,
        'BOS-Notfall wurde bei hilfe unerwartet verändert.',
      );
      expectCondition(
        errors,
        snapshot.audioControl.status === AudioControlStatus.AudioFocusReleased,
        'Audio wurde beim normalen Notfall nicht komplett gestoppt.',
      );
      break;
    }


    default: {
      const neverScenario: never = scenario;
      throw new Error(`Unknown smoke check scenario: ${neverScenario}`);
    }
  }

  return {
    scenario,
    passed: errors.length === 0,
    errors,
    report: formatLaufBuddyDebugScenarioResult(result),
  };
}

export default runLaufBuddyScenarioSmokeCheck;