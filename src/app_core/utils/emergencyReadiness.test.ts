import { strict as assert } from 'node:assert';
import { HeadphoneStatus } from '../../state/headphoneStatus';
import { HotwordStatus } from '../../state/hotwordStatus';
import { createEmergencyReadinessState } from './emergencyReadiness';

const readyContact = [{ displayName: 'Alex', phoneNumber: '+49123456789' }];

function readinessFor(fullScreenIntentAccess: { required: boolean; granted: boolean }) {
  return createEmergencyReadinessState(
    HeadphoneStatus.Connected,
    readyContact,
    HotwordStatus.Listening,
    null,
    fullScreenIntentAccess,
  );
}

assert.equal(readinessFor({ required: false, granted: true }).label, 'LaufBuddy aktiv');
assert.equal(readinessFor({ required: true, granted: true }).label, 'LaufBuddy aktiv');

const missingFullScreenAccess = readinessFor({ required: true, granted: false });
assert.equal(missingFullScreenAccess.label, 'LaufBuddy nicht aktiv');
assert.equal(
  missingFullScreenAccess.subline,
  'Anruf bei gesperrtem Bildschirm nicht freigegeben',
);

assert.equal(
  createEmergencyReadinessState(
    HeadphoneStatus.Disconnected,
    readyContact,
    HotwordStatus.Listening,
    null,
    { required: false, granted: true },
  ).subline,
  'Headset nicht verbunden',
);
assert.equal(
  createEmergencyReadinessState(
    HeadphoneStatus.Connected,
    [],
    HotwordStatus.Listening,
    null,
    { required: false, granted: true },
  ).subline,
  'Telefonkontakt fehlt',
);
assert.equal(
  createEmergencyReadinessState(
    HeadphoneStatus.Connected,
    readyContact,
    HotwordStatus.Disabled,
    'Mikrofonberechtigung fehlt',
    { required: false, granted: true },
  ).subline,
  'Mikrofonberechtigung fehlt',
);

console.log('emergencyReadiness full-screen intent checks passed');
