// src/app_core/screens/HomeScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  History,
  Play,
  Settings as SettingsIcon,
  Users,
} from "lucide-react-native";
import { SafetyWheel, SafetyWheelItem } from "../components/SafetyWheel";
import { buddyWebRTCManager } from "../audio/WebRTCManager";
import { useHeadphoneStore } from "../../state/headphoneStore";
import { HeadphoneStatus } from "../../state/headphoneStatus";
import { useEmergencyContactsStore } from "../../state/emergencyContactsStore";
import { createEmergencyReadinessState } from "../utils/emergencyReadiness";
import { startHeartRateSensor } from "../../core/heartRateSensorController";
import { HeartRateSensorStatus } from "../../state/heartRateSensorStatus";
import { useHeartRateSensorStore } from "../../state/heartRateSensorStore";
import { useOnboardingNoticeStore } from "../../state/onboardingNoticeStore";
import { useHotwordStore } from '../../state/hotwordStore';
import { useFullScreenIntentAccessStatus } from '../hooks/useFullScreenIntentAccessStatus';

const { width, height } = Dimensions.get("window");

type HomeScreenProps = {
  onOpenRun: () => void;
  onOpenBuddy: () => void;
  onOpenRunHistory: () => void;
  onOpenSettings: () => void;
};

export default function HomeScreen({
  onOpenRun,
  onOpenBuddy,
  onOpenRunHistory,
  onOpenSettings,
}: HomeScreenProps) {
  const headphoneStatus = useHeadphoneStore((state) => state.status);
  const isHeadsetConnected = headphoneStatus === HeadphoneStatus.Connected;
  const hotwordStatus = useHotwordStore((state) => state.status);
  const hotwordInactiveReason = useHotwordStore((state) => state.inactiveReason);
  const fullScreenIntentAccess = useFullScreenIntentAccessStatus();

  const selectedEmergencyContacts = useEmergencyContactsStore(
    (state) => state.selectedContacts,
  );
  const hydrateSelectedEmergencyContacts = useEmergencyContactsStore(
    (state) => state.hydrateSelectedContacts,
  );

  useEffect(() => {
    void hydrateSelectedEmergencyContacts();
  }, [hydrateSelectedEmergencyContacts]);

  const isOnboardingNoticeVisible = useOnboardingNoticeStore(
    (state) => state.isOverlayVisibleThisSession,
  );
  const loadOnboardingNoticeStatus = useOnboardingNoticeStore(
    (state) => state.loadOnboardingNoticeStatus,
  );
  const dismissOnboardingNoticeForThisSession = useOnboardingNoticeStore(
    (state) => state.dismissForThisSession,
  );
  const dismissOnboardingNoticePermanently = useOnboardingNoticeStore(
    (state) => state.dismissPermanently,
  );

  const heartRateSensorStatus = useHeartRateSensorStore((state) => state.status);
  const currentHeartRateBpm = useHeartRateSensorStore(
    (state) => state.currentHeartRateBpm,
  );

  const onboardingNoticeDrag = useRef(
    new Animated.ValueXY({ x: 0, y: 0 }),
  ).current;

  const emergencyReadiness = createEmergencyReadinessState(
    headphoneStatus,
    selectedEmergencyContacts,
    hotwordStatus,
    hotwordInactiveReason,
    fullScreenIntentAccess ?? undefined,
  );

  const protectionLabel = emergencyReadiness.label;
  const protectionSubline = emergencyReadiness.subline;
  const protectionColor =
    emergencyReadiness.tone === "ready"
      ? "#2477A8"
      : "#5B6B7A";

  const heartRateLabel =
    currentHeartRateBpm !== null
      ? `${currentHeartRateBpm} BPM`
      : heartRateSensorStatus === HeartRateSensorStatus.Scanning
        ? "♥-Schlag wird gesucht"
        : heartRateSensorStatus === HeartRateSensorStatus.Connecting
          ? "♥-Sensor verbindet"
          : heartRateSensorStatus === HeartRateSensorStatus.Connected
            ? "♥-Schlag erkannt"
            : "♥-Schlag nicht erkannt";

  const handleRunPress = useCallback(() => {
    void startHeartRateSensor().catch(() => undefined);
    onOpenRun();
  }, [onOpenRun]);

  const handleBuddyPress = useCallback(async () => {
    const stream = await buddyWebRTCManager.startLocalAudio();

    if (stream) {
      onOpenBuddy();
      return;
    }

    Alert.alert("Fehler", "Ohne Mikrofon ist kein Buddy-Lauf möglich.");
  }, [onOpenBuddy]);

  const wheelItems: SafetyWheelItem[] = useMemo(
    () => [
      {
        key: "run",
        label: "Laufen",
        icon: Play,
        action: handleRunPress,
      },
      {
        key: "buddy",
        label: "Buddy",
        icon: Users,
        action: handleBuddyPress,
      },
      {
        key: "runHistory",
        label: "Verlauf",
        icon: History,
        action: onOpenRunHistory,
      },
      {
        key: "settings",
        label: "Einstellungen",
        icon: SettingsIcon,
        action: onOpenSettings,
      },
    ],
    [handleBuddyPress, handleRunPress, onOpenRunHistory, onOpenSettings],
  );

  useEffect(() => {
    void loadOnboardingNoticeStatus();
  }, [loadOnboardingNoticeStatus]);

  const closeOnboardingNoticeForThisSession = useCallback(() => {
    onboardingNoticeDrag.setValue({ x: 0, y: 0 });
    dismissOnboardingNoticeForThisSession();
  }, [dismissOnboardingNoticeForThisSession, onboardingNoticeDrag]);

  const closeOnboardingNoticePermanently = useCallback(() => {
    onboardingNoticeDrag.setValue({ x: 0, y: 0 });
    void dismissOnboardingNoticePermanently();
  }, [dismissOnboardingNoticePermanently, onboardingNoticeDrag]);

  const onboardingNoticePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 12 || Math.abs(gestureState.dy) > 12,
        onPanResponderMove: (_, gestureState) => {
          onboardingNoticeDrag.setValue({
            x: gestureState.dx,
            y: gestureState.dy,
          });
        },
        onPanResponderRelease: (_, gestureState) => {
          const distance = Math.hypot(gestureState.dx, gestureState.dy);

          if (distance < 80) {
            Animated.spring(onboardingNoticeDrag, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: true,
            }).start();
            return;
          }

          const targetX =
            Math.abs(gestureState.dx) > 20
              ? Math.sign(gestureState.dx) * width
              : 0;
          const targetY =
            Math.abs(gestureState.dy) > 20
              ? Math.sign(gestureState.dy) * height
              : 0;

          Animated.timing(onboardingNoticeDrag, {
            toValue: { x: targetX, y: targetY },
            duration: 180,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }).start(() => {
            closeOnboardingNoticeForThisSession();
          });
        },
      }),
    [closeOnboardingNoticeForThisSession, onboardingNoticeDrag],
  );

  return (
    <View style={styles.container}>
      <View style={styles.backgroundGlowOne} />
      <View style={styles.backgroundGlowTwo} />
      <View style={styles.backgroundLineOne} />
      <View style={styles.backgroundLineTwo} />

      <View style={styles.header}>
        <Text style={styles.appTitle}>LaufBuddy</Text>
        <Text style={styles.appSubtitle}>Nie wieder alleine laufen.</Text>
      </View>

      {isOnboardingNoticeVisible ? (
        <Animated.View
          style={[
            styles.onboardingNoticeCard,
            {
              transform: [
                { translateX: onboardingNoticeDrag.x },
                { translateY: onboardingNoticeDrag.y },
              ],
            },
          ]}
          {...onboardingNoticePanResponder.panHandlers}
        >
          <Text style={styles.onboardingNoticeTitle}>
            Dein erster Lauf mit LaufBuddy
          </Text>
          <Text style={styles.onboardingNoticeText}>
            Verbinde ein Headset und speichere später deinen Telefonkontakt. Der
            Hinweis bleibt, bis du ihn bewusst ausblendest.
          </Text>

          <View style={styles.onboardingNoticeActions}>
            <Pressable
              onPress={closeOnboardingNoticeForThisSession}
              style={styles.onboardingNoticePrimaryButton}
            >
              <Text style={styles.onboardingNoticePrimaryText}>Verstanden</Text>
            </Pressable>

            <Pressable
              onPress={closeOnboardingNoticePermanently}
              style={styles.onboardingNoticeGhostButton}
            >
              <Text style={styles.onboardingNoticeGhostText}>
                Nicht mehr anzeigen
              </Text>
            </Pressable>
          </View>

          <Text style={styles.onboardingNoticeHint}>
            Wischen schließt nur für diese Sitzung.
          </Text>
        </Animated.View>
      ) : null}

      <SafetyWheel
        items={wheelItems}
        statusLabel={protectionLabel}
        statusSubline={protectionSubline}
        statusColor={protectionColor}
        secondaryStatusLine={heartRateLabel}
        centerPressMode="direct"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3FAFD",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  backgroundGlowOne: {
    position: "absolute",
    width: width * 1.15,
    height: width * 1.15,
    borderRadius: width,
    backgroundColor: "rgba(75, 195, 240, 0.14)",
    top: 120,
    left: -width * 0.18,
  },
  backgroundGlowTwo: {
    position: "absolute",
    width: width * 0.78,
    height: width * 0.78,
    borderRadius: width,
    backgroundColor: "rgba(31, 155, 104, 0.08)",
    bottom: -width * 0.22,
    right: -width * 0.22,
  },
  backgroundLineOne: {
    position: "absolute",
    top: 190,
    left: -60,
    width: width + 120,
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(75, 195, 240, 0.12)",
    transform: [{ rotate: "-16deg" }],
  },
  backgroundLineTwo: {
    position: "absolute",
    bottom: 180,
    left: -80,
    width: width + 160,
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(75, 195, 240, 0.10)",
    transform: [{ rotate: "-16deg" }],
  },
  header: {
    position: "absolute",
    top: 70,
    left: 24,
    right: 24,
    alignItems: "center",
  },
  appTitle: {
    fontSize: 36,
    fontWeight: "800",
    color: "#17384A",
    letterSpacing: 0.6,
  },
  appSubtitle: {
    marginTop: 6,
    fontSize: 15,
    color: "#5D7C8C",
    fontWeight: "600",
  },
  onboardingNoticeCard: {
    position: "absolute",
    top: 132,
    left: 24,
    right: 24,
    borderRadius: 30,
    backgroundColor: "rgba(255, 255, 255, 0.84)",
    borderWidth: 1,
    borderColor: "rgba(52, 166, 216, 0.22)",
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: "#267FA8",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 24,
    zIndex: 40,
  },
  onboardingNoticeTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
    color: "#17384A",
    textAlign: "center",
  },
  onboardingNoticeText: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: "#5D7C8C",
    textAlign: "center",
  },
  onboardingNoticeActions: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  onboardingNoticePrimaryButton: {
    minHeight: 42,
    borderRadius: 999,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#34A6D8",
  },
  onboardingNoticePrimaryText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  onboardingNoticeGhostButton: {
    minHeight: 42,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  onboardingNoticeGhostText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#5D7C8C",
  },
  onboardingNoticeHint: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: "#7D98A6",
    textAlign: "center",
  },
});
