// src/app_core/screens/ReleaseSetupScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  loadReleaseSetupStatus,
  requestReleaseSetupPermissions,
  type ReleaseSetupPermissionRequestResult,
  type ReleaseSetupStatus,
} from '../../services/releaseSetupService';
import { getReleaseSetupActionState } from '../../services/releaseSetupActionState';
import { openFullScreenIntentAccessSettings } from '../../services/fullScreenIntentAccessService';

type ReleaseSetupScreenProps = {
  onOpenEmergencyContacts: () => void;
  onContinue: () => void;
};

export default function ReleaseSetupScreen({
  onOpenEmergencyContacts,
  onContinue,
}: ReleaseSetupScreenProps) {
  const [setupStatus, setSetupStatus] = useState<ReleaseSetupStatus | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [permissionResult, setPermissionResult] =
    useState<ReleaseSetupPermissionRequestResult | null>(null);

  const refreshSetupStatus = useCallback(async () => {
    const status = await loadReleaseSetupStatus();
    setSetupStatus(status);
    return status;
  }, []);

  useEffect(() => {
    void refreshSetupStatus();
  }, [refreshSetupStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        void refreshSetupStatus();
      }
    });

    return () => subscription.remove();
  }, [refreshSetupStatus]);

  const handleRequestPermissions = useCallback(async () => {
    setBusy(true);

    try {
      const result = await requestReleaseSetupPermissions();
      setPermissionResult(result);
      await refreshSetupStatus();
    } finally {
      setBusy(false);
    }
  }, [refreshSetupStatus]);

  const handleContinue = useCallback(async () => {
    const status = await refreshSetupStatus();

    if (status.isReadyForHome) {
      onContinue();
    }
  }, [onContinue, refreshSetupStatus]);

  const handleOpenFullScreenIntentSettings = useCallback(async () => {
    try {
      await openFullScreenIntentAccessSettings();
    } catch (error) {
      Alert.alert(
        'Android-Einstellung nicht geöffnet',
        error instanceof Error
          ? error.message
          : 'Die Android-Einstellung konnte nicht geöffnet werden.',
      );
    }
  }, []);

  const missingSteps =
    setupStatus?.steps.filter((step) => !step.isReady) ?? [];
  const actionState = setupStatus
    ? getReleaseSetupActionState(setupStatus)
    : null;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        <Text style={styles.eyebrow}>LaufBuddy</Text>
        <Text style={styles.title}>LaufBuddy vorbereiten</Text>
        <Text style={styles.text}>
          Damit LaufBuddy dich bei deinen Läufen zuverlässig begleitet,
          richten wir die wichtigsten Punkte einmalig vor dem ersten Lauf ein.
        </Text>

        <View style={styles.steps}>
          {setupStatus === null ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <Text style={styles.loadingText}>Prüfung läuft...</Text>
            </View>
          ) : (
            setupStatus.steps.map((step) => (
              <View key={step.key} style={styles.stepRow}>
                <Text style={styles.stepIcon}>{step.isReady ? '✓' : '•'}</Text>
                <View style={styles.stepTextBox}>
                  <Text style={styles.stepLabel}>{step.label}</Text>
                  <Text style={styles.stepSubline}>
                    {step.isReady ? 'Bereit' : step.missingText}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {actionState?.showFullScreenIntentAccessCard ? (
          <View style={styles.fullScreenAccessCard}>
          <Text style={styles.stepLabel}>Anrufzugriff</Text>
          <Text style={styles.fullScreenAccessExplanation}>
            Damit LaufBuddy bei gesperrtem Display deinen Telefonkontakt anrufen kann.
          </Text>
            <Pressable
              onPress={() => void handleOpenFullScreenIntentSettings()}
              style={styles.fullScreenAccessButton}
            >
              <Text style={styles.primaryButtonText}>In Android freigeben</Text>
            </Pressable>
          </View>
        ) : null}

        {actionState?.hasMissingRuntimePermission ? (
          <Pressable
            disabled={isBusy}
            onPress={handleRequestPermissions}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {isBusy ? 'Bitte warten...' : 'Berechtigungen freigeben'}
            </Text>
          </Pressable>
        ) : null}

        {permissionResult && permissionResult.permanentlyDenied.length > 0 ? (
          <>
            <Text style={styles.settingsHint}>
              Für {permissionResult.permanentlyDenied.length === 1 ? 'diese Berechtigung' : 'diese Berechtigungen'} wurde „Nicht mehr fragen“ gewählt. Du kannst sie in den App-Einstellungen wieder erlauben.
            </Text>
            <Pressable onPress={() => void Linking.openSettings()} style={styles.settingsButton}>
              <Text style={styles.secondaryButtonText}>App-Einstellungen öffnen</Text>
            </Pressable>
          </>
        ) : null}

        {setupStatus !== null ? (
          <Pressable
            onPress={onOpenEmergencyContacts}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              {actionState?.hasMissingEmergencyContact
                ? 'LaufBuddy-Kontakt auswählen'
                : 'LaufBuddy-Kontakt ändern'}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          disabled={!setupStatus?.isReadyForHome}
          onPress={handleContinue}
          style={[
            styles.continueButton,
            !setupStatus?.isReadyForHome ? styles.continueButtonDisabled : null,
          ]}
        >
          <Text style={styles.continueButtonText}>
            {setupStatus?.isReadyForHome
              ? 'Weiter zu LaufBuddy'
              : actionState?.hasMissingEmergencyContact &&
                  !actionState.hasMissingRuntimePermission
                ? 'Telefonkontakt fehlt noch'
              : `${missingSteps.length} Punkt(e) fehlen noch`}
          </Text>
        </Pressable>

        <Text style={styles.footerHint}>
          Diese Einrichtung erscheint nur, solange etwas Wichtiges fehlt.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 22,
    paddingTop: 54,
    paddingBottom: 40,
    backgroundColor: '#F3FAFD',
  },
  card: {
    borderRadius: 32,
    padding: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(36, 119, 168, 0.16)',
  },
  eyebrow: {
    color: '#2477A8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    textAlign: 'center',
    marginBottom: 4,
  },
  title: {
    color: '#153243',
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  text: {
    color: '#4B6170',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 20,
  },
  steps: {
    gap: 10,
    marginBottom: 20,
  },
  fullScreenAccessCard: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: '#EFF6FA',
    marginBottom: 20,
  },
  fullScreenAccessExplanation: {
    color: '#4B6170',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  fullScreenAccessButton: {
    borderRadius: 20,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#2477A8',
    marginTop: 14,
  },
  loadingRow: {
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#4B6170',
    fontSize: 15,
    fontWeight: '700',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    padding: 14,
    backgroundColor: '#EFF6FA',
  },
  stepIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: '#2477A8',
    fontSize: 20,
    fontWeight: '900',
    backgroundColor: '#FFFFFF',
  },
  stepTextBox: {
    flex: 1,
  },
  stepLabel: {
    color: '#12384D',
    fontSize: 16,
    fontWeight: '900',
  },
  stepSubline: {
    color: '#5B6B7A',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  primaryButton: {
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#2477A8',
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    borderRadius: 24,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#E7F1F7',
    marginBottom: 10,
  },
  secondaryButtonText: {
    color: '#12384D',
    fontSize: 16,
    fontWeight: '900',
  },
  settingsHint: {
    color: '#8A4B16',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  settingsButton: {
    borderRadius: 24,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#FCE9D6',
    marginBottom: 10,
  },
  continueButton: {
    borderRadius: 24,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#12384D',
  },
  continueButtonDisabled: {
    opacity: 0.45,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  footerHint: {
    color: '#6B7C89',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 16,
  },
});
