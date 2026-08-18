// src/app_core/screens/BuddyScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Play, Share2, Unlink, Users } from 'lucide-react-native';
import { buddyWebRTCManager } from '../audio/WebRTCManager';
import { createBuddyInteractionController } from '../../services/buddyInteractionController';
import { createBuddyInvitationLink } from '../../services/buddyInvitationLink';
import {
  STANDARD_WHEEL_SIZE,
  SafetyWheel,
  SafetyWheelItem,
} from '../components/SafetyWheel';
import { useBuddyStatus } from '../state/useBuddyStatus';
import { useRunStatus } from '../state/useRunStatus';
import { useSavedBuddies } from '../state/useSavedBuddies';

const { width } = Dimensions.get('window');

const BUDDY_WHEEL_SIZE = STANDARD_WHEEL_SIZE;

type BuddyScreenProps = {
  onBack: () => void;
  onOpenRun: () => void;
  initialInvitationToken?: string | null;
  onInitialInvitationHandled?: () => void;
};

type BuddyWheelPanel = 'invite' | 'list';

function getSavedBuddyDisplayName(params: {
  username: string | null;
  displayName: string | null;
  email: string | null;
  buddyCode: string | null;
}): string {
  return (
    params.username ||
    params.displayName ||
    params.email ||
    params.buddyCode ||
    'Gespeicherter Buddy'
  );
}

export default function BuddyScreen({
  onBack,
  onOpenRun,
  initialInvitationToken = null,
  onInitialInvitationHandled,
}: BuddyScreenProps) {
  const {
    buddyConnected,
    buddyName,
    connectionStatus,
    isConnecting,
    roomId,
    role,
    connectedBuddyUid,
    initBuddySession,
    createInvitation,
  } = useBuddyStatus();

  const buddies = useSavedBuddies((state) => state.buddies);
  const isSavedBuddiesLoading = useSavedBuddies((state) => state.isLoading);
  const savedBuddiesErrorMessage = useSavedBuddies((state) => state.errorMessage);
  const loadSavedBuddies = useSavedBuddies((state) => state.loadSavedBuddies);
  const removeBuddy = useSavedBuddies((state) => state.removeBuddy);

  const prepareRun = useRunStatus((state) => state.prepareRun);
  const [activeBuddyPanel, setActiveBuddyPanel] =
    useState<BuddyWheelPanel>('invite');
  const outgoingAudioPreparedRef = useRef(false);
  const preserveAudioOnUnmountRef = useRef(false);
  const handledInitialInvitationRef = useRef<string | null>(null);
  const buddyInteractionControllerRef = useRef<ReturnType<
    typeof createBuddyInteractionController
  > | null>(null);

  useEffect(() => {
    initBuddySession();
  }, [initBuddySession]);

  useEffect(() => {
    loadSavedBuddies().catch((error: unknown) => {
      console.log('[BuddyScreen] Buddy-Liste konnte nicht geladen werden:', error);
    });
  }, [loadSavedBuddies]);

  useEffect(() => {
    return () => {
      if (!preserveAudioOnUnmountRef.current) {
        void buddyWebRTCManager.cleanup();
      }
      outgoingAudioPreparedRef.current = false;
    };
  }, []);

  const startCallerAudio = async (): Promise<boolean> => {
    if (!roomId || outgoingAudioPreparedRef.current) {
      return true;
    }

    await buddyWebRTCManager.cleanup();

    const stream = await buddyWebRTCManager.startLocalAudio();

    if (!stream) {
      Alert.alert('Fehler', 'Ohne Mikrofon ist kein Buddy-Lauf möglich.');
      return false;
    }

    try {
      const activeRoomId = await buddyWebRTCManager.createCall(roomId);

      if (!activeRoomId) {
        await buddyWebRTCManager.cleanup();
        return false;
      }

      outgoingAudioPreparedRef.current = true;
      return true;
    } catch {
      await buddyWebRTCManager.cleanup();
      Alert.alert('Fehler', 'Buddy-Verbindung konnte nicht vorbereitet werden.');
      return false;
    }
  };

  if (buddyInteractionControllerRef.current === null) {
    buddyInteractionControllerRef.current = createBuddyInteractionController({
      acceptInvitation: async (token) => {
        const accepted = await useBuddyStatus.getState().connectToBuddy(token);
        if (!accepted) {
          throw new Error(useBuddyStatus.getState().connectionStatus);
        }
      },
      startConnection: async (buddyUid) => {
        const connected = await useBuddyStatus.getState().connectToSavedBuddy(buddyUid);
        if (!connected) {
          throw new Error(useBuddyStatus.getState().connectionStatus);
        }
      },
      endConnection: async () => {
        await useBuddyStatus.getState().disconnectBuddy();
        await buddyWebRTCManager.cleanup();
        outgoingAudioPreparedRef.current = false;
        setActiveBuddyPanel('invite');
        await useBuddyStatus.getState().initBuddySession();
      },
    });
  }

  const buddyInteractionController = buddyInteractionControllerRef.current;

  const handleShareTextNative = async () => {
    let token: string;
    try {
      token = await createInvitation();
    } catch (error) {
      Alert.alert('Einladung fehlgeschlagen', error instanceof Error ? error.message : 'Die LaufBuddy-Einladung konnte nicht erstellt werden.');
      return;
    }

    const deepLink = createBuddyInvitationLink(token);

    try {
      await Share.share({
        message: `Lass uns zusammen laufen!\n\nÖffne diese einmalige LaufBuddy-Einladung:\n${deepLink}\n\nDie Einladung ist 24 Stunden gültig und kann nur einmal angenommen werden.`,
      });
    } catch (error) {
      console.log('Teilen Fehler:', error);
    }
  };

  const handleAcceptIncomingInvitation = async () => {
    try {
      const accepted = await buddyInteractionController.acceptInvitation();
      if (!accepted) return;
    } catch {
      const failure = useBuddyStatus.getState().connectionStatus;
      Alert.alert(
        'Einladung nicht angenommen',
        failure.includes('abgelaufen') ? 'Diese Einladung ist abgelaufen.' : failure.includes('bereits verwendet') ? 'Diese Einladung wurde bereits verwendet.' : failure.includes('Eigene') ? 'Du kannst deine eigene Einladung nicht annehmen.' : failure.includes('Token') ? 'Dieser Einladungslink ist ungültig.' : 'Die Einladung konnte wegen eines Netzwerkfehlers nicht angenommen werden.',
      );
      onInitialInvitationHandled?.();
      return;
    }

    setActiveBuddyPanel('invite');
    onInitialInvitationHandled?.();
    void loadSavedBuddies().catch(() => undefined);
    Alert.alert('LaufBuddy-Einladung', 'Ihr seid jetzt LaufBuddys.');
  };

  useEffect(() => {
    if (!initialInvitationToken) {
      handledInitialInvitationRef.current = null;
      return;
    }

    if (handledInitialInvitationRef.current === initialInvitationToken) {
      return;
    }

    handledInitialInvitationRef.current = initialInvitationToken;
    buddyInteractionController.receiveLink(initialInvitationToken);
    Alert.alert(
      'LaufBuddy-Einladung',
      'Du hast eine LaufBuddy-Einladung erhalten. Möchtest du dich verbinden?',
      [
        { text: 'Abbrechen', style: 'cancel', onPress: () => { buddyInteractionController.cancelInvitation(); onInitialInvitationHandled?.(); } },
        { text: 'Einladung annehmen', onPress: () => void handleAcceptIncomingInvitation() },
      ],
    );
  }, [buddyInteractionController, initialInvitationToken, onInitialInvitationHandled]);

  useEffect(() => {
    if (role !== 'caller' || !roomId || outgoingAudioPreparedRef.current) return;
    void startCallerAudio();
  }, [role, roomId]);

  const handleConnectSavedBuddy = (buddyUid: string) => {
    const buddy = buddies.find((entry) => entry.buddyUid === buddyUid);
    const name = buddy ? getSavedBuddyDisplayName(buddy) : 'diesem LaufBuddy';
    buddyInteractionController.selectBuddy(buddyUid);
    Alert.alert(`Mit ${name} verbinden?`, 'Die Audioverbindung startet erst nach dem Bestätigen.', [
      { text: 'Abbrechen', style: 'cancel', onPress: () => buddyInteractionController.cancelConnection() },
      { text: 'Verbinden', onPress: () => void buddyInteractionController.confirmConnection().catch(() => {
        Alert.alert('Nicht verbunden', 'Die Buddy-Verbindung konnte nicht hergestellt werden.');
      }) },
    ]);
  };

  const handleRemoveBuddy = (buddyUid: string) => {
    const buddy = buddies.find((entry) => entry.buddyUid === buddyUid);
    const name = buddy ? getSavedBuddyDisplayName(buddy) : 'diesen LaufBuddy';
    Alert.alert('LaufBuddy entfernen', `Möchtest du ${name} wirklich als LaufBuddy entfernen? Ihr könnt euch später erneut einladen.`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'LaufBuddy entfernen', style: 'destructive', onPress: () => void (async () => {
        if (connectedBuddyUid === buddyUid) await handleDisconnectBuddy();
        try { await removeBuddy(buddyUid); } catch { Alert.alert('Nicht entfernt', 'Die LaufBuddy-Verknüpfung konnte nicht entfernt werden.'); }
      })() },
    ]);
  };

  const handleDisconnectBuddy = async () => {
    await buddyInteractionController.endConnection();
  };

  const handlePrepareSharedRun = () => {
    preserveAudioOnUnmountRef.current = true;
    prepareRun('Gemeinsamer Lauf', 'BuddyScreen');
    onOpenRun();
  };

  const handleBack = async () => {
    if (!buddyConnected) {
      await buddyInteractionController.endConnection();
    }

    await buddyWebRTCManager.cleanup();
    outgoingAudioPreparedRef.current = false;
    onBack();
  };

  const wheelStatusLabel = buddyConnected
    ? 'BUDDY BEREIT'
    : isConnecting
      ? 'VERBINDE'
      : 'BUDDY';

  const wheelStatusSubline = buddyConnected
    ? `${buddyName} verbunden`
    : activeBuddyPanel === 'list' ? 'Meine LaufBuddys' : 'Einladung senden';

  const wheelSecondaryLine = buddyConnected
    ? 'Countdown startet im Lauf-Screen'
    : activeBuddyPanel === 'list' ? 'Buddy auswählen' : 'Link an deinen Buddy senden';


  const savedBuddyInfoText = isSavedBuddiesLoading
    ? 'Buddy-Liste wird geladen.'
    : buddies.length === 0
      ? 'Noch keine Buddies gespeichert.'
      : `${buddies.length} gespeicherte ${
          buddies.length === 1 ? 'Person' : 'Personen'
        }.`;

  function renderBuddyWheelCenterContent() {
    if (buddyConnected) {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>BUDDY BEREIT</Text>
          <Text style={styles.centerValue} numberOfLines={1}>
            {buddyName}
          </Text>
          <Text style={styles.centerText}>
            Verbunden. Der Lauf startet erst nach dem Countdown.
          </Text>

          <Pressable
            style={styles.centerActionButton}
            onPress={handlePrepareSharedRun}
          >
            <Text style={styles.centerActionButtonText}>
              Lauf mit Buddy starten
            </Text>
          </Pressable>

        </View>
      );
    }

    if (activeBuddyPanel === 'list') {
      return <View style={styles.centerPanel}><Text style={styles.centerEyebrow}>LAUFBUDDYS</Text><Text style={styles.centerValue}>Auswählen</Text><Text style={styles.centerText}>Wähle unten einen LaufBuddy.</Text></View>;
    }

    return (
      <View style={styles.centerPanel}>
        <Text style={styles.centerEyebrow}>EINLADUNG</Text>
        <Text style={styles.centerValue} numberOfLines={1}>
          Einladen
        </Text>
        <Text style={styles.centerText}>
          Link an deinen Buddy senden.
        </Text>

        {isConnecting ? <ActivityIndicator size="small" color="#34A6D8" /> : <Text style={[styles.centerSmallText, styles.tapHintPill]}>Mitte tippen</Text>}
      </View>
    );
  }


  function handleSelectedBuddyWheelItemChange(itemKey: string) {
    if (buddyConnected) {
      return;
    }

    if (itemKey === 'invite' || itemKey === 'list') {
      setActiveBuddyPanel(itemKey);
    }
  }


  const buddyWheelItems: SafetyWheelItem[] = buddyConnected
    ? [
        {
          key: 'start',
          label: 'Buddy-Lauf',
          icon: Play,
          action: handlePrepareSharedRun,
        },
        {
          key: 'disconnect',
          label: 'Verbindung beenden',
          icon: Unlink,
          action: () => {
            void handleDisconnectBuddy();
          },
        },
      ]
    : [
        {
          key: 'invite',
          label: 'Einladen',
          icon: Share2,
          action: () => {
            void handleShareTextNative();
          },
        },
        {
          key: 'list',
          label: 'Meine LaufBuddys',
          icon: Users,
          action: () => {
            setActiveBuddyPanel('list');
          },
        },
      ];


  return (
    <View style={styles.container}>
      <View style={styles.backgroundGlowOne} />
      <View style={styles.backgroundGlowTwo} />
      <View style={styles.backgroundLineOne} />
      <View style={styles.backgroundLineTwo} />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>LaufBuddy</Text>
        <Text style={styles.title}>Buddy</Text>
        <Text style={styles.subtitle}>
          Nie wieder allein laufen.
        </Text>
      </View>

      <View style={styles.wheelWrapper}>
        <SafetyWheel
          items={buddyWheelItems}
          statusLabel={wheelStatusLabel}
          statusSubline={wheelStatusSubline}
          statusColor="#34A6D8"
          secondaryStatusLine={wheelSecondaryLine}
          wheelSize={BUDDY_WHEEL_SIZE}
          centerStatusContent={renderBuddyWheelCenterContent()}
          centerConfirmContent={renderBuddyWheelCenterContent()}
          centerPressEnabled={!isConnecting}
          centerPressMode="direct"
          onSelectedItemChange={handleSelectedBuddyWheelItemChange}
        />
      </View>

      <View style={styles.bottomPanel}>
        <Text style={styles.savedBuddyInfo}>{savedBuddyInfoText}</Text>

        {buddies.length === 0 && !isSavedBuddiesLoading ? (
          <Text style={styles.emptyBuddyText}>Noch keine LaufBuddys verbunden.</Text>
        ) : (
          <FlatList
            data={buddies}
            keyExtractor={(buddy) => buddy.buddyUid}
            style={styles.buddyList}
            renderItem={({ item }) => (
              <View style={styles.buddyListRow}>
                <Pressable style={styles.buddySelectButton} onPress={() => handleConnectSavedBuddy(item.buddyUid)}>
                  <Text style={styles.buddyListName} numberOfLines={1}>{getSavedBuddyDisplayName(item)}</Text>
                  <Text style={styles.buddyListLabel}>LaufBuddy</Text>
                </Pressable>
                <Pressable style={styles.buddyMenuButton} onPress={() => handleRemoveBuddy(item.buddyUid)}>
                  <Text style={styles.buddyMenuText}>⋯</Text>
                </Pressable>
              </View>
            )}
          />
        )}

        {savedBuddiesErrorMessage !== null && (
          <Text style={styles.errorText}>{savedBuddiesErrorMessage}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3FAFD',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'visible',
  },
  backgroundGlowOne: {
    position: 'absolute',
    width: width * 1.15,
    height: width * 1.15,
    borderRadius: width,
    backgroundColor: 'rgba(75, 195, 240, 0.14)',
    top: 120,
    left: -width * 0.18,
  },
  backgroundGlowTwo: {
    position: 'absolute',
    width: width * 0.78,
    height: width * 0.78,
    borderRadius: width,
    backgroundColor: 'rgba(31, 155, 104, 0.08)',
    bottom: -width * 0.22,
    right: -width * 0.22,
  },
  backgroundLineOne: {
    position: 'absolute',
    top: 190,
    left: -60,
    width: width + 120,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(75, 195, 240, 0.12)',
    transform: [{ rotate: '-16deg' }],
  },
  backgroundLineTwo: {
    position: 'absolute',
    bottom: 180,
    left: -80,
    width: width + 160,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(75, 195, 240, 0.10)',
    transform: [{ rotate: '-16deg' }],
  },
  header: {
    position: 'absolute',
    top: 70,
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 2,
  },
  title: {
    marginTop: 4,
    fontSize: 34,
    fontWeight: '900',
    color: '#153243',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: '#5B6B7A',
    fontWeight: '700',
    textAlign: 'center',
  },
  wheelWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    zIndex: 1,
  },
  centerPanel: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 220,
  },
  centerEyebrow: {
    color: '#5E7284',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 8,
    textAlign: 'center',
  },
  centerValue: {
    color: '#143047',
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  centerText: {
    color: '#3F5668',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 12,
  },
  centerSmallText: {
    color: '#5E7284',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  centerActionButton: {
    backgroundColor: '#34A6D8',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    minWidth: 178,
    marginTop: 4,
  },
  centerActionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  tapHintPill: {
    borderWidth: 1,
    borderColor: '#CFE7F4',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    overflow: 'hidden',
    fontWeight: '800',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  bottomPanel: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    borderWidth: 1,
    borderColor: '#CFE7F4',
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderRadius: 26,
    padding: 16,
    zIndex: 2,
  },
  savedBuddyInfo: {
    color: '#5E7284',
    fontSize: 13,
    textAlign: 'center',
  },
  emptyBuddyText: { color: '#5E7284', fontSize: 14, textAlign: 'center', marginTop: 12 },
  buddyList: { maxHeight: 144, marginTop: 10 },
  buddyListRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E1EFF5', minHeight: 54 },
  buddySelectButton: { flex: 1, paddingVertical: 8 },
  buddyListName: { color: '#143047', fontSize: 15, fontWeight: '800' },
  buddyListLabel: { color: '#5E7284', fontSize: 12, marginTop: 2 },
  buddyMenuButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  buddyMenuText: { color: '#143047', fontSize: 26, fontWeight: '800', lineHeight: 30 },
  errorText: {
    color: '#C04747',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  eyebrow: {
    color: '#2477A8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    textAlign: 'center',
  },
});
