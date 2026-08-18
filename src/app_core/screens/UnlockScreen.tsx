// src/app_core/screens/UnlockScreen.tsx
import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAppStatus } from '../state/useAppStatus';
import {
  SafetyWheel,
  type SafetyWheelIcon,
  type SafetyWheelItem,
} from '../components/SafetyWheel';

const { width } = Dimensions.get('window');
const UNLOCK_WHEEL_SIZE = Math.min(width * 0.96, 430);

type UnlockScreenProps = {
  onBack: () => void;
};

type UnlockPanel =
  | 'eventName'
  | 'eventDate'
  | 'check'
  | 'status'
  | 'premium'
  | 'until'
  | 'source'
  | 'activate';

const TODAY_TEXT = '22.03.2026';
const TODAY = new Date('2026-03-22T00:00:00');

function createEmojiWheelIcon(emoji: string): SafetyWheelIcon {
  return function EmojiWheelIcon({ size = 32 }: { size?: number }) {
    return <Text style={{ fontSize: Math.round(size * 0.72) }}>{emoji}</Text>;
  };
}

const EventNameWheelIcon = createEmojiWheelIcon('🏁');
const DateWheelIcon = createEmojiWheelIcon('📅');
const CheckWheelIcon = createEmojiWheelIcon('✅');
const StatusWheelIcon = createEmojiWheelIcon('📌');
const PremiumWheelIcon = createEmojiWheelIcon('⭐');
const UntilWheelIcon = createEmojiWheelIcon('⏳');
const SourceWheelIcon = createEmojiWheelIcon('ℹ️');
const ActivateWheelIcon = createEmojiWheelIcon('🔓');
const BackWheelIcon = createEmojiWheelIcon('↩️');

function parseGermanDate(input: string): Date | null {
  const trimmed = input.trim();
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);

  if (!match) {
    return null;
  }

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);

  const parsedDate = new Date(year, month - 1, day);

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }

  return parsedDate;
}

function formatGermanDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());

  return `${day}.${month}.${year}`;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export default function UnlockScreen({ onBack }: UnlockScreenProps) {
  const [activePanel, setActivePanel] = useState<UnlockPanel>('eventName');
  const [eventName, setEventName] = useState('Belgrad Marathon');
  const [eventDateInput, setEventDateInput] = useState('22.06.2026');
  const [codeStatus, setCodeStatus] = useState(
    'Noch keine Event-Freischaltung geprüft',
  );

  const premiumUnlocked = useAppStatus((state) => state.premiumUnlocked);
  const premiumUntil = useAppStatus((state) => state.premiumUntil);
  const unlockSource = useAppStatus((state) => state.unlockSource);
  const setPremiumUnlock = useAppStatus((state) => state.setPremiumUnlock);
  const resetPremiumUnlock = useAppStatus((state) => state.resetPremiumUnlock);

  const validationResult = useMemo(() => {
    const parsedEventDate = parseGermanDate(eventDateInput);

    if (!parsedEventDate) {
      return {
        isValid: false,
        message: 'Bitte Datum im Format TT.MM.JJJJ eingeben.',
        eventDate: null as Date | null,
      };
    }

    if (parsedEventDate <= TODAY) {
      return {
        isValid: false,
        message: 'Das Eventdatum muss in der Zukunft liegen.',
        eventDate: parsedEventDate,
      };
    }

    const maxAllowedDate = addDays(TODAY, 365);

    if (parsedEventDate > maxAllowedDate) {
      return {
        isValid: false,
        message: 'Eventdatum liegt zu weit in der Zukunft.',
        eventDate: parsedEventDate,
      };
    }

    return {
      isValid: true,
      message: 'Eventdatum ist gültig.',
      eventDate: parsedEventDate,
    };
  }, [eventDateInput]);

  function handleActivateEventUnlock() {
    if (!validationResult.isValid || !validationResult.eventDate) {
      setCodeStatus(validationResult.message);
      resetPremiumUnlock();
      return;
    }

    const trimmedEventName = eventName.trim() || 'Dein Event';
    const formattedUntil = formatGermanDate(validationResult.eventDate);

    setPremiumUnlock(formattedUntil, `Event-Freischaltung: ${trimmedEventName}`);
    setCodeStatus(`Premium-Test für "${trimmedEventName}" aktiv`);
  }

  function handleResetUnlock() {
    resetPremiumUnlock();
    setCodeStatus('Freischaltung zurückgesetzt');
  }

  const wheelItems: SafetyWheelItem[] = [
    {
      key: 'eventName',
      label: 'Eventname',
      icon: EventNameWheelIcon,
      action: () => setActivePanel('eventName'),
    },
    {
      key: 'eventDate',
      label: 'Eventdatum',
      icon: DateWheelIcon,
      action: () => setActivePanel('eventDate'),
    },
    {
      key: 'check',
      label: 'Prüfung',
      icon: CheckWheelIcon,
      action: () => setActivePanel('check'),
    },
    {
      key: 'status',
      label: 'Status',
      icon: StatusWheelIcon,
      action: () => setActivePanel('status'),
    },
    {
      key: 'premium',
      label: 'Premium',
      icon: PremiumWheelIcon,
      action: () => setActivePanel('premium'),
    },
    {
      key: 'until',
      label: 'Gültig bis',
      icon: UntilWheelIcon,
      action: () => setActivePanel('until'),
    },
    {
      key: 'source',
      label: 'Quelle',
      icon: SourceWheelIcon,
      action: () => setActivePanel('source'),
    },
    {
      key: 'activate',
      label: premiumUnlocked ? 'Zurücksetzen' : 'Aktivieren',
      icon: ActivateWheelIcon,
      action: () => setActivePanel('activate'),
    },
  ];

  const renderWheelCenterContent = () => {
    if (activePanel === 'eventName') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>EVENTNAME</Text>

          <TextInput
            value={eventName}
            onChangeText={setEventName}
            placeholder="Event"
            placeholderTextColor="#6f7d8c"
            style={styles.centerInput}
          />

          <Text style={styles.centerHint}>Tippen zum Ändern</Text>
        </View>
      );
    }

    if (activePanel === 'eventDate') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>EVENTDATUM</Text>

          <TextInput
            value={eventDateInput}
            onChangeText={setEventDateInput}
            placeholder="TT.MM.JJJJ"
            placeholderTextColor="#6f7d8c"
            style={styles.centerInput}
            keyboardType="numbers-and-punctuation"
          />

          <Text style={styles.centerHint}>z.B. 22.06.2026</Text>
        </View>
      );
    }

    if (activePanel === 'check') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>PRÜFUNG</Text>
          <Text style={styles.centerValue}>
            {validationResult.isValid ? 'Gültig' : 'Nicht gültig'}
          </Text>
          <Text style={styles.centerHint} numberOfLines={2}>
            {validationResult.message}
          </Text>
        </View>
      );
    }

    if (activePanel === 'status') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>STATUS</Text>
          <Text style={styles.centerValue} numberOfLines={2}>
            {codeStatus}
          </Text>
        </View>
      );
    }

    if (activePanel === 'premium') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>PREMIUM</Text>
          <Text style={styles.centerBigValue}>
            {premiumUnlocked ? 'AKTIV' : 'AUS'}
          </Text>
          <Text style={styles.centerHint}>Test-Freischaltung</Text>
        </View>
      );
    }

    if (activePanel === 'until') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>GÜLTIG BIS</Text>
          <Text style={styles.centerValue}>{premiumUntil || '-'}</Text>
        </View>
      );
    }

    if (activePanel === 'source') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>QUELLE</Text>
          <Text style={styles.centerValue} numberOfLines={2}>
            {unlockSource || '-'}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.centerPanel}>
        <Text style={styles.centerEyebrow}>
          {premiumUnlocked ? 'ZURÜCKSETZEN' : 'AKTIVIEREN'}
        </Text>
        <Text style={styles.centerValue}>
          {premiumUnlocked ? 'Premium aktiv' : 'Premium aus'}
        </Text>

        <Pressable
          style={premiumUnlocked ? styles.centerDangerButton : styles.centerButton}
          onPress={premiumUnlocked ? handleResetUnlock : handleActivateEventUnlock}
        >
          <Text style={styles.centerButtonText}>
            {premiumUnlocked ? 'Reset' : 'Start'}
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderActivePanel = () => {
    if (activePanel === 'eventName') {
      return (
        <View style={styles.detailPanel}>
          <Text style={styles.detailTitle}>Eventname</Text>
          <Text style={styles.detailText}>
            Der Eventname wird direkt in der Wheel-Mitte eingegeben.
          </Text>
        </View>
      );
    }

    if (activePanel === 'eventDate') {
      return (
        <View style={styles.detailPanel}>
          <Text style={styles.detailTitle}>Eventdatum</Text>
          <Text style={styles.detailText}>
            Heute: {TODAY_TEXT}. Das Datum wird direkt in der Wheel-Mitte
            eingegeben.
          </Text>
        </View>
      );
    }

    if (activePanel === 'activate') {
      return (
        <View style={styles.detailPanel}>
          <Text style={styles.detailTitle}>
            {premiumUnlocked ? 'Freischaltung zurücksetzen' : 'Freischaltung aktivieren'}
          </Text>
          <Text style={styles.detailText}>
            Die Aktion wird direkt in der Wheel-Mitte bestätigt.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.detailPanel}>
        <Text style={styles.detailTitle}>Freischaltung</Text>
        <Text style={styles.detailText}>
          Das ausgewählte Segment zeigt seinen Status direkt in der Wheel-Mitte.
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.badge}>LaufBuddy</Text>
        <Text style={styles.title}>Freischaltung</Text>
        <Text style={styles.subtitle}>
          Premium-Status und Freischaltung verwalten.
        </Text>
      </View>

      <View style={styles.wheelStage}>
        <SafetyWheel
          items={wheelItems}
          statusLabel="FREISCHALTUNG"
          statusSubline={premiumUnlocked ? 'Premium aktiv' : 'Premium nicht aktiv'}
          statusColor="#34A6D8"
          secondaryStatusLine={validationResult.isValid ? 'Event gültig' : 'Event prüfen'}
          bottomHint="Wischen zum Drehen"
          wheelSize={UNLOCK_WHEEL_SIZE}
          centerStatusContent={renderWheelCenterContent()}
        />
      </View>

      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        keyboardShouldPersistTaps="handled"
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
  centerPanel: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  centerEyebrow: {
    color: '#2F7DA8',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  centerInput: {
    marginTop: 6,
    width: '100%',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.78)',
    color: '#17384A',
    fontSize: 14,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: 'center',
  },
  centerValue: {
    marginTop: 7,
    color: '#17384A',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  centerBigValue: {
    marginTop: 5,
    color: '#17384A',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  centerHint: {
    marginTop: 6,
    color: '#2F7DA8',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  centerButton: {
    marginTop: 8,
    minHeight: 30,
    borderRadius: 999,
    backgroundColor: '#34A6D8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
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
  centerButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  detailPanel: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 18,
    marginTop: 0,
    marginBottom: 12,
    borderColor: 'rgba(36, 119, 168, 0.16)',
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
});
