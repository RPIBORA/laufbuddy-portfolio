import assert from 'node:assert/strict';
import {
  getReleaseSetupActionState,
  type ReleaseSetupActionStatus,
} from './releaseSetupActionState';

function statusFor(options: {
  fullScreenRequired: boolean;
  fullScreenGranted: boolean;
  runtimeReady?: boolean;
  emergencyContactReady?: boolean;
}): ReleaseSetupActionStatus & { isReadyForHome: boolean } {
  const runtimeReady = options.runtimeReady ?? true;
  const emergencyContactReady = options.emergencyContactReady ?? true;

  return {
    isReadyForHome: runtimeReady && emergencyContactReady,
    fullScreenIntentAccess: {
      required: options.fullScreenRequired,
      granted: options.fullScreenGranted,
    },
    steps: [
      { key: 'microphone', isReady: runtimeReady },
      { key: 'phoneCall', isReady: runtimeReady },
      { key: 'phoneState', isReady: runtimeReady },
      { key: 'notifications', isReady: runtimeReady },
      { key: 'location', isReady: runtimeReady },
      { key: 'emergencyContact', isReady: emergencyContactReady },
    ],
  };
}

assert.deepEqual(
  getReleaseSetupActionState(statusFor({ fullScreenRequired: false, fullScreenGranted: true })),
  { hasMissingRuntimePermission: false, hasMissingEmergencyContact: false, showFullScreenIntentAccessCard: false },
);
assert.equal(
  getReleaseSetupActionState(statusFor({ fullScreenRequired: true, fullScreenGranted: false })).showFullScreenIntentAccessCard,
  true,
);
assert.equal(
  getReleaseSetupActionState(statusFor({ fullScreenRequired: true, fullScreenGranted: true })).showFullScreenIntentAccessCard,
  false,
);
assert.equal(
  getReleaseSetupActionState(statusFor({ fullScreenRequired: false, fullScreenGranted: true })).hasMissingRuntimePermission,
  false,
);
assert.deepEqual(
  getReleaseSetupActionState(statusFor({ fullScreenRequired: false, fullScreenGranted: true, emergencyContactReady: false })),
  { hasMissingRuntimePermission: false, hasMissingEmergencyContact: true, showFullScreenIntentAccessCard: false },
);
assert.equal(
  statusFor({ fullScreenRequired: false, fullScreenGranted: true }).isReadyForHome,
  true,
);
