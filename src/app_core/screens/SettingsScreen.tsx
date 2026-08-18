// src/app_core/screens/SettingsScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  signOutCurrentUser,
  updateCurrentUserUsername,
} from '../../services/firebaseAuthService';
import {
  getFullScreenIntentAccessStatus,
  openFullScreenIntentAccessSettings,
  type FullScreenIntentAccessStatus,
} from '../../services/fullScreenIntentAccessService';
import { useAuthStore } from '../../state/authStore';
import { SafetyWheel, type SafetyWheelIcon, type SafetyWheelItem } from '../components/SafetyWheel';
import { useBodyProfile } from '../state/useBodyProfile';

const { width } = Dimensions.get('window');
const SETTINGS_WHEEL_SIZE = Math.min(width * 0.96, 430);

type SettingsScreenProps = {
  onBack: () => void;
  onOpenRunProfile: () => void;
  onOpenEmergencyContacts: () => void;
  onOpenShoe: () => void;
};

type SettingsPanel =
  | 'none'
  | 'account'
  | 'weight'
  | 'callAccess'
  | 'version'
  | 'signOut';

function createEmojiWheelIcon(emoji: string): SafetyWheelIcon {
  return function EmojiWheelIcon({ size = 32 }: { size?: number }) {
    return <Text style={{ fontSize: Math.round(size * 0.72) }}>{emoji}</Text>;
  };
}

const AccountWheelIcon = createEmojiWheelIcon('👤');
const RunProfileWheelIcon = createEmojiWheelIcon('🏃');
const WeightWheelIcon = createEmojiWheelIcon('⚖️');
const ShoeWheelIcon = createEmojiWheelIcon('👟');
const EmergencyContactsWheelIcon = createEmojiWheelIcon('☎️');
const CallAccessWheelIcon = createEmojiWheelIcon('🔒');
const VersionWheelIcon = createEmojiWheelIcon('ℹ️');
const SignOutWheelIcon = createEmojiWheelIcon('🚪');
const BackWheelIcon = createEmojiWheelIcon('↩️');

function formatWeightInput(weightKg: number | null): string {
  if (weightKg === null) {
    return '';
  }

  return String(weightKg).replace('.', ',');
}

function parseWeightInput(value: string): number | null {
  const normalizedValue = value.trim().replace(',', '.');

  if (normalizedValue.length === 0) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return Math.round(parsedValue * 10) / 10;
}

export default function SettingsScreen({
  onBack,
  onOpenRunProfile,
  onOpenEmergencyContacts,
  onOpenShoe,
}: SettingsScreenProps) {
  const [activePanel, setActivePanel] = useState<SettingsPanel>('none');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [blockedAutoSaveValue, setBlockedAutoSaveValue] = useState<
    string | null
  >(null);
  const [fullScreenIntentAccess, setFullScreenIntentAccess] =
    useState<FullScreenIntentAccessStatus | null>(null);

  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const user = useAuthStore((state) => state.user);
  const markAuthenticated = useAuthStore((state) => state.markAuthenticated);

  const currentWeightKg = useBodyProfile((state) => state.currentWeightKg);
  const setCurrentWeightKg = useBodyProfile((state) => state.setCurrentWeightKg);

  const savedUsername = user?.username?.trim() ?? '';
  const trimmedUsernameInput = usernameInput.trim();

  const hasUsernameSaved =
    savedUsername.length > 0 && savedUsername === trimmedUsernameInput;
  const hasUsernameChanged = trimmedUsernameInput !== savedUsername;
  const parsedWeightInput = parseWeightInput(weightInput);
  const hasWeightSaved = parsedWeightInput === currentWeightKg;

  const refreshFullScreenIntentAccess = useCallback(() => {
    void getFullScreenIntentAccessStatus()
      .then(setFullScreenIntentAccess)
      .catch(() => setFullScreenIntentAccess(null));
  }, []);

  useEffect(() => {
    refreshFullScreenIntentAccess();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        refreshFullScreenIntentAccess();
      }
    });

    return () => subscription.remove();
  }, [refreshFullScreenIntentAccess]);

  useEffect(() => {
    setUsernameInput(user?.username ?? '');
  }, [user?.username]);

  useEffect(() => {
    setWeightInput(formatWeightInput(currentWeightKg));
  }, [currentWeightKg]);

  useEffect(() => {
    if (activePanel !== 'weight') {
      return;
    }

    if (currentWeightKg !== null) {
      return;
    }

    setWeightInput('75');
    setCurrentWeightKg(75);
  }, [activePanel, currentWeightKg, setCurrentWeightKg]);

  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      blockedAutoSaveValue !== null &&
      trimmedUsernameInput !== blockedAutoSaveValue
    ) {
      setBlockedAutoSaveValue(null);
    }
  }, [blockedAutoSaveValue, trimmedUsernameInput]);

  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    if (isSavingUsername) {
      return;
    }

    if (!hasUsernameChanged) {
      return;
    }

    if (blockedAutoSaveValue !== null && trimmedUsernameInput === blockedAutoSaveValue) {
      return;
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      setIsSavingUsername(true);

      try {
        const updatedUser = await updateCurrentUserUsername(usernameInput);
        markAuthenticated(updatedUser);
      } catch (error) {
        setBlockedAutoSaveValue(trimmedUsernameInput);

        const message =
          error instanceof Error
            ? error.message
            : 'Username konnte nicht gespeichert werden.';

        Alert.alert('Speichern fehlgeschlagen', message);
      } finally {
        setIsSavingUsername(false);
      }
    }, 700);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, [
    blockedAutoSaveValue,
    hasUsernameChanged,
    isSavingUsername,
    markAuthenticated,
    trimmedUsernameInput,
    usernameInput,
  ]);

  const handleUsernameChange = (value: string) => {
    setUsernameInput(value);

    if (blockedAutoSaveValue !== null) {
      setBlockedAutoSaveValue(null);
    }
  };

  const handleOpenAccountDeletion = async () => {
    const url = 'https://laufbuddy.app/konto-loeschen.html';

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        'Seite konnte nicht geöffnet werden',
        'Bitte öffne https://laufbuddy.app/konto-loeschen.html im Browser.'
      );
    }
  };

  const handleSaveWeight = () => {
    setCurrentWeightKg(parsedWeightInput);
  };

  const adjustWeightInput = (deltaKg: number) => {
    const baseWeight = parsedWeightInput ?? currentWeightKg ?? 75;
    const nextWeight = Math.max(1, Math.round((baseWeight + deltaKg) * 2) / 2);

    setWeightInput(String(nextWeight).replace('.', ','));
    setCurrentWeightKg(nextWeight);
  };

  const weightCenterPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => activePanel === 'weight',
        onMoveShouldSetPanResponder: (_, gestureState) =>
          activePanel === 'weight' &&
          Math.abs(gestureState.dy) > 18 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy < -18) {
            adjustWeightInput(0.5);
            return;
          }

          if (gestureState.dy > 18) {
            adjustWeightInput(-0.5);
          }
        },
      }),
    [activePanel, currentWeightKg, parsedWeightInput],
  );

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await signOutCurrentUser();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Abmeldung konnte nicht abgeschlossen werden.';

      Alert.alert('Abmeldung fehlgeschlagen', message);
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleOpenFullScreenIntentSettings = async () => {
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
  };

  const handleSelectedWheelItemChange = (itemKey: string) => {
    if (itemKey === 'account') {
      setActivePanel('account');
      return;
    }

    if (itemKey === 'weight') {
      setActivePanel('weight');
      return;
    }

    if (itemKey === 'callAccess') {
      setActivePanel('callAccess');
      return;
    }

    if (itemKey === 'version') {
      setActivePanel('version');
      return;
    }

    if (itemKey === 'signOut') {
      setActivePanel('signOut');
      return;
    }

    setActivePanel('none');
  };

  const settingsWheelItems: SafetyWheelItem[] = [
    {
      key: 'account',
      label: 'Konto',
      icon: AccountWheelIcon,
      action: () => setActivePanel('account'),
    },
    {
      key: 'runProfile',
      label: 'Laufprofil',
      icon: RunProfileWheelIcon,
      action: onOpenRunProfile,
    },
    {
      key: 'weight',
      label: 'Gewicht',
      icon: WeightWheelIcon,
      action: () => setActivePanel('weight'),
    },
    {
      key: 'shoe',
      label: 'Schuhe',
      icon: ShoeWheelIcon,
      action: onOpenShoe,
    },
    {
      key: 'emergencyContacts',
      label: 'Telefonkontakte',
      icon: EmergencyContactsWheelIcon,
      action: onOpenEmergencyContacts,
    },
    {
      key: 'callAccess',
      label: 'Anrufzugriff',
      icon: CallAccessWheelIcon,
      action: () => setActivePanel('callAccess'),
    },
    {
      key: 'version',
      label: 'App-Version',
      icon: VersionWheelIcon,
      action: () => setActivePanel('version'),
    },
    {
      key: 'signOut',
      label: isSigningOut ? 'Abmeldung läuft' : 'Abmelden',
      icon: SignOutWheelIcon,
      action: () => setActivePanel('signOut'),
    },
  ];

  const renderWheelCenterContent = () => {
    if (activePanel === 'weight') {
      return (
        <View
          style={styles.centerInputPanel}
          {...weightCenterPanResponder.panHandlers}
        >
          <Text style={styles.centerPanelEyebrow}>GEWICHT</Text>

          <View style={styles.centerWeightControl}>
            <Pressable
              style={styles.centerWeightStepButton}
              onPress={() => adjustWeightInput(0.5)}
            >
              <Text style={styles.centerWeightStepText}>+</Text>
            </Pressable>

            <View style={styles.centerWeightInput}>
              <Text style={styles.centerWeightValue}>
                {weightInput || '75'}
              </Text>
            </View>

            <Pressable
              style={styles.centerWeightStepButton}
              onPress={() => adjustWeightInput(-0.5)}
            >
              <Text style={styles.centerWeightStepText}>−</Text>
            </Pressable>
          </View>

        </View>
      );
    }

    if (activePanel === 'account') {
      return (
        <View style={styles.centerInputPanel}>
          <Text style={styles.centerPanelEyebrow}>KONTO</Text>

          <TextInput
            value={usernameInput}
            onChangeText={handleUsernameChange}
            placeholder="Username"
            placeholderTextColor="#6f7d8c"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
            style={styles.centerUsernameInput}
          />

          <Text style={styles.centerPanelHint}>
            {isSavingUsername
              ? 'speichert...'
              : hasUsernameSaved
                ? 'gespeichert'
                : 'Tippen zum Ändern'}
          </Text>

          <Pressable
            style={styles.centerDangerButton}
            onPress={handleOpenAccountDeletion}
          >
            <Text style={styles.centerDangerButtonText}>
              Konto & Daten löschen
            </Text>
          </Pressable>
        </View>
      );
    }

    if (activePanel === 'version') {
      return (
        <View style={styles.centerInputPanel}>
          <Text style={styles.centerPanelEyebrow}>VERSION</Text>
          <Text style={styles.centerPanelValue}>1.0.0</Text>
          <Text style={styles.centerPanelHint}>bora-systems</Text>
        </View>
      );
    }

    if (activePanel === 'callAccess') {
      return (
        <View style={styles.centerInputPanel}>
          <Text style={styles.centerPanelEyebrow}>ANRUFZUGRIFF</Text>
          <Text style={styles.centerPanelValue}>
            {fullScreenIntentAccess?.granted ? 'Freigegeben' : 'Nicht freigegeben'}
          </Text>
        </View>
      );
    }

    if (activePanel === 'signOut') {
      return (
        <View style={styles.centerInputPanel}>
          <Text style={styles.centerPanelEyebrow}>ABMELDEN</Text>
          <Text style={styles.centerPanelValue}>
            {isSigningOut ? 'läuft...' : 'Sicher?'}
          </Text>

          <Pressable
            style={styles.centerDangerButton}
            onPress={handleSignOut}
            disabled={isSigningOut}
          >
            <Text style={styles.centerDangerButtonText}>
              {isSigningOut ? 'Bitte warten' : 'Bestätigen'}
            </Text>
          </Pressable>
        </View>
      );
    }

    return undefined;
  };

  const renderActivePanel = () => {
    if (activePanel === 'account') {
      return null;
    }

    if (activePanel === 'weight') {
      return null;
    }

    if (activePanel === 'version') {
      return null;
    }

    if (activePanel === 'callAccess') {
      const isGranted = fullScreenIntentAccess?.granted === true;

      return (
        <View style={styles.detailPanel}>
          <Text style={styles.detailTitle}>Anrufzugriff</Text>
          <Text style={styles.detailText}>
            {isGranted
              ? 'Freigegeben'
              : 'Nicht freigegeben'}
          </Text>
          <Text style={styles.detailText}>
            Damit LaufBuddy nach dem Sprachbefehl auch bei gesperrtem Display deinen Telefonkontakt ohne weitere Berührung anrufen kann.
          </Text>
          {fullScreenIntentAccess?.required ? (
            <Pressable
              style={styles.callAccessButton}
              onPress={() => void handleOpenFullScreenIntentSettings()}
            >
              <Text style={styles.callAccessButtonText}>
                {isGranted ? 'In Android öffnen' : 'In Android freigeben'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      );
    }

    if (activePanel === 'signOut') {
      return null;
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.badge}>LaufBuddy</Text>
        <Text style={styles.title}>Einstellungen</Text>
        <Text style={styles.subtitle}>
          Konto, Laufprofil, Gewicht, Schuhe und LaufBuddy verwalten.
        </Text>
      </View>

      <View style={styles.wheelStage}>
        <SafetyWheel
          items={settingsWheelItems}
          statusLabel="EINSTELLUNGEN"
          statusSubline="Bereich auswählen"
          statusColor="#34A6D8"
          secondaryStatusLine="Konto · Laufprofil · Schuhe · Anrufzugriff"
          bottomHint="Wischen zum Drehen"
          wheelSize={SETTINGS_WHEEL_SIZE}
          centerStatusContent={renderWheelCenterContent()}
          centerConfirmContent={renderWheelCenterContent()}
          onSelectedItemChange={handleSelectedWheelItemChange}
        />
      </View>

      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
      >
        {renderActivePanel()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3FAFD',
  },
  panelScrollContent: {
    paddingBottom: 4,
  },
  panelScroll: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    maxHeight: 180,
    zIndex: 3,
  },
  wheelStage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  header: {
    position: 'absolute',
    top: 70,
    left: 18,
    right: 18,
    alignItems: 'center',
    zIndex: 2,
  },
  contentContainer: {
    paddingHorizontal: 18,
    paddingTop: 38,
    paddingBottom: 44,
    alignItems: 'center',
  },
  badge: {
    alignSelf: 'center',
    color: '#2477A8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  title: {
    color: '#153243',
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    color: '#5B6B7A',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  wheelWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  centerInputPanel: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  centerPanelEyebrow: {
    color: '#2F7DA8',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  centerPanelValue: {
    marginTop: 8,
    color: '#17384A',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  centerPanelHint: {
    marginTop: 7,
    color: '#2F7DA8',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  centerUsernameInput: {
    marginTop: 6,
    width: '100%',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.78)',
    color: '#17384A',
    fontSize: 15,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 5,
    textAlign: 'center',
  },
  centerDangerButton: {
    marginTop: 8,
    minHeight: 30,
    borderRadius: 999,
    backgroundColor: '#5D7C8C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  centerDangerButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  centerWeightControl: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  centerWeightStepButton: {
    width: 32,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: '#34A6D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerWeightStepText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  centerWeightInput: {
    minWidth: 78,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  centerWeightValue: {
    color: '#17384A',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  detailPanel: {
    width: '94%',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.66)',
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginTop: 0,
    marginBottom: 8,
    borderColor: 'rgba(36, 119, 168, 0.10)',
    borderWidth: 1,
  },
  detailTitle: {
    color: '#12384D',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  detailText: {
    color: '#5B6B7A',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  callAccessButton: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2477A8',
    borderRadius: 999,
    marginTop: 12,
    minHeight: 40,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  callAccessButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  infoLabel: {
    color: '#2477A8',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 4,
  },
  infoLabelSpacing: {
    marginTop: 14,
  },
  infoValue: {
    color: '#12384D',
    fontSize: 16,
    fontWeight: '800',
  },
  inputWrapper: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(36, 119, 168, 0.22)',
    backgroundColor: '#F8FBFD',
    paddingLeft: 14,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    color: '#12384D',
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 14,
  },
  checkmark: {
    color: '#2477A8',
    fontSize: 20,
    fontWeight: '900',
    marginLeft: 10,
  },
  infoHint: {
    color: '#5B6B7A',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    lineHeight: 18,
  },
  smallSaveButton: {
    backgroundColor: '#34A6D8',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginTop: 12,
  },
  smallSaveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
