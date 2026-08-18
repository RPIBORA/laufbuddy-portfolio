// src/services/releaseSetupService.ts
import { PermissionsAndroid, Platform } from 'react-native';
import { loadStoredEmergencyContacts } from './emergencyContactsStorageService';
import {
  getFullScreenIntentAccessStatus,
  type FullScreenIntentAccessStatus,
} from './fullScreenIntentAccessService';
import { refreshNativeHotwordState } from './laufBuddyHotwordControlService';
import { runLocationTrackingService } from './runLocationTrackingService';
export {
  getReleaseSetupActionState,
  type ReleaseSetupActionState,
} from './releaseSetupActionState';

type AndroidPermission = Parameters<typeof PermissionsAndroid.check>[0];

export type ReleaseSetupStepKey =
  | 'microphone'
  | 'phoneCall'
  | 'phoneState'
  | 'notifications'
  | 'location'
  | 'emergencyContact';

export type ReleaseSetupStepStatus = {
  key: ReleaseSetupStepKey;
  label: string;
  isReady: boolean;
  missingText: string;
};

export type ReleaseSetupStatus = {
  isReadyForHome: boolean;
  steps: ReleaseSetupStepStatus[];
  fullScreenIntentAccess: FullScreenIntentAccessStatus;
};

export type ReleaseSetupPermissionRequestResult = {
  permanentlyDenied: ReleaseSetupStepKey[];
};

const POST_NOTIFICATIONS_PERMISSION =
  'android.permission.POST_NOTIFICATIONS' as AndroidPermission;

async function hasAndroidPermission(permission: AndroidPermission): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  return PermissionsAndroid.check(permission);
}

async function hasNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const androidVersion = Number(Platform.Version);

  if (!Number.isFinite(androidVersion) || androidVersion < 33) {
    return true;
  }

  return PermissionsAndroid.check(POST_NOTIFICATIONS_PERMISSION);
}

export async function loadReleaseSetupStatus(): Promise<ReleaseSetupStatus> {
  const [
    hasMicrophonePermission,
    hasPhoneCallPermission,
    hasPhoneStatePermission,
    hasLocationPermission,
    hasNotificationRuntimePermission,
    storedEmergencyContacts,
    fullScreenIntentAccess,
  ] = await Promise.all([
    hasAndroidPermission(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO),
    hasAndroidPermission(PermissionsAndroid.PERMISSIONS.CALL_PHONE),
    hasAndroidPermission(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE),
    runLocationTrackingService
      .getForegroundPermissionState()
      .then((state) => state === 'granted')
      .catch(() => false),
    hasNotificationPermission(),
    loadStoredEmergencyContacts().catch(() => []),
    getFullScreenIntentAccessStatus(),
  ]);

  const hasEmergencyContact = storedEmergencyContacts.length > 0;

  const steps: ReleaseSetupStepStatus[] = [
    {
      key: 'microphone',
      label: 'Mikrofon',
      isReady: hasMicrophonePermission,
      missingText: 'Mikrofonberechtigung fehlt',
    },
    {
      key: 'phoneCall',
      label: 'Telefonanruf',
      isReady: hasPhoneCallPermission,
      missingText: 'Telefonberechtigung fehlt',
    },
    {
      key: 'phoneState',
      label: 'Telefonstatus',
      isReady: hasPhoneStatePermission,
      missingText: 'Berechtigung für den Telefonstatus fehlt',
    },
    {
      key: 'notifications',
      label: 'Benachrichtigungen',
      isReady: hasNotificationRuntimePermission,
      missingText: 'Benachrichtigungsberechtigung fehlt',
    },
    {
      key: 'location',
      label: 'Vordergrundstandort',
      isReady: hasLocationPermission,
      missingText: 'Standortberechtigung fehlt',
    },
    {
      key: 'emergencyContact',
      label: 'Telefonkontakt',
      isReady: hasEmergencyContact,
      missingText: 'Telefonkontakt fehlt',
    },
  ];

  return {
    isReadyForHome: steps.every((step) => step.isReady),
    steps,
    fullScreenIntentAccess,
  };
}

export async function requestReleaseSetupPermissions(): Promise<ReleaseSetupPermissionRequestResult> {
  const permanentlyDenied: ReleaseSetupStepKey[] = [];

  if (Platform.OS !== 'android') {
    await runLocationTrackingService.requestForegroundPermission();
    return { permanentlyDenied };
  }

  const permissionsToRequest: AndroidPermission[] = [
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    PermissionsAndroid.PERMISSIONS.CALL_PHONE,
    PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
  ];

  const androidVersion = Number(Platform.Version);

  if (Number.isFinite(androidVersion) && androidVersion >= 33) {
    permissionsToRequest.push(POST_NOTIFICATIONS_PERMISSION);
  }

  const permissionResults = await PermissionsAndroid.requestMultiple(permissionsToRequest);
  const permissionSteps: Array<[AndroidPermission, ReleaseSetupStepKey]> = [
    [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, 'microphone'],
    [PermissionsAndroid.PERMISSIONS.CALL_PHONE, 'phoneCall'],
    [PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE, 'phoneState'],
    [POST_NOTIFICATIONS_PERMISSION, 'notifications'],
  ];

  permissionSteps.forEach(([permission, step]) => {
    if (permissionResults[permission] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      permanentlyDenied.push(step);
    }
  });

  await runLocationTrackingService.requestForegroundPermission();
  if (
    permissionResults[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] ===
      PermissionsAndroid.RESULTS.GRANTED
  ) {
    // This runs while ReleaseSetupScreen is still visible. The native side
    // performs its own permission/visibility/need checks before starting.
    await refreshNativeHotwordState();
  }

  return { permanentlyDenied };
}
