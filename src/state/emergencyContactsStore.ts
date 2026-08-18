import { create } from 'zustand';
import {
  DeviceContactsPermissionState,
  DeviceEmergencyContactCandidate,
  getDeviceContactsPermissionState,
  loadDeviceEmergencyContactCandidates,
  requestDeviceContactsPermission,
} from '../services/deviceContactsService';
import {
  StoredEmergencyContact,
  loadStoredEmergencyContacts,
  saveStoredEmergencyContacts,
} from '../services/emergencyContactsStorageService';
import { EmergencyContactsStatus } from './emergencyContactsStatus';

interface EmergencyContactsStoreState {
  status: EmergencyContactsStatus;
  permissionState: DeviceContactsPermissionState;
  availableContacts: DeviceEmergencyContactCandidate[];
  selectedContacts: StoredEmergencyContact[];
  errorMessage: string | null;

  hydrateSelectedContacts: () => Promise<void>;
  refreshPermissionState: () => Promise<void>;
  requestPermissionAndLoadContacts: () => Promise<void>;
  loadAvailableContacts: (
    options?: { forceRefresh?: boolean },
  ) => Promise<void>;
  toggleSelectedContact: (
    contact: DeviceEmergencyContactCandidate,
  ) => Promise<void>;
  setSelectedContactAtSlot: (
    slotIndex: number,
    contact: DeviceEmergencyContactCandidate,
  ) => Promise<void>;
  removeSelectedContactAtSlot: (slotIndex: number) => Promise<void>;
  removeSelectedContact: (contactId: string) => Promise<void>;
  clearError: () => void;
  resetEmergencyContactsState: () => void;
}

function toStoredEmergencyContact(
  contact: DeviceEmergencyContactCandidate,
): StoredEmergencyContact {
  return {
    id: contact.id,
    displayName: contact.displayName,
    phoneNumber: contact.phoneNumber,
  };
}

function hasSelectedContact(
  selectedContacts: StoredEmergencyContact[],
  contactId: string,
): boolean {
  return selectedContacts.some((contact) => contact.id === contactId);
}

export const useEmergencyContactsStore =
  create<EmergencyContactsStoreState>((set, get) => ({
    status: EmergencyContactsStatus.Idle,
    permissionState: 'undetermined',
    availableContacts: [],
    selectedContacts: [],
    errorMessage: null,

    hydrateSelectedContacts: async () => {
      set({
        status: EmergencyContactsStatus.Loading,
        errorMessage: null,
      });

      try {
        const [permissionState, selectedContacts] = await Promise.all([
          getDeviceContactsPermissionState(),
          loadStoredEmergencyContacts(),
        ]);

        set({
          status: EmergencyContactsStatus.Ready,
          permissionState,
          selectedContacts,
        });
      } catch {
        set({
          status: EmergencyContactsStatus.Error,
          errorMessage:
            'Gespeicherte Telefonkontakte konnten nicht geladen werden.',
        });
      }
    },

    refreshPermissionState: async () => {
      try {
        const permissionState = await getDeviceContactsPermissionState();

        set({
          permissionState,
        });
      } catch {
        set({
          permissionState: 'undetermined',
        });
      }
    },

    requestPermissionAndLoadContacts: async () => {
      set({
        status: EmergencyContactsStatus.Loading,
        errorMessage: null,
      });

      try {
        const permissionState = await requestDeviceContactsPermission();

        if (permissionState !== 'granted') {
          set({
            status: EmergencyContactsStatus.Ready,
            permissionState,
            availableContacts: [],
          });
          return;
        }

        const availableContacts =
          await loadDeviceEmergencyContactCandidates({
            forceRefresh: true,
          });

        set({
          status: EmergencyContactsStatus.Ready,
          permissionState,
          availableContacts,
        });
      } catch {
        set({
          status: EmergencyContactsStatus.Error,
          errorMessage:
            'Telefonbuchkontakte konnten nicht geladen werden.',
        });
      }
    },

    loadAvailableContacts: async (options = {}) => {
      set({
        status: EmergencyContactsStatus.Loading,
        errorMessage: null,
      });

      try {
        const permissionState = await getDeviceContactsPermissionState();

        if (permissionState !== 'granted') {
          set({
            status: EmergencyContactsStatus.Ready,
            permissionState,
            availableContacts: [],
          });
          return;
        }

        const availableContacts =
          await loadDeviceEmergencyContactCandidates({
            forceRefresh: options.forceRefresh === true,
          });

        set({
          status: EmergencyContactsStatus.Ready,
          permissionState,
          availableContacts,
        });
      } catch {
        set({
          status: EmergencyContactsStatus.Error,
          errorMessage:
            'Telefonbuchkontakte konnten nicht geladen werden.',
        });
      }
    },

    toggleSelectedContact: async (contact) => {
      const state = get();
      const selectedContacts = hasSelectedContact(
        state.selectedContacts,
        contact.id,
      )
        ? state.selectedContacts.filter(
            (selectedContact) => selectedContact.id !== contact.id,
          )
        : [...state.selectedContacts, toStoredEmergencyContact(contact)];

      set({
        status: EmergencyContactsStatus.Saving,
        errorMessage: null,
      });

      try {
        await saveStoredEmergencyContacts(selectedContacts);

        set({
          status: EmergencyContactsStatus.Ready,
          selectedContacts,
        });
      } catch {
        set({
          status: EmergencyContactsStatus.Error,
          errorMessage:
            'Telefonkontakte konnten nicht gespeichert werden.',
        });
      }
    },

    setSelectedContactAtSlot: async (slotIndex, contact) => {
      const safeSlotIndex = Math.max(0, Math.min(2, Math.floor(slotIndex)));
      const state = get();
      const storedContact = toStoredEmergencyContact(contact);
      const selectedContacts = [...state.selectedContacts];

      selectedContacts[safeSlotIndex] = storedContact;

      const cleanedSelectedContacts = selectedContacts
        .slice(0, 3)
        .filter((selectedContact) => selectedContact !== undefined);

      set({
        status: EmergencyContactsStatus.Saving,
        errorMessage: null,
      });

      try {
        await saveStoredEmergencyContacts(cleanedSelectedContacts);

        set({
          status: EmergencyContactsStatus.Ready,
          selectedContacts: cleanedSelectedContacts,
        });
      } catch {
        set({
          status: EmergencyContactsStatus.Error,
          errorMessage:
            'Telefonkontakt konnte nicht gespeichert werden.',
        });
      }
    },

    removeSelectedContactAtSlot: async (slotIndex) => {
      const safeSlotIndex = Math.max(0, Math.min(2, Math.floor(slotIndex)));
      const state = get();
      const selectedContacts = state.selectedContacts.filter(
        (_contact, index) => index !== safeSlotIndex,
      );

      set({
        status: EmergencyContactsStatus.Saving,
        errorMessage: null,
      });

      try {
        await saveStoredEmergencyContacts(selectedContacts);

        set({
          status: EmergencyContactsStatus.Ready,
          selectedContacts,
        });
      } catch {
        set({
          status: EmergencyContactsStatus.Error,
          errorMessage:
            'Telefonkontakt konnte nicht entfernt werden.',
        });
      }
    },

    removeSelectedContact: async (contactId) => {
      const state = get();
      const selectedContacts = state.selectedContacts.filter(
        (contact) => contact.id !== contactId,
      );

      set({
        status: EmergencyContactsStatus.Saving,
        errorMessage: null,
      });

      try {
        await saveStoredEmergencyContacts(selectedContacts);

        set({
          status: EmergencyContactsStatus.Ready,
          selectedContacts,
        });
      } catch {
        set({
          status: EmergencyContactsStatus.Error,
          errorMessage:
            'Telefonkontakte konnten nicht gespeichert werden.',
        });
      }
    },

    clearError: () => {
      set({
        errorMessage: null,
      });
    },

    resetEmergencyContactsState: () => {
      set({
        status: EmergencyContactsStatus.Idle,
        permissionState: 'undetermined',
        availableContacts: [],
        selectedContacts: [],
        errorMessage: null,
      });
    },
  }));
