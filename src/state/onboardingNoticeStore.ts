// src/state/onboardingNoticeStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { OnboardingNoticeStatus } from './onboardingNoticeStatus';

const STORAGE_KEY = 'laufbuddy.onboardingNoticeStatus';

interface OnboardingNoticeStoreState {
  status: OnboardingNoticeStatus;
  isOverlayVisibleThisSession: boolean;
  loadedAt: string | null;
  dismissedAt: string | null;

  loadOnboardingNoticeStatus: () => Promise<void>;
  showForThisSession: () => void;
  dismissForThisSession: () => void;
  dismissPermanently: () => Promise<void>;
  resetOnboardingNoticeState: () => Promise<void>;
}

export const useOnboardingNoticeStore = create<OnboardingNoticeStoreState>((set) => ({
  status: OnboardingNoticeStatus.Visible,
  isOverlayVisibleThisSession: true,
  loadedAt: null,
  dismissedAt: null,

  loadOnboardingNoticeStatus: async () => {
    const storedStatus = await AsyncStorage.getItem(STORAGE_KEY);
    const isDismissed = storedStatus === OnboardingNoticeStatus.Dismissed;

    set({
      status: isDismissed
        ? OnboardingNoticeStatus.Dismissed
        : OnboardingNoticeStatus.Visible,
      isOverlayVisibleThisSession: !isDismissed,
      loadedAt: new Date().toISOString(),
      dismissedAt: isDismissed ? new Date().toISOString() : null,
    });
  },

  showForThisSession: () => {
    set((state) => {
      if (state.status === OnboardingNoticeStatus.Dismissed) {
        return state;
      }

      return {
        isOverlayVisibleThisSession: true,
      };
    });
  },

  dismissForThisSession: () => {
    set((state) => {
      if (state.status === OnboardingNoticeStatus.Dismissed) {
        return state;
      }

      return {
        isOverlayVisibleThisSession: false,
      };
    });
  },

  dismissPermanently: async () => {
    await AsyncStorage.setItem(STORAGE_KEY, OnboardingNoticeStatus.Dismissed);

    set({
      status: OnboardingNoticeStatus.Dismissed,
      isOverlayVisibleThisSession: false,
      dismissedAt: new Date().toISOString(),
    });
  },

  resetOnboardingNoticeState: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);

    set({
      status: OnboardingNoticeStatus.Visible,
      isOverlayVisibleThisSession: true,
      loadedAt: null,
      dismissedAt: null,
    });
  },
}));
