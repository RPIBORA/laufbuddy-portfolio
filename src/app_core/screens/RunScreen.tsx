// src/app_core/screens/RunScreen.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import {
  AppState,
  BackHandler,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import { Pause, Play } from 'lucide-react-native';
import { useRunStatus } from '../state/useRunStatus';
import { useShoeStatus } from '../state/useShoeStatus';
import { useRunHistory } from '../state/useRunHistory';
import type {
  RunPauseEntry,
  RunRoutePointSnapshot,
  ShoeIssueArea,
  ShoeIssueCategory,
  ShoeIssueType,
  ShoeRunFeeling,
} from '../models/ShoeModels';
import { startHeartRateSensor, stopHeartRateSensor } from '../../core/heartRateSensorController';
import { createRunTrackingStopPreparation } from '../../core/installRunTrackingBridge';
import { waitForRunStopPreparation } from '../../core/runs/runStopPreparation';
import { setNativeHotwordEnabledForCurrentRun } from '../../services/laufBuddyHotwordControlService';
import { syncTemporaryLiveBuddyContactToNative } from '../../services/nativeEmergencyContactSyncService';
import {
  activateLiveSessionForStartedRun,
  endLiveSessionSync,
  shareLiveSession,
} from '../../services/live/liveSessionService';
import { isLiveShareAllowed } from '../../services/live/liveSessionLogic';
import {
  getDeviceContactsPermissionState,
  loadDeviceEmergencyContactCandidates,
  requestDeviceContactsPermission,
  type DeviceEmergencyContactCandidate,
} from '../../services/deviceContactsService';
import {
  clearTemporaryLiveBuddyContact,
  setTemporaryLiveBuddyContact,
} from '../../services/live/liveBuddyContactService';
import {
  STANDARD_WHEEL_SIZE,
  SafetyWheel,
  SafetyWheelItem,
} from '../components/SafetyWheel';

type MiniRoutePoint = {
  x: number;
  y: number;
};

const MINI_ROUTE_WIDTH = 154;
const MINI_ROUTE_HEIGHT = 86;
const MINI_ROUTE_PADDING = 12;
const MINI_ROUTE_POINT_SIZE = 5;
const MINI_ROUTE_START_END_SIZE = 9;
const MINI_ROUTE_PAUSE_SIZE = 13;
const MINI_ROUTE_LINE_THICKNESS = 3;

function createMiniRoutePointFromGeo(
  latitude: number,
  longitude: number,
  routePoints: RunRoutePointSnapshot[],
): MiniRoutePoint {
  const latitudes = routePoints.map((point) => point.latitude);
  const longitudes = routePoints.map((point) => point.longitude);

  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  const latitudeRange = maxLatitude - minLatitude || 0.000001;
  const longitudeRange = maxLongitude - minLongitude || 0.000001;

  const drawableWidth = MINI_ROUTE_WIDTH - MINI_ROUTE_PADDING * 2;
  const drawableHeight = MINI_ROUTE_HEIGHT - MINI_ROUTE_PADDING * 2;

  const normalizedX = (longitude - minLongitude) / longitudeRange;
  const normalizedY = (latitude - minLatitude) / latitudeRange;

  return {
    x: MINI_ROUTE_PADDING + normalizedX * drawableWidth,
    y: MINI_ROUTE_PADDING + (1 - normalizedY) * drawableHeight,
  };
}

function calculateMiniRouteSegmentStyle(from: MiniRoutePoint, to: MiniRoutePoint) {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

  return {
    width: length,
    left: from.x,
    top: from.y - MINI_ROUTE_LINE_THICKNESS / 2,
    transform: [{ rotate: `${angle}deg` }],
  };
}

function MiniRoutePreview({
  routePoints = [],
  pauses = [],
}: {
  routePoints?: RunRoutePointSnapshot[];
  pauses?: RunPauseEntry[];
}) {
  if (routePoints.length < 2) {
    return (
      <View style={styles.miniRouteFallback}>
        <Text style={styles.miniRouteFallbackText}>Route gespeichert</Text>
      </View>
    );
  }

  const previewPoints = routePoints.map((point) =>
    createMiniRoutePointFromGeo(point.latitude, point.longitude, routePoints),
  );
  const startPoint = previewPoints[0];
  const endPoint = previewPoints[previewPoints.length - 1];

  const pausePreviewPoints = pauses
    .filter((pause) => pause.location !== null)
    .map((pause, index) => ({
      ...createMiniRoutePointFromGeo(
        pause.location!.latitude,
        pause.location!.longitude,
        routePoints,
      ),
      id: pause.id,
      index: index + 1,
    }));

  return (
    <View style={styles.miniRouteCanvas}>
      {previewPoints.slice(1).map((point, index) => (
        <View
          key={`mini-segment-${routePoints[index + 1].timestamp}-${index}`}
          style={[
            styles.miniRouteSegment,
            calculateMiniRouteSegmentStyle(previewPoints[index], point),
          ]}
        />
      ))}

      {previewPoints.map((point, index) => (
        <View
          key={`mini-point-${routePoints[index].timestamp}-${index}`}
          style={[
            styles.miniRoutePoint,
            {
              left: point.x - MINI_ROUTE_POINT_SIZE / 2,
              top: point.y - MINI_ROUTE_POINT_SIZE / 2,
            },
          ]}
        />
      ))}

      {pausePreviewPoints.map((point) => (
        <View
          key={`mini-pause-${point.id}`}
          style={[
            styles.miniRoutePausePoint,
            {
              left: point.x - MINI_ROUTE_PAUSE_SIZE / 2,
              top: point.y - MINI_ROUTE_PAUSE_SIZE / 2,
            },
          ]}
        >
          <Text style={styles.miniRoutePauseText}>{point.index}</Text>
        </View>
      ))}

      <View
        style={[
          styles.miniRouteStartEndPoint,
          {
            left: startPoint.x - MINI_ROUTE_START_END_SIZE / 2,
            top: startPoint.y - MINI_ROUTE_START_END_SIZE / 2,
          },
        ]}
      />
      <View
        style={[
          styles.miniRouteStartEndPoint,
          {
            left: endPoint.x - MINI_ROUTE_START_END_SIZE / 2,
            top: endPoint.y - MINI_ROUTE_START_END_SIZE / 2,
          },
        ]}
      />
    </View>
  );
}

type RunScreenProps = {
  onBack: () => void;
  onOpenRunDetail: (runId: string) => void;
};

export type RunScreenHandle = {
  requestBack: () => void;
};

const RUN_WHEEL_SIZE = STANDARD_WHEEL_SIZE;
const START_COUNTDOWN_SECONDS = 5;
const MAX_START_COUNTDOWN_SECONDS = 30;
const DOUBLE_TAP_WINDOW_MS = 420;

function LiveBuddyContactWheelIcon({ size = 32 }: { size?: number }) {
  return <Text style={{ fontSize: Math.round(size * 0.72) }}>1️⃣</Text>;
}

function LiveBuddyDoneWheelIcon({ size = 32 }: { size?: number }) {
  return <Text style={{ fontSize: Math.round(size * 0.72) }}>↩️</Text>;
}

type FeedbackOption<T extends string> = {
  value: T;
  label: string;
};

const SHOE_FEELING_OPTIONS: FeedbackOption<Exclude<ShoeRunFeeling, 'unknown'>>[] = [
  { value: 'good', label: 'Gut' },
  { value: 'okay', label: 'Okay' },
  { value: 'bad', label: 'Schlecht' },
];

const SHOE_OKAY_CATEGORY_OPTIONS: FeedbackOption<Exclude<ShoeIssueCategory, 'none'>>[] = [
  { value: 'fit', label: 'Sitz' },
  { value: 'cushioning', label: 'Dämpfung' },
  { value: 'stability', label: 'Stabilität' },
  { value: 'pressure_rubbing', label: 'Druck/Reibung' },
  { value: 'other', label: 'Sonstiges' },
];

const SHOE_BAD_ISSUE_OPTIONS: FeedbackOption<Exclude<ShoeIssueType, 'none'>>[] = [
  { value: 'too_tight', label: 'Zu eng' },
  { value: 'too_loose', label: 'Zu locker' },
  { value: 'pressure', label: 'Gedrückt' },
  { value: 'rubbing', label: 'Gerieben' },
  { value: 'unstable', label: 'Instabil' },
  { value: 'too_hard', label: 'Zu hart' },
  { value: 'too_soft', label: 'Zu weich' },
  { value: 'other', label: 'Sonstiges' },
];

const SHOE_AREA_OPTIONS: FeedbackOption<Exclude<ShoeIssueArea, 'none'>>[] = [
  { value: 'heel', label: 'Ferse' },
  { value: 'toes', label: 'Zehen' },
  { value: 'ball', label: 'Ballen' },
  { value: 'arch', label: 'Fußgewölbe' },
  { value: 'instep', label: 'Fußrücken' },
  { value: 'ankle', label: 'Knöchel' },
  { value: 'sole', label: 'Sohle' },
  { value: 'other', label: 'Sonstiges' },
];

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0',
  )}`;
}

function formatPace(durationSeconds: number, distanceKm: number): string {
  if (distanceKm <= 0) {
    return '--:-- min/km';
  }

  const secondsPerKm = Math.round(durationSeconds / distanceKm);
  const paceMinutes = Math.floor(secondsPerKm / 60);
  const paceSeconds = secondsPerKm % 60;

  return `${String(paceMinutes).padStart(2, '0')}:${String(
    paceSeconds,
  ).padStart(2, '0')} min/km`;
}

const RunScreen = React.forwardRef<RunScreenHandle, RunScreenProps>(function RunScreen(
  { onBack, onOpenRunDetail },
  ref,
) {
  const shoes = useShoeStatus((state) => state.shoes);
  const setActiveShoe = useShoeStatus((state) => state.setActiveShoe);

  const runs = useRunHistory((state) => state.runs);
  const updateRunFeedback = useRunHistory((state) => state.updateRunFeedback);

  const activeShoe = shoes.find((shoe) => shoe.status === 'active') || shoes[0];

  const runActive = useRunStatus((state) => state.runActive);
  const runPrepared = useRunStatus((state) => state.runPrepared);
  const runMode = useRunStatus((state) => state.runMode);
  const sessionStatus = useRunStatus((state) => state.sessionStatus);
  const pauseRun = useRunStatus((state) => state.pauseRun);
  const resumeRun = useRunStatus((state) => state.resumeRun);
  const stopRun = useRunStatus((state) => state.stopRun);

  const durationSeconds = useRunStatus((state) => state.durationSeconds);
  const distanceKm = useRunStatus((state) => state.distanceKm);

  const [isShoeModalVisible, setShoeModalVisible] = React.useState(false);
  const [feedbackRunId, setFeedbackRunId] = React.useState<string | null>(null);
  const [lastFinishedRunId, setLastFinishedRunId] = React.useState<string | null>(null);
  const [isStoppingRun, setIsStoppingRun] = React.useState(false);
  const [hotwordEnabledForRun, setHotwordEnabledForRun] = React.useState(true);
  const [liveSharingEnabledForRun, setLiveSharingEnabledForRun] =
    React.useState(false);
  const [isUpdatingLiveShare, setIsUpdatingLiveShare] = React.useState(false);
  const [liveBuddyCandidates, setLiveBuddyCandidates] =
    React.useState<DeviceEmergencyContactCandidate[]>([]);
  const [isLiveBuddyPickerVisible, setIsLiveBuddyPickerVisible] =
    React.useState(false);
  const [liveBuddySearchQuery, setLiveBuddySearchQuery] = React.useState('');
  const [pendingLiveBuddyContact, setPendingLiveBuddyContact] =
    React.useState<DeviceEmergencyContactCandidate | null>(null);
  const [selectedShoeFeeling, setSelectedShoeFeeling] =
    React.useState<ShoeRunFeeling | null>(null);
  const [selectedIssueCategory, setSelectedIssueCategory] =
    React.useState<ShoeIssueCategory | null>(null);
  const [selectedIssueType, setSelectedIssueType] =
    React.useState<ShoeIssueType | null>(null);
  const [selectedIssueArea, setSelectedIssueArea] =
    React.useState<ShoeIssueArea | null>(null);
  const [feedbackNotes, setFeedbackNotes] = React.useState('');
  const [startCountdownSeconds, setStartCountdownSeconds] =
    React.useState<number | null>(null);
  const lastCountdownTapAtRef = React.useRef<number | null>(null);
  const countdownDeadlineAtRef = React.useRef<number | null>(null);
  const runStartInProgressRef = React.useRef(false);
  const isStoppingRunRef = React.useRef(false);

  const latestFeedbackRun = runs.find((run) => run.id === feedbackRunId) ?? null;
  const lastFinishedRun =
    runs.find((run) => run.id === lastFinishedRunId) ?? null;

  const shouldAskForArea =
    selectedIssueCategory === 'pressure_rubbing' ||
    selectedIssueType === 'pressure' ||
    selectedIssueType === 'rubbing';

  const paceText = useMemo(() => {
    return formatPace(durationSeconds, distanceKm);
  }, [durationSeconds, distanceKm]);

  const liveBuddyCenterResultContacts = useMemo(() => {
    const normalizedQuery = liveBuddySearchQuery.trim().toLocaleLowerCase('de');

    if (!normalizedQuery) {
      return [];
    }

    return liveBuddyCandidates
      .filter((contact) => {
        const normalizedName = contact.displayName.trim().toLocaleLowerCase('de');
        const normalizedNumber = contact.phoneNumber.trim().toLocaleLowerCase('de');

        return (
          normalizedName.includes(normalizedQuery) ||
          normalizedNumber.includes(normalizedQuery)
        );
      })
      .slice(0, 4);
  }, [liveBuddyCandidates, liveBuddySearchQuery]);

  const isPreparedForStart =
    runPrepared && !runActive && sessionStatus === 'prepared';
  const canShareLiveBeforeStart =
    isPreparedForStart && isLiveShareAllowed({ runMode, sessionStatus });
  const shouldBlockBackNavigation =
    isPreparedForStart || runActive || sessionStatus === 'paused';

  function resetFeedbackState() {
    setFeedbackRunId(null);
    setSelectedShoeFeeling(null);
    setSelectedIssueCategory(null);
    setSelectedIssueType(null);
    setSelectedIssueArea(null);
    setFeedbackNotes('');
  }

  function handleShoePress() {
    setShoeModalVisible(true);
  }

  async function startSelectedRun(
    selectedRunMode: 'Solo-Lauf' | 'Gemeinsamer Lauf',
    startSource: string,
  ): Promise<void> {
    if (runStartInProgressRef.current) {
      return;
    }

    runStartInProgressRef.current = true;
    setStartCountdownSeconds(null);
    lastCountdownTapAtRef.current = null;
    countdownDeadlineAtRef.current = null;

    try {
      await setNativeHotwordEnabledForCurrentRun(hotwordEnabledForRun);
      void startHeartRateSensor().catch(() => undefined);
      useRunStatus.getState().startRun(selectedRunMode, startSource);
      activateLiveSessionForStartedRun();
    } catch (error) {
      console.error(
        '[RunScreen] Lauf konnte nicht gestartet werden',
        error,
      );

      Alert.alert(
        'Lauf noch nicht gestartet',
        'Der Lauf konnte nicht sicher gestartet werden. Bitte erneut starten.',
      );
    } finally {
      runStartInProgressRef.current = false;
    }
  }

  function handleStartRun() {
    void startSelectedRun(
      'Solo-Lauf',
      'RunScreen',
    );
  }

  function handleStartPreparedRun() {
    const preparedRunMode =
      runMode === 'Gemeinsamer Lauf' ||
      runMode === 'Gemeinsamer Lauf vorbereitet'
        ? 'Gemeinsamer Lauf'
        : 'Solo-Lauf';

    void startSelectedRun(
      preparedRunMode,
      'RunScreen vorbereiteter Start',
    );
  }

  function handleCountdownCenterPress() {
    if (startCountdownSeconds === null) {
      return;
    }

    const now = Date.now();
    const previousTapAt = lastCountdownTapAtRef.current;

    if (previousTapAt !== null && now - previousTapAt <= DOUBLE_TAP_WINDOW_MS) {
      setStartCountdownSeconds((currentSeconds) => {
        const nextSeconds = Math.min(
          MAX_START_COUNTDOWN_SECONDS,
          (currentSeconds ?? START_COUNTDOWN_SECONDS) + START_COUNTDOWN_SECONDS,
        );

        countdownDeadlineAtRef.current = Date.now() + nextSeconds * 1000;

        return nextSeconds;
      });
      lastCountdownTapAtRef.current = null;
      return;
    }

    lastCountdownTapAtRef.current = now;
  }

  React.useEffect(() => {
    if (runPrepared && !runActive && sessionStatus === 'prepared') {
      return;
    }

    setStartCountdownSeconds(null);
    lastCountdownTapAtRef.current = null;
    countdownDeadlineAtRef.current = null;
  }, [runActive, runPrepared, sessionStatus]);

  React.useEffect(() => {
    if (
      startCountdownSeconds === null ||
      !runPrepared ||
      runActive ||
      sessionStatus !== 'prepared'
    ) {
      return;
    }

    const updateCountdownFromDeadline = () => {
      const deadlineAt = countdownDeadlineAtRef.current;

      if (deadlineAt === null) {
        return;
      }

      const remainingMs = deadlineAt - Date.now();

      if (remainingMs <= 0) {
        handleStartPreparedRun();
        return;
      }

      setStartCountdownSeconds(Math.max(1, Math.ceil(remainingMs / 1000)));
    };

    updateCountdownFromDeadline();

    const countdownTimer = setInterval(updateCountdownFromDeadline, 250);

    return () => clearInterval(countdownTimer);
  }, [runActive, runPrepared, runMode, sessionStatus, startCountdownSeconds]);

  React.useEffect(() => {
    if (sessionStatus !== 'running') {
      return;
    }

    useRunStatus.getState().tick();

    const runTimer = setInterval(() => {
      useRunStatus.getState().tick();
    }, 1000);

    return () => clearInterval(runTimer);
  }, [sessionStatus]);

  React.useEffect(() => {
    const runIsInactive =
      !runActive &&
      !runPrepared &&
      (sessionStatus === 'idle' || sessionStatus === 'stopped' || sessionStatus === 'failed');

    if (!runIsInactive) return;

    setHotwordEnabledForRun(true);
    setLiveSharingEnabledForRun(false);
    setIsLiveBuddyPickerVisible(false);
    setLiveBuddyCandidates([]);
    clearTemporaryLiveBuddyContact();
    void setNativeHotwordEnabledForCurrentRun(true).catch((error: unknown) => {
      console.error('[RunScreen] Hotword konnte nach Laufende nicht zurückgesetzt werden', error);
    });
  }, [runActive, runPrepared, sessionStatus]);

  React.useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      const countdownIsWaitingForStart =
        startCountdownSeconds !== null &&
        runPrepared &&
        !runActive &&
        sessionStatus === 'prepared';

      if (
        countdownIsWaitingForStart &&
        (nextAppState === 'inactive' || nextAppState === 'background')
      ) {
        handleStartPreparedRun();
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [runActive, runPrepared, runMode, sessionStatus, startCountdownSeconds]);

  async function handleStopRun() {
    if (isStoppingRunRef.current) {
      return;
    }

    isStoppingRunRef.current = true;
    setIsStoppingRun(true);

    const previousLatestRunId =
      useRunHistory.getState().runs[0]?.id ?? null;

    stopHeartRateSensor();

    try {
      const stopPreparation = createRunTrackingStopPreparation();
      const preparationResult = await waitForRunStopPreparation(
        stopPreparation.preparation,
        4000,
        {
          onTimeout: stopPreparation.invalidate,
          onLateError: (error: unknown) => {
            console.error(
              '[RunScreen] Überholte GPS-Vorbereitung vor Laufstopp fehlgeschlagen',
              error,
            );
          },
        },
      );
      if (preparationResult === 'timed_out') {
        console.warn('[RunScreen] GPS-Vorbereitung vor Laufstopp hat das Zeitlimit erreicht; Lauf wird trotzdem gespeichert');
      }
    } catch (error) {
      console.error(
        '[RunScreen] GPS konnte vor Laufstopp nicht vollständig übernommen werden',
        error,
      );
    }

    try {
      await stopRun();

      const latestRun =
        useRunHistory.getState().runs[0] ?? null;

      if (
        latestRun !== null &&
        latestRun.id !== previousLatestRunId
      ) {
        setLastFinishedRunId(latestRun.id);
        setFeedbackRunId(latestRun.id);
      }
    } catch (error) {
      console.error('[RunScreen] Lauf konnte nicht persistent gespeichert werden', error);
      Alert.alert(
        'Lauf noch nicht gespeichert',
        'Die Laufdaten und die Wiederherstellung bleiben erhalten. Bitte versuchen Sie es erneut.',
      );
    } finally {
      isStoppingRunRef.current = false;
      setIsStoppingRun(false);
    }
  }

  async function openLiveBuddyPicker(): Promise<void> {
    let permissionState = await getDeviceContactsPermissionState();

    if (permissionState !== 'granted') {
      permissionState = await requestDeviceContactsPermission();
    }

    if (permissionState !== 'granted') {
      throw new Error(
        'Für die Auswahl des LiveBuddys wird der Zugriff auf Telefonkontakte benötigt.',
      );
    }

    const contacts = await loadDeviceEmergencyContactCandidates();

    if (contacts.length === 0) {
      throw new Error('Es wurde kein Telefonkontakt mit gültiger Rufnummer gefunden.');
    }

    setLiveBuddySearchQuery('');
    setPendingLiveBuddyContact(null);
    setLiveBuddyCandidates(contacts);
    setIsLiveBuddyPickerVisible(true);
  }

  async function handleSelectLiveBuddy(
    contact: DeviceEmergencyContactCandidate,
  ): Promise<void> {
    if (isUpdatingLiveShare) {
      return;
    }

    setIsUpdatingLiveShare(true);
    setIsLiveBuddyPickerVisible(false);

    try {
      await shareLiveSession();
      await syncTemporaryLiveBuddyContactToNative(contact.phoneNumber);
      setTemporaryLiveBuddyContact(contact);
      setLiveBuddyCandidates([]);
      setLiveSharingEnabledForRun(true);
    } catch (error) {
      await endLiveSessionSync();
      setLiveSharingEnabledForRun(false);
      Alert.alert(
        'LaufBuddy Live',
        error instanceof Error
          ? error.message
          : 'Live-Link konnte nicht geteilt werden.',
      );
    } finally {
      setIsUpdatingLiveShare(false);
    }
  }

  async function handleLiveShareChange(enabled: boolean) {
    if (isUpdatingLiveShare) {
      return;
    }

    if (enabled) {
      setIsUpdatingLiveShare(true);

      try {
        await openLiveBuddyPicker();
      } catch (error) {
        Alert.alert(
          'LaufBuddy Live',
          error instanceof Error
            ? error.message
            : 'LiveBuddy konnte nicht ausgewählt werden.',
        );
      } finally {
        setIsUpdatingLiveShare(false);
      }

      return;
    }

    const previousEnabled = liveSharingEnabledForRun;
    setIsUpdatingLiveShare(true);

    try {
      await endLiveSessionSync({ preserveSessionOnError: true });
      setLiveSharingEnabledForRun(false);
      setLiveBuddyCandidates([]);
      setIsLiveBuddyPickerVisible(false);
    } catch (error) {
      setLiveSharingEnabledForRun(previousEnabled);
      Alert.alert(
        'LaufBuddy Live',
        error instanceof Error
          ? error.message
          : 'Live-Freigabe konnte nicht beendet werden.',
      );
    } finally {
      setIsUpdatingLiveShare(false);
    }
  }

  function closeLiveBuddyPickerUi() {
    setIsLiveBuddyPickerVisible(false);
    setLiveBuddyCandidates([]);
    setLiveBuddySearchQuery('');
    setPendingLiveBuddyContact(null);
  }

  const liveBuddyWheelItems: SafetyWheelItem[] = [
    {
      key: 'contact',
      label: 'LiveBuddy',
      icon: LiveBuddyContactWheelIcon,
      action: () => {
        setPendingLiveBuddyContact(null);
        setLiveBuddySearchQuery('');
      },
    },
    {
      key: 'done',
      label: 'Fertig',
      icon: LiveBuddyDoneWheelIcon,
      action: closeLiveBuddyPickerUi,
    },
  ];

  function renderLiveBuddyWheelCenterContent() {
    if (pendingLiveBuddyContact) {
      return (
        <View style={styles.liveBuddyCenterPanel}>
          <Text style={styles.liveBuddyCenterEyebrow}>BESTÄTIGEN</Text>
          <Text style={styles.liveBuddyCenterValue}>LiveBuddy</Text>
          <Text style={styles.liveBuddyCenterValue} numberOfLines={2}>
            {pendingLiveBuddyContact.displayName}
          </Text>
          <Text style={styles.liveBuddyCenterContactNumber} numberOfLines={1}>
            {pendingLiveBuddyContact.phoneNumber}
          </Text>

          <View style={styles.liveBuddyCenterButtonRow}>
            <Pressable
              style={styles.liveBuddyCenterSaveButton}
              onPress={() => {
                void handleSelectLiveBuddy(pendingLiveBuddyContact);
              }}
              disabled={isUpdatingLiveShare}
            >
              <Text style={styles.liveBuddyCenterButtonText}>
                {isUpdatingLiveShare ? 'Warten' : 'Speichern'}
              </Text>
            </Pressable>

            <Pressable
              style={styles.liveBuddyCenterCancelButton}
              onPress={() => setPendingLiveBuddyContact(null)}
              disabled={isUpdatingLiveShare}
            >
              <Text style={styles.liveBuddyCenterButtonText}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.liveBuddyCenterPanel}>
        <Text style={styles.liveBuddyCenterEyebrow}>LIVEBUDDY</Text>
        <Text style={styles.liveBuddyCenterValue}>Noch nicht gesetzt</Text>
        <Text style={styles.liveBuddyCenterHint}>Name eingeben</Text>

        <TextInput
          value={liveBuddySearchQuery}
          onChangeText={(value) => {
            setLiveBuddySearchQuery(value);
            setPendingLiveBuddyContact(null);
          }}
          placeholder="Name"
          placeholderTextColor="#6f7d8c"
          style={styles.liveBuddyCenterSearchInput}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
        />

        {liveBuddyCenterResultContacts.length > 0 ? (
          <View style={styles.liveBuddyCenterResultList}>
            {liveBuddyCenterResultContacts.map((contact) => (
              <Pressable
                key={contact.id}
                style={styles.liveBuddyCenterResultButton}
                onPress={() => setPendingLiveBuddyContact(contact)}
                disabled={isUpdatingLiveShare}
              >
                <Text style={styles.liveBuddyCenterResultName} numberOfLines={1}>
                  {contact.displayName}
                </Text>
                <Text style={styles.liveBuddyCenterResultNumber} numberOfLines={1}>
                  {contact.phoneNumber}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : liveBuddySearchQuery.trim().length > 0 ? (
          <Text style={styles.liveBuddyCenterHint}>Keine Treffer</Text>
        ) : null}
      </View>
    );
  }

  function handleBackRequest() {
    if (shouldBlockBackNavigation) {
      return;
    }

    onBack();
  }

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => shouldBlockBackNavigation,
    );

    return () => subscription.remove();
  }, [shouldBlockBackNavigation]);

  React.useImperativeHandle(
    ref,
    () => ({ requestBack: handleBackRequest }),
    [onBack, shouldBlockBackNavigation],
  );

  function handleDismissFeedback() {
    const completedRunId = feedbackRunId;

    resetFeedbackState();

    if (completedRunId !== null) {
      onOpenRunDetail(completedRunId);
    }
  }

  function handleSelectShoeFeeling(feeling: Exclude<ShoeRunFeeling, 'unknown'>) {
    if (feedbackRunId === null) {
      return;
    }

    setSelectedShoeFeeling(feeling);
    setSelectedIssueCategory(null);
    setSelectedIssueType(null);
    setSelectedIssueArea(null);

    updateRunFeedback(feedbackRunId, {
      shoeRunFeeling: feeling,
      shoeIssueCategory: null,
      shoeIssueType: null,
      shoeIssueArea: null,
    });

    if (feeling === 'good') {
      resetFeedbackState();
      onOpenRunDetail(feedbackRunId);
    }
  }

  function handleSelectIssueCategory(category: Exclude<ShoeIssueCategory, 'none'>) {
    if (feedbackRunId === null) {
      return;
    }

    setSelectedIssueCategory(category);
    setSelectedIssueType(null);
    setSelectedIssueArea(null);

    updateRunFeedback(feedbackRunId, {
      shoeIssueCategory: category,
      shoeIssueType: null,
      shoeIssueArea: null,
    });
  }

  function handleSelectIssueType(issueType: Exclude<ShoeIssueType, 'none'>) {
    if (feedbackRunId === null) {
      return;
    }

    setSelectedIssueType(issueType);
    setSelectedIssueCategory(null);
    setSelectedIssueArea(null);

    updateRunFeedback(feedbackRunId, {
      shoeIssueCategory: null,
      shoeIssueType: issueType,
      shoeIssueArea: null,
    });
  }

  function handleSelectIssueArea(area: Exclude<ShoeIssueArea, 'none'>) {
    if (feedbackRunId === null) {
      return;
    }

    setSelectedIssueArea(area);

    updateRunFeedback(feedbackRunId, {
      shoeIssueArea: area,
    });
  }

  function handleSaveFeedbackAndFinish() {
    const completedRunId = feedbackRunId;

    if (feedbackRunId !== null) {
      updateRunFeedback(feedbackRunId, {
        notes: feedbackNotes.trim().length > 0 ? feedbackNotes.trim() : null,
      });
    }

    resetFeedbackState();

    if (completedRunId !== null) {
      onOpenRunDetail(completedRunId);
    }
  }

  const runWheelItems: SafetyWheelItem[] = useMemo(
    () => [
      {
        key: 'pause',
        label: sessionStatus === 'paused' ? 'Weiter' : runActive ? 'Pause' : 'Start',
        icon: sessionStatus === 'paused' || !runActive ? Play : Pause,
        action: () => {
          handlePauseActionPress();
        },
      },
    ],
    [runActive, runPrepared, sessionStatus],
  );

  function handlePauseActionPress() {
    if (sessionStatus === 'paused') {
      resumeRun();
      return;
    }

    if (runActive) {
      pauseRun();
      return;
    }

    if (runPrepared) {
      if (startCountdownSeconds === null) {
        lastCountdownTapAtRef.current = null;
        countdownDeadlineAtRef.current =
          Date.now() + START_COUNTDOWN_SECONDS * 1000;
        setStartCountdownSeconds(START_COUNTDOWN_SECONDS);
      }
      return;
    }

    handleStartRun();
  }

  function renderRunWheelCenterContent() {
    if (startCountdownSeconds !== null && runPrepared && !runActive) {
      return (
        <Pressable style={styles.centerPanel} onPress={handleCountdownCenterPress}>
          <Text style={styles.centerEyebrow}>START IN</Text>
          <Text style={styles.centerValue}>{startCountdownSeconds}s</Text>
          <Text style={styles.centerText}>
            Handy wegpacken. Doppeltipp gibt +5 Sekunden.
          </Text>
        </Pressable>
      );
    }

    if (!runActive && !runPrepared && lastFinishedRun !== null) {
      return (
        <Pressable
          style={styles.centerPanel}
          onPress={() => onOpenRunDetail(lastFinishedRun.id)}
        >
          <Text style={styles.centerEyebrow}>LETZTER LAUF</Text>
          <MiniRoutePreview
            routePoints={lastFinishedRun.route.routePoints}
            pauses={lastFinishedRun.pauses}
          />
          <Text style={styles.centerText}>Antippen für Details.</Text>
        </Pressable>
      );
    }

    if (sessionStatus === 'paused') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerValue}>PAUSE</Text>

          <Pressable style={styles.centerActionButton} onPress={handlePauseActionPress}>
            <Text style={styles.centerActionButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>Weiterlaufen</Text>
          </Pressable>

          <Pressable
            style={[styles.centerActionButton, styles.centerSecondaryActionButton]}
            onPress={() => {
              void handleStopRun();
            }}
            disabled={isStoppingRun}
          >
            <Text style={styles.centerSecondaryActionButtonText}>
              {isStoppingRun
                ? 'Lauf wird gespeichert …'
                : 'Lauf stoppen'}
            </Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.centerPanel}>
        <Text style={styles.centerEyebrow}>{runActive ? 'LAUF LÄUFT' : 'START'}</Text>
        <Text style={styles.centerValue}>{formatSeconds(durationSeconds)}</Text>
        <Text style={styles.centerText}>
          {runActive ? 'Tippen zum Pausieren.' : 'Tippen zum Starten.'}
        </Text>

        <Pressable style={styles.centerActionButton} onPress={handlePauseActionPress}>
          <Text style={styles.centerActionButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
            {runActive
              ? 'Pausieren'
              : runPrepared
                ? 'Lauf beginnen'
                : 'Lauf starten'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        <View style={styles.runHeader}>
          <Text style={styles.screenEyebrow}>LaufBuddy</Text>
          <Text style={styles.screenTitle}>Laufen</Text>
          <Text style={styles.runSubtitle}>
            {formatSeconds(durationSeconds)} · {distanceKm.toFixed(2)} km · {paceText}
          </Text>
        </View>

        <View style={styles.wheelWrapper}>
          <SafetyWheel
            items={runWheelItems}
            statusLabel={
              sessionStatus === 'paused'
                ? 'LAUF PAUSIERT'
                : runActive
                  ? 'LAUF AKTIV'
                  : 'LAUF BEREIT'
            }
            statusSubline={
              sessionStatus === 'paused'
                ? 'Timer pausiert'
                : runActive
                  ? 'Werte laufen mit'
                  : 'Start über Wheel-Mitte'
            }
            statusColor="#34A6D8"
            secondaryStatusLine={runActive ? 'Lauf wird aufgezeichnet' : 'Bereit'}
            bottomHint=""
            wheelSize={RUN_WHEEL_SIZE}
            centerStatusContent={renderRunWheelCenterContent()}
            centerConfirmContent={renderRunWheelCenterContent()}
            centerPressEnabled={false}
          />
        </View>

        {isPreparedForStart ? (
          <View style={styles.preRunSettings}>
            <View style={styles.runHotwordSetting}>
              <View style={styles.runHotwordSettingText}>
                <Text style={styles.runHotwordSettingTitle}>BuddyWord-Erkennung</Text>
                <Text style={styles.runHotwordSettingStatus}>
                  {hotwordEnabledForRun ? 'Für diesen Lauf aktiv' : 'Für diesen Lauf ausgeschaltet'}
                </Text>
              </View>
              <Switch
                value={hotwordEnabledForRun}
                onValueChange={setHotwordEnabledForRun}
                trackColor={{ false: '#B8C7CF', true: '#34A6D8' }}
                thumbColor="#FFFFFF"
                accessibilityLabel="BuddyWord-Erkennung für diesen Lauf"
              />
            </View>

            {canShareLiveBeforeStart ? (
              <View style={styles.runHotwordSetting}>
                <View style={styles.runHotwordSettingText}>
                  <Text style={styles.runHotwordSettingTitle}>Lauf live teilen</Text>
                  <Text style={styles.runHotwordSettingStatus}>
                    {liveSharingEnabledForRun
                      ? 'LiveBuddy für diesen Lauf aktiv'
                      : 'LiveBuddy auswählen und Link teilen'}
                  </Text>
                </View>
                <Switch
                  value={liveSharingEnabledForRun}
                  onValueChange={(enabled) => {
                    void handleLiveShareChange(enabled);
                  }}
                  disabled={isUpdatingLiveShare}
                  trackColor={{ false: '#B8C7CF', true: '#34A6D8' }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel="Lauf live teilen"
                />
              </View>
            ) : null}
          </View>
        ) : null}

      </View>

      <Modal
        visible={isLiveBuddyPickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeLiveBuddyPickerUi}
      >
        <View style={styles.liveBuddyPickerRoot}>
          <SafetyWheel
            items={liveBuddyWheelItems}
            statusLabel="LIVEBUDDY"
            statusSubline="Telefonkontakt wählen"
            statusColor="#34A6D8"
            secondaryStatusLine="Nur für diesen Lauf"
            bottomHint="Wischen zum Drehen"
            wheelSize={STANDARD_WHEEL_SIZE}
            centerStatusContent={renderLiveBuddyWheelCenterContent()}
          />
        </View>
      </Modal>

      <Modal visible={isShoeModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Laufschuh für diesen Lauf</Text>

            {shoes.map((shoe) => (
              <Pressable
                key={shoe.id}
                style={[
                  styles.modalShoeButton,
                  shoe.status === 'active' && styles.modalShoeButtonActive,
                ]}
                onPress={() => {
                  setActiveShoe(shoe.id);
                  setShoeModalVisible(false);
                }}
              >
                <Text style={styles.modalShoeText}>{shoe.name}</Text>
              </Pressable>
            ))}

            <Pressable
              style={styles.modalCloseButton}
              onPress={() => setShoeModalVisible(false)}
            >
              <Text style={styles.modalCloseText}>Abbrechen</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={feedbackRunId !== null} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Lauf gespeichert ✅</Text>

            <Text style={styles.feedbackSubtitle}>
              {latestFeedbackRun?.shoe.shoeName
                ? `Schuhgefühl für ${latestFeedbackRun.shoe.shoeName}`
                : 'Schuhgefühl bewerten'}
            </Text>

            <Pressable
              style={styles.feedbackSkipButton}
              onPress={handleDismissFeedback}
            >
              <Text style={styles.feedbackSkipText}>Fertig / Überspringen</Text>
            </Pressable>

            <Text style={styles.feedbackQuestion}>
              Wie war das Laufgefühl mit diesem Schuh?
            </Text>

            <View style={styles.feedbackOptionRow}>
              {SHOE_FEELING_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.feedbackOptionButton,
                    selectedShoeFeeling === option.value &&
                      styles.feedbackOptionButtonActive,
                  ]}
                  onPress={() => handleSelectShoeFeeling(option.value)}
                >
                  <Text style={styles.feedbackOptionText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            {selectedShoeFeeling === 'okay' && (
              <>
                <Text style={styles.feedbackQuestion}>
                  Was war nicht ganz optimal?
                </Text>

                <View style={styles.feedbackGrid}>
                  {SHOE_OKAY_CATEGORY_OPTIONS.map((option) => (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.feedbackChip,
                        selectedIssueCategory === option.value &&
                          styles.feedbackChipActive,
                      ]}
                      onPress={() => handleSelectIssueCategory(option.value)}
                    >
                      <Text style={styles.feedbackChipText}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {selectedShoeFeeling === 'bad' && (
              <>
                <Text style={styles.feedbackQuestion}>
                  Was war das Hauptproblem?
                </Text>

                <View style={styles.feedbackGrid}>
                  {SHOE_BAD_ISSUE_OPTIONS.map((option) => (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.feedbackChip,
                        selectedIssueType === option.value &&
                          styles.feedbackChipActive,
                      ]}
                      onPress={() => handleSelectIssueType(option.value)}
                    >
                      <Text style={styles.feedbackChipText}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {shouldAskForArea && (
              <>
                <Text style={styles.feedbackQuestion}>Wo genau?</Text>

                <View style={styles.feedbackGrid}>
                  {SHOE_AREA_OPTIONS.map((option) => (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.feedbackChip,
                        selectedIssueArea === option.value &&
                          styles.feedbackChipActive,
                      ]}
                      onPress={() => handleSelectIssueArea(option.value)}
                    >
                      <Text style={styles.feedbackChipText}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {selectedShoeFeeling !== null && (
              <>
                <Text style={styles.feedbackQuestion}>Notiz optional</Text>

                <TextInput
                  value={feedbackNotes}
                  onChangeText={setFeedbackNotes}
                  placeholder="z. B. rechter Schuh vorne etwas eng"
                  placeholderTextColor="#7f8896"
                  style={styles.feedbackInput}
                  multiline={true}
                />

                <Pressable
                  style={styles.feedbackSaveButton}
                  onPress={handleSaveFeedbackAndFinish}
                >
                  <Text style={styles.feedbackSaveText}>Speichern und fertig</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3FAFD',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  runHeader: {
    position: 'absolute',
    top: 70,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 2,
  },
  runBadge: {
    color: '#34A6D8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  runTitle: {
    color: '#153243',
    fontSize: 34,
    fontWeight: '900',
  },
  runSubtitle: {
    color: '#5B6B7A',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },
  wheelWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  preRunSettings: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    gap: 12,
  },
  runHotwordSetting: {
    minHeight: 76,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(36, 119, 168, 0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  runHotwordSettingText: {
    flex: 1,
    paddingRight: 14,
  },
  runHotwordSettingTitle: {
    color: '#153243',
    fontSize: 15,
    fontWeight: '900',
  },
  runHotwordSettingStatus: {
    color: '#5B6B7A',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  centerPanel: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  centerEyebrow: {
    color: '#5B6B7A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
    marginBottom: 6,
  },
  centerValue: {
    color: '#153243',
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  centerText: {
    color: '#5B6B7A',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 17,
  },
  miniRouteCanvas: {
    width: MINI_ROUTE_WIDTH,
    height: MINI_ROUTE_HEIGHT,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.74)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  miniRouteFallback: {
    width: MINI_ROUTE_WIDTH,
    height: MINI_ROUTE_HEIGHT,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.74)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  miniRouteFallbackText: {
    color: '#153243',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  miniRouteSegment: {
    position: 'absolute',
    height: MINI_ROUTE_LINE_THICKNESS,
    borderRadius: 999,
    backgroundColor: '#34A6D8',
    transformOrigin: '0px 50%',
  },
  miniRoutePoint: {
    position: 'absolute',
    width: MINI_ROUTE_POINT_SIZE,
    height: MINI_ROUTE_POINT_SIZE,
    borderRadius: MINI_ROUTE_POINT_SIZE / 2,
    backgroundColor: 'rgba(21, 50, 67, 0.58)',
  },
  miniRouteStartEndPoint: {
    position: 'absolute',
    width: MINI_ROUTE_START_END_SIZE,
    height: MINI_ROUTE_START_END_SIZE,
    borderRadius: MINI_ROUTE_START_END_SIZE / 2,
    backgroundColor: '#153243',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  miniRoutePausePoint: {
    position: 'absolute',
    width: MINI_ROUTE_PAUSE_SIZE,
    height: MINI_ROUTE_PAUSE_SIZE,
    borderRadius: MINI_ROUTE_PAUSE_SIZE / 2,
    backgroundColor: '#f4c95d',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniRoutePauseText: {
    color: '#101418',
    fontSize: 8,
    fontWeight: '900',
  },
  centerActionButton: {
    width: '100%',
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: '#34A6D8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginTop: 6,
  },
  centerActionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    flexShrink: 1,
  },
  centerSecondaryActionButton: {
    backgroundColor: 'rgba(91, 107, 122, 0.14)',
  },
  centerSecondaryActionButtonText: {
    color: '#153243',
    fontSize: 14,
    fontWeight: '900',
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 80,
    paddingBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#18202a',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  lastRunCard: {
    borderColor: '#1f8f5f',
    borderWidth: 1,
  },
  heartRateCard: {
    borderColor: '#2a7fff',
    borderWidth: 1,
  },
  heartRateValue: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  historyRunCard: {
    backgroundColor: '#101820',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  detailButton: {
    backgroundColor: '#2a7fff',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 12,
  },
  detailButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  highlightCard: {
    borderColor: '#2b3542',
    borderWidth: 1,
  },
  hintText: {
    color: '#7f8896',
    fontSize: 13,
    marginTop: 4,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardText: {
    color: '#b0b7c3',
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: '#2a7fff',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 14,
  },
  readyButton: {
    backgroundColor: '#1f8f5f',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 14,
  },
  stopButton: {
    backgroundColor: '#c44536',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#1c2530',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 14,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  historyOpenButton: {
    position: 'absolute',
    bottom: 42,
    alignSelf: 'center',
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: 'rgba(52, 166, 216, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(52, 166, 216, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  historyOpenButtonText: {
    color: '#153243',
    fontSize: 14,
    fontWeight: '900',
  },
  historySubtitle: {
    color: '#5B6B7A',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 19,
  },
  historyEmptyText: {
    color: '#b0b7c3',
    fontSize: 15,
    textAlign: 'center',
    marginVertical: 18,
  },
  historyList: {
    maxHeight: 430,
  },
  historyRunButton: {
    backgroundColor: '#0f141b',
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2b3542',
    alignItems: 'center',
  },
  historyRunTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 4,
  },
  historyRunMeta: {
    color: '#b0b7c3',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  historyCloseButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    borderRadius: 12,
    marginTop: 10,
  },
  historyCloseText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  liveBuddyPickerRoot: {
    flex: 1,
    backgroundColor: '#F3FAFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBuddyCenterPanel: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  liveBuddyCenterEyebrow: {
    color: '#2F7DA8',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    textAlign: 'center',
  },
  liveBuddyCenterValue: {
    marginTop: 5,
    color: '#17384A',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  liveBuddyCenterContactNumber: {
    marginTop: 3,
    color: '#2F7DA8',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  liveBuddyCenterHint: {
    marginTop: 5,
    color: '#2F7DA8',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
  },
  liveBuddyCenterSearchInput: {
    marginTop: 7,
    width: '100%',
    minHeight: 30,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.82)',
    color: '#17384A',
    fontSize: 13,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: 'center',
  },
  liveBuddyCenterResultList: {
    marginTop: 6,
    width: '100%',
    gap: 4,
  },
  liveBuddyCenterResultButton: {
    borderRadius: 9,
    backgroundColor: '#34A6D8',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  liveBuddyCenterResultName: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
  },
  liveBuddyCenterResultNumber: {
    color: '#dcecff',
    fontSize: 8,
    fontWeight: '800',
    textAlign: 'center',
  },
  liveBuddyCenterButtonRow: {
    marginTop: 8,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  liveBuddyCenterSaveButton: {
    minHeight: 28,
    borderRadius: 999,
    backgroundColor: '#34A6D8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  liveBuddyCenterCancelButton: {
    minHeight: 28,
    borderRadius: 999,
    backgroundColor: '#6F8794',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  liveBuddyCenterButtonText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#18202a',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: '#2b3542',
    maxHeight: '92%',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalShoeButton: {
    backgroundColor: '#0f141b',
    padding: 16,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2b3542',
  },
  modalShoeButtonActive: {
    borderColor: '#1f8f5f',
    borderWidth: 2,
  },
  modalShoeText: {
    color: '#ffffff',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  modalCloseButton: {
    backgroundColor: '#c44536',
    padding: 16,
    borderRadius: 10,
    marginTop: 10,
  },
  modalCloseText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  feedbackSubtitle: {
    color: '#5B6B7A',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  feedbackSkipButton: {
    backgroundColor: '#1c2530',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#3b4654',
  },
  feedbackSkipText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  feedbackQuestion: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 10,
  },
  feedbackOptionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  feedbackOptionButton: {
    flex: 1,
    backgroundColor: '#101820',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#2b3542',
  },
  feedbackOptionButtonActive: {
    borderColor: '#1f8f5f',
    backgroundColor: '#173326',
  },
  feedbackOptionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  feedbackGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  feedbackChip: {
    backgroundColor: '#101820',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2b3542',
  },
  feedbackChipActive: {
    borderColor: '#1f8f5f',
    backgroundColor: '#173326',
  },
  feedbackChipText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackInput: {
    minHeight: 72,
    backgroundColor: '#101820',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2b3542',
    color: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    fontSize: 14,
    marginBottom: 12,
  },
  feedbackSaveButton: {
    backgroundColor: '#1f8f5f',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 4,
  },
  feedbackSaveText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  screenEyebrow: {
    color: '#2477A8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  screenTitle: {
    marginTop: 4,
    color: '#153243',
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
});

export default RunScreen;
