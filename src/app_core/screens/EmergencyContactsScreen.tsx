// src/app_core/screens/EmergencyContactsScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { DeviceEmergencyContactCandidate } from '../../services/deviceContactsService';
import { useEmergencyContactsStore } from '../../state/emergencyContactsStore';
import { EmergencyContactsStatus } from '../../state/emergencyContactsStatus';
import {
  SafetyWheel,
  type SafetyWheelIcon,
  type SafetyWheelItem,
} from '../components/SafetyWheel';

const { width } = Dimensions.get('window');
const EMERGENCY_CONTACTS_WHEEL_SIZE = Math.min(width * 0.96, 430);
const EMERGENCY_CONTACT_SLOT_COUNT = 1;
const CENTER_RESULT_LIMIT = 4;

type EmergencyContactsScreenProps = {
  onBack: () => void;
};

type EmergencyContactsPanel = 'slot1' | 'phonebook';

function createEmojiWheelIcon(emoji: string): SafetyWheelIcon {
  return function EmojiWheelIcon({ size = 32 }: { size?: number }) {
    return <Text style={{ fontSize: Math.round(size * 0.72) }}>{emoji}</Text>;
  };
}

const ContactOneWheelIcon = createEmojiWheelIcon('1️⃣');
const PhonebookWheelIcon = createEmojiWheelIcon('☎️');
const DoneWheelIcon = createEmojiWheelIcon('↩️');

function getPermissionLabel(permissionState: string): string {
  if (permissionState === 'granted') {
    return 'Zugriff erlaubt';
  }

  if (permissionState === 'denied') {
    return 'Zugriff verweigert';
  }

  return 'Zugriff offen';
}

function getStatusLabel(status: EmergencyContactsStatus): string {
  switch (status) {
    case EmergencyContactsStatus.Loading:
      return 'Lädt';
    case EmergencyContactsStatus.Saving:
      return 'Speichert';
    case EmergencyContactsStatus.Error:
      return 'Fehler';
    case EmergencyContactsStatus.Ready:
      return 'Bereit';
    case EmergencyContactsStatus.Idle:
    default:
      return 'Offen';
  }
}

function getSlotIndexFromPanel(_panel: EmergencyContactsPanel): number {
  return 0;
}

function getSlotTitle(slotIndex: number): string {
  return `Kontakt ${slotIndex + 1}`;
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase('de');
}

function getStoredSlotLabel(
  selectedContacts: { displayName: string; phoneNumber: string }[],
  slotIndex: number,
): string {
  const contact = selectedContacts[slotIndex];

  if (!contact) {
    return 'Noch frei';
  }

  return contact.displayName;
}

function filterContactsByQuery(
  contacts: DeviceEmergencyContactCandidate[],
  searchQuery: string,
): DeviceEmergencyContactCandidate[] {
  const normalizedQuery = normalizeSearchValue(searchQuery);

  if (!normalizedQuery) {
    return [];
  }

  return contacts.filter((contact) => {
    const normalizedName = normalizeSearchValue(contact.displayName);
    const normalizedNumber = normalizeSearchValue(contact.phoneNumber);

    return (
      normalizedName.includes(normalizedQuery) ||
      normalizedNumber.includes(normalizedQuery)
    );
  });
}

export default function EmergencyContactsScreen({
  onBack,
}: EmergencyContactsScreenProps) {
  const [activePanel, setActivePanel] =
    useState<EmergencyContactsPanel>('slot1');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingContact, setPendingContact] =
    useState<DeviceEmergencyContactCandidate | null>(null);

  const status = useEmergencyContactsStore((state) => state.status);
  const permissionState = useEmergencyContactsStore(
    (state) => state.permissionState,
  );
  const availableContacts = useEmergencyContactsStore(
    (state) => state.availableContacts,
  );
  const selectedContacts = useEmergencyContactsStore(
    (state) => state.selectedContacts,
  );
  const errorMessage = useEmergencyContactsStore((state) => state.errorMessage);
  const hydrateSelectedContacts = useEmergencyContactsStore(
    (state) => state.hydrateSelectedContacts,
  );
  const requestPermissionAndLoadContacts = useEmergencyContactsStore(
    (state) => state.requestPermissionAndLoadContacts,
  );
  const loadAvailableContacts = useEmergencyContactsStore(
    (state) => state.loadAvailableContacts,
  );
  const setSelectedContactAtSlot = useEmergencyContactsStore(
    (state) => state.setSelectedContactAtSlot,
  );
  const removeSelectedContactAtSlot = useEmergencyContactsStore(
    (state) => state.removeSelectedContactAtSlot,
  );
  const clearError = useEmergencyContactsStore((state) => state.clearError);

  useEffect(() => {
    void (async () => {
      await hydrateSelectedContacts();

      if (
        useEmergencyContactsStore.getState().permissionState === 'granted'
      ) {
        await loadAvailableContacts();
      }
    })();
  }, [hydrateSelectedContacts, loadAvailableContacts]);

  const isBusy =
    status === EmergencyContactsStatus.Loading ||
    status === EmergencyContactsStatus.Saving;

  const activeSlotIndex = getSlotIndexFromPanel(activePanel);
  const activeSlotTitle = getSlotTitle(activeSlotIndex);
  const activeStoredContact = selectedContacts[activeSlotIndex] ?? null;

  const filteredAvailableContacts = useMemo(
    () => filterContactsByQuery(availableContacts, searchQuery),
    [availableContacts, searchQuery],
  );

  const centerResultContacts = filteredAvailableContacts.slice(
    0,
    CENTER_RESULT_LIMIT,
  );

  const handleLoadContactsPress = async () => {
    clearError();
    setPendingContact(null);

    if (permissionState === 'granted') {
      await loadAvailableContacts({ forceRefresh: true });
      return;
    }

    await requestPermissionAndLoadContacts();
  };

  const handleOpenSlot = (panel: EmergencyContactsPanel) => {
    setActivePanel(panel);
    setPendingContact(null);
    setSearchQuery('');
  };

  const handleContactCandidatePress = (
    contact: DeviceEmergencyContactCandidate,
  ) => {
    setPendingContact(contact);
  };

  const handleConfirmPendingContact = async () => {
    if (!pendingContact) {
      return;
    }

    await setSelectedContactAtSlot(activeSlotIndex, pendingContact);
    setPendingContact(null);
    setSearchQuery('');
  };

  const handleCancelPendingContact = () => {
    setPendingContact(null);
  };

  const handleRemoveActiveSlot = async () => {
    await removeSelectedContactAtSlot(activeSlotIndex);
    setPendingContact(null);
    setSearchQuery('');
  };

  const wheelItems: SafetyWheelItem[] = [
    {
      key: 'slot1',
      label: 'Kontakt 1',
      icon: ContactOneWheelIcon,
      action: () => handleOpenSlot('slot1'),
    },
    {
      key: 'phonebook',
      label: 'Telefonbuch',
      icon: PhonebookWheelIcon,
      action: () => handleOpenSlot('phonebook'),
    },
    {
      key: 'done',
      label: 'Fertig',
      icon: DoneWheelIcon,
      action: onBack,
    },
  ];

  const renderPendingConfirmation = () => {
    if (!pendingContact) {
      return null;
    }

    return (
      <View style={styles.centerPanel}>
        <Text style={styles.centerEyebrow}>BESTÄTIGEN</Text>
        <Text style={styles.centerValue}>{activeSlotTitle}</Text>
        <Text style={styles.centerContactName} numberOfLines={2}>
          {pendingContact.displayName}
        </Text>
        <Text style={styles.centerContactNumber} numberOfLines={1}>
          {pendingContact.phoneNumber}
        </Text>

        <View style={styles.centerButtonRow}>
          <Pressable
            style={styles.centerSaveButton}
            onPress={() => {
              void handleConfirmPendingContact();
            }}
            disabled={isBusy}
          >
            <Text style={styles.centerButtonText}>
              {isBusy ? 'Warten' : 'Speichern'}
            </Text>
          </Pressable>

          <Pressable
            style={styles.centerCancelButton}
            onPress={handleCancelPendingContact}
            disabled={isBusy}
          >
            <Text style={styles.centerButtonText}>Abbrechen</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderSlotCenterContent = () => {
    const confirmationContent = renderPendingConfirmation();

    if (confirmationContent) {
      return confirmationContent;
    }

    return (
      <View style={styles.centerPanel}>
        <Text style={styles.centerEyebrow}>{activeSlotTitle.toUpperCase()}</Text>

        {activeStoredContact ? (
          <>
            <Text style={styles.centerContactName} numberOfLines={2}>
              {activeStoredContact.displayName}
            </Text>
            <Text style={styles.centerContactNumber} numberOfLines={1}>
              {activeStoredContact.phoneNumber}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.centerValue}>Noch nicht gesetzt</Text>
            <Text style={styles.centerHint}>Name eingeben</Text>
          </>
        )}

        {permissionState !== 'granted' || availableContacts.length === 0 ? (
          <Pressable
            style={styles.centerButton}
            onPress={() => {
              void handleLoadContactsPress();
            }}
            disabled={isBusy}
          >
            <Text style={styles.centerButtonText}>
              {isBusy
                ? 'Bitte warten'
                : permissionState === 'granted'
                  ? 'Telefonbuch laden'
                  : 'Telefonbuch erlauben'}
            </Text>
          </Pressable>
        ) : (
          <TextInput
            value={searchQuery}
            onChangeText={(value) => {
              setSearchQuery(value);
              setPendingContact(null);
            }}
            placeholder="Name"
            placeholderTextColor="#6f7d8c"
            style={styles.centerSearchInput}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
          />
        )}

        {centerResultContacts.length > 0 ? (
          <View style={styles.centerResultList}>
            {centerResultContacts.map((contact) => (
              <Pressable
                key={contact.id}
                style={styles.centerResultButton}
                onPress={() => handleContactCandidatePress(contact)}
                disabled={isBusy}
              >
                <Text style={styles.centerResultName} numberOfLines={1}>
                  {contact.displayName}
                </Text>
                <Text style={styles.centerResultNumber} numberOfLines={1}>
                  {contact.phoneNumber}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : searchQuery.trim().length > 0 ? (
          <Text style={styles.centerHint}>Keine Treffer</Text>
        ) : null}

        {activeStoredContact ? (
          <Pressable
            style={styles.centerRemoveButton}
            onPress={() => {
              void handleRemoveActiveSlot();
            }}
            disabled={isBusy}
          >
            <Text style={styles.centerButtonText}>Entfernen</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderPhonebookCenterContent = () => {
    return (
      <View style={styles.centerPanel}>
        <Text style={styles.centerEyebrow}>TELEFONBUCH</Text>
        <Text style={styles.centerValue}>
          {getPermissionLabel(permissionState)}
        </Text>
        <Text style={styles.centerHint}>{getStatusLabel(status)}</Text>

        <Pressable
          style={styles.centerButton}
          onPress={() => {
            void handleLoadContactsPress();
          }}
          disabled={isBusy}
        >
          <Text style={styles.centerButtonText}>
            {isBusy
              ? 'Bitte warten'
              : permissionState === 'granted'
                ? 'Aktualisieren'
                : 'Erlauben'}
          </Text>
        </Pressable>

        <Text style={styles.centerHint}>
          {availableContacts.length} Nummern geladen
        </Text>
      </View>
    );
  };

  const renderWheelCenterContent = () => {
    if (activePanel === 'phonebook') {
      return renderPhonebookCenterContent();
    }

    return renderSlotCenterContent();
  };

  const renderSlotOverview = () => {
    return (
      <View style={styles.slotOverview}>
        {Array.from({ length: EMERGENCY_CONTACT_SLOT_COUNT }).map(
          (_value, index) => {
            const contact = selectedContacts[index] ?? null;
            const isActive = index === activeSlotIndex;

            return (
              <View
                key={`slot-${index}`}
                style={isActive ? styles.activeSlotCard : styles.slotCard}
              >
                <Text style={styles.slotTitle}>{getSlotTitle(index)}</Text>
                <Text style={styles.slotName} numberOfLines={1}>
                  {contact ? contact.displayName : 'Noch frei'}
                </Text>
                <Text style={styles.slotNumber} numberOfLines={1}>
                  {contact ? contact.phoneNumber : 'Name in der Mitte suchen'}
                </Text>
              </View>
            );
          },
        )}
      </View>
    );
  };

  const renderActivePanel = () => {
    if (errorMessage) {
      return (
        <View style={styles.detailPanel}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      );
    }

    if (activePanel === 'phonebook') {
      return (
        <View style={styles.detailPanel}>
          <Text style={styles.detailTitle}>Telefonbuch</Text>
          <Text style={styles.detailText}>
            Telefonbuchzugriff und Aktualisierung laufen nur in der Wheel-Mitte.
            Danach wählst du Kontakt 1 und suchst dort den Namen.
          </Text>

          {isBusy ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <Text style={styles.loadingText}>Bitte kurz warten ...</Text>
            </View>
          ) : null}
        </View>
      );
    }

    return (
      <View style={styles.detailPanel}>
        <Text style={styles.detailTitle}>Gespeicherte Telefonkontakte</Text>
        <Text style={styles.detailText}>
          Der Kontakt wird erst gespeichert, nachdem du den Treffer in der Mitte
          bestätigt hast.
        </Text>
        {renderSlotOverview()}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardRoot}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 12}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.badge}>LaufBuddy</Text>
          <Text style={styles.title}>Telefonkontakte</Text>
          <Text style={styles.subtitle}>
            Wähle eine Person, die LaufBuddy anrufen darf, wenn du per Sprachbefehl Hilfe anforderst.
          </Text>
        </View>

        <View style={styles.wheelStage}>
          <SafetyWheel
            items={wheelItems}
            statusLabel="NOTFALL"
            statusSubline="Telefonkontakt wählen"
            statusColor="#34A6D8"
            secondaryStatusLine={`${selectedContacts.length} gespeichert`}
            bottomHint="Wischen zum Drehen"
            wheelSize={EMERGENCY_CONTACTS_WHEEL_SIZE}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
    backgroundColor: '#F3FAFD',
  },
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
    paddingHorizontal: 3,
  },
  centerEyebrow: {
    color: '#2F7DA8',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    textAlign: 'center',
  },
  centerValue: {
    marginTop: 5,
    color: '#17384A',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  centerContactName: {
    marginTop: 5,
    color: '#17384A',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  centerContactNumber: {
    marginTop: 3,
    color: '#2F7DA8',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  centerHint: {
    marginTop: 5,
    color: '#2F7DA8',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
  },
  centerSearchInput: {
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
  centerResultList: {
    marginTop: 6,
    width: '100%',
    gap: 4,
  },
  centerResultButton: {
    borderRadius: 9,
    backgroundColor: '#34A6D8',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  centerResultName: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
  },
  centerResultNumber: {
    color: '#dcecff',
    fontSize: 8,
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
  centerButtonRow: {
    marginTop: 8,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  centerSaveButton: {
    minHeight: 28,
    borderRadius: 999,
    backgroundColor: '#34A6D8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  centerCancelButton: {
    minHeight: 28,
    borderRadius: 999,
    backgroundColor: '#6F8794',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  centerRemoveButton: {
    marginTop: 7,
    minHeight: 26,
    borderRadius: 999,
    backgroundColor: '#5D7C8C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  centerButtonText: {
    color: '#ffffff',
    fontSize: 10,
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
  errorText: {
    color: '#7A5B32',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  loadingRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#5B6B7A',
    fontSize: 14,
    fontWeight: '700',
  },
  slotOverview: {
    marginTop: 12,
    gap: 8,
  },
  slotCard: {
    backgroundColor: '#F8FBFD',
    borderRadius: 18,
    padding: 14,
    borderColor: 'rgba(36, 119, 168, 0.16)',
    borderWidth: 1,
  },
  activeSlotCard: {
    backgroundColor: '#E8F4FA',
    borderRadius: 18,
    padding: 14,
    borderColor: '#34A6D8',
    borderWidth: 2,
  },
  slotTitle: {
    color: '#12384D',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 4,
  },
  slotName: {
    color: '#2477A8',
    fontSize: 14,
    fontWeight: '900',
  },
  slotNumber: {
    marginTop: 3,
    color: '#5B6B7A',
    fontSize: 12,
    fontWeight: '700',
  },
});
