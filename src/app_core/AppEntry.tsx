// src/app_core/AppEntry.tsx
import React, { useEffect, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import '../services/runBackgroundLocationService';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { AppRoot } from './AppRoot';
import AuthScreen from './screens/AuthScreen';
import { useAuthStore } from '../state/authStore';
import { AuthStatus } from '../state/authStatus';
import {
  getFirebaseAuth,
  subscribeToAuthState,
} from '../services/firebaseAuthService';
import { useRunHistory } from './state/useRunHistory';
import { useShoeStatus } from './state/useShoeStatus';
import { useBodyProfile } from './state/useBodyProfile';
import { queueDashboardSnapshotFirestoreSync } from '../services/dashboardFirestoreSyncService';
import { createBuddyInvitationLinkRouter } from '../services/buddyInvitationLinkRouter';
import {
  activateLocalDataScope,
  getActiveLocalDataScopeUid,
} from '../services/localDataScopeService';
import {
  getDeviceContactsPermissionState,
  loadDeviceEmergencyContactCandidates,
  requestDeviceContactsPermission,
} from '../services/deviceContactsService';

const DASHBOARD_SYNC_AFTER_AUTH_DELAY_MS = 3000;

function CenteredMessageScreen(props: {
  title: string;
  message: string;
  showSpinner?: boolean;
}) {
  return (
    <View style={styles.container}>
      {props.showSpinner ? <ActivityIndicator size="large" /> : null}
      <Text style={styles.title}>{props.title}</Text>
      <Text style={styles.message}>{props.message}</Text>
    </View>
  );
}

function queueDashboardSyncFromLocalState(localOwnerUid: string): void {
  const bodyProfile = useBodyProfile.getState();

  queueDashboardSnapshotFirestoreSync({
    runs: useRunHistory.getState().runs,
    shoes: useShoeStatus.getState().shoes,
    bodyProfile: {
      currentWeightKg: bodyProfile.currentWeightKg,
      heightCm: bodyProfile.heightCm,
      shoeSizeEu: bodyProfile.shoeSizeEu,
      updatedAt: bodyProfile.updatedAt,
    },
  }, localOwnerUid);
}

export function AppEntry() {
  const [pendingIncomingUrl, setPendingIncomingUrl] = useState<string | null>(null);
  const [pendingInvitationToken, setPendingInvitationToken] = useState<string | null>(null);
  const invitationRouterRef = useRef<ReturnType<typeof createBuddyInvitationLinkRouter> | null>(null);

  if (invitationRouterRef.current === null) {
    invitationRouterRef.current = createBuddyInvitationLinkRouter({
      onInvitation: (token) => setPendingInvitationToken(token),
    });
  }

  const parsedScreenshotUrl = pendingIncomingUrl
    ? Linking.parse(pendingIncomingUrl)
    : null;
  const screenshotScreen =
    parsedScreenshotUrl?.path === 'screenshot' &&
    typeof parsedScreenshotUrl.queryParams?.screen === 'string'
      ? parsedScreenshotUrl.queryParams.screen
      : null;


  useEffect(() => {
    let cancelled = false;

    const prepareDeviceContacts = async (
      requestIfUndetermined: boolean,
    ) => {
      try {
        let permissionState =
          await getDeviceContactsPermissionState();

        if (cancelled) {
          return;
        }

        if (
          requestIfUndetermined &&
          permissionState === 'undetermined'
        ) {
          permissionState =
            await requestDeviceContactsPermission();
        }

        if (cancelled || permissionState !== 'granted') {
          return;
        }

        await loadDeviceEmergencyContactCandidates({
          forceRefresh: !requestIfUndetermined,
        });
      } catch (error) {
        console.warn(
          '[AppEntry] Kontaktberechtigung oder Telefonbuch konnten nicht vorbereitet werden',
          error,
        );
      }
    };

    void prepareDeviceContacts(true);

    const subscription = AppState.addEventListener(
      'change',
      (nextAppState) => {
        if (nextAppState === 'active') {
          void prepareDeviceContacts(false);
        }
      },
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const authStatus = useAuthStore((state) => state.status);
  const beginAuthCheck = useAuthStore((state) => state.beginAuthCheck);
  const markAuthenticated = useAuthStore((state) => state.markAuthenticated);
  const markUnauthenticated = useAuthStore(
    (state) => state.markUnauthenticated,
  );

  useEffect(() => {
    const invitationRouter = invitationRouterRef.current;
    if (invitationRouter === null) return undefined;

    const receiveUrl = (incomingUrl: string) => {
      if (invitationRouter.receiveUrl(incomingUrl) === 'invalid') {
        setPendingIncomingUrl(incomingUrl);
      }
    };

    void Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) receiveUrl(initialUrl);
    }).catch(() => undefined);

    const subscription = Linking.addEventListener('url', ({ url: eventUrl }) => {
      receiveUrl(eventUrl);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const dashboardSyncTimers: ReturnType<typeof setTimeout>[] = [];
    let dashboardSyncScheduledForUid: string | null = null;
    let authScopeGeneration = 0;

    function clearDashboardSyncTimers() {
      while (dashboardSyncTimers.length > 0) {
        const timer = dashboardSyncTimers.pop();

        if (timer) {
          clearTimeout(timer);
        }
      }
    }

    function scheduleDashboardSyncAfterAuth(uid: string) {
      clearDashboardSyncTimers();

      dashboardSyncTimers.push(
        setTimeout(() => {
          if (getActiveLocalDataScopeUid() === uid) {
            queueDashboardSyncFromLocalState(uid);
          }
        }, DASHBOARD_SYNC_AFTER_AUTH_DELAY_MS),
      );
    }

    beginAuthCheck();

    const unsubscribe = subscribeToAuthState((user) => {
      if (user) {
        if (getFirebaseAuth().currentUser?.uid !== user.uid) {
          return;
        }
        const scopeGeneration = ++authScopeGeneration;
        // Do not hydrate a new account over another account's in-memory state.
        activateLocalDataScope(null);
        useRunHistory.getState().resetForAccountScope();
        useShoeStatus.getState().resetForAccountScope();
        useBodyProfile.getState().resetForAccountScope();
        activateLocalDataScope(user.uid);
        void Promise.all([
          useRunHistory.persist.rehydrate(),
          useShoeStatus.persist.rehydrate(),
          useBodyProfile.persist.rehydrate(),
        ]).then(() => {
          if (
            scopeGeneration !== authScopeGeneration ||
            getActiveLocalDataScopeUid() !== user.uid ||
            getFirebaseAuth().currentUser?.uid !== user.uid
          ) return;
          markAuthenticated(user);
          if (dashboardSyncScheduledForUid !== user.uid) {
            dashboardSyncScheduledForUid = user.uid;
            scheduleDashboardSyncAfterAuth(user.uid);
          }
        }).catch(() => undefined);

        return;
      }

      clearDashboardSyncTimers();
      authScopeGeneration += 1;
      dashboardSyncScheduledForUid = null;
      activateLocalDataScope(null);
      useRunHistory.getState().resetForAccountScope();
      useShoeStatus.getState().resetForAccountScope();
      useBodyProfile.getState().resetForAccountScope();
      markUnauthenticated();
    });

    return () => {
      clearDashboardSyncTimers();
      unsubscribe();
    };
  }, [beginAuthCheck, markAuthenticated, markUnauthenticated]);

  if (authStatus === AuthStatus.Loading) {
    return (
      <CenteredMessageScreen
        title="Anmeldung wird geprüft"
        message="Bitte kurz warten."
        showSpinner
      />
    );
  }

  if (screenshotScreen === 'auth') {
    return <AuthScreen />;
  }

  if (authStatus === AuthStatus.Unauthenticated) {
    return <AuthScreen />;
  }

  return (
    <AppRoot
      incomingUrl={pendingIncomingUrl}
      pendingInvitationToken={pendingInvitationToken}
      onIncomingUrlHandled={() => setPendingIncomingUrl(null)}
      onInvitationHandled={(token) => {
        invitationRouterRef.current?.resolveInvitation(token);
        setPendingInvitationToken(null);
      }}
    />
  );
}

export default AppEntry;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
});
