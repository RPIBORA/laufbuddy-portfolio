import { create } from 'zustand';
import {
  loadStoredBOSEmergencyNumber,
  saveStoredBOSEmergencyNumber,
} from '../services/bosEmergencyNumberStorageService';

interface BOSEmergencyNumberStoreState {
  value: string;
  savedValue: string | null;
  isLoading: boolean;
  isSaving: boolean;
  errorMessage: string | null;

  loadStoredNumber: () => Promise<void>;
  setValue: (value: string) => void;
  saveValue: () => Promise<void>;
  clearError: () => void;
  resetBOSEmergencyNumberState: () => void;
}

export const useBOSEmergencyNumberStore =
  create<BOSEmergencyNumberStoreState>((set, get) => ({
    value: '',
    savedValue: null,
    isLoading: false,
    isSaving: false,
    errorMessage: null,

    loadStoredNumber: async () => {
      set({
        isLoading: true,
        errorMessage: null,
      });

      try {
        const storedNumber = await loadStoredBOSEmergencyNumber();

        set({
          value: storedNumber ?? '',
          savedValue: storedNumber,
          isLoading: false,
        });
      } catch {
        set({
          isLoading: false,
          errorMessage: 'BOS-Nummer konnte nicht geladen werden.',
        });
      }
    },

    setValue: (value) => {
      set({
        value,
      });
    },

    saveValue: async () => {
      const currentValue = get().value;

      set({
        isSaving: true,
        errorMessage: null,
      });

      try {
        const savedValue = await saveStoredBOSEmergencyNumber(currentValue);

        set({
          value: savedValue,
          savedValue,
          isSaving: false,
        });
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : 'BOS-Nummer konnte nicht gespeichert werden.';

        set({
          isSaving: false,
          errorMessage: message,
        });
      }
    },

    clearError: () => {
      set({
        errorMessage: null,
      });
    },

    resetBOSEmergencyNumberState: () => {
      set({
        value: '',
        savedValue: null,
        isLoading: false,
        isSaving: false,
        errorMessage: null,
      });
    },
  }));