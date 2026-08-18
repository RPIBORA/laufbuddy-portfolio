import { create } from 'zustand';

type AppStatusState = {
  premiumUnlocked: boolean;
  premiumUntil: string;
  unlockSource: string;
  setPremiumUnlock: (premiumUntil: string, unlockSource: string) => void;
  resetPremiumUnlock: () => void;
};

export const useAppStatus = create<AppStatusState>((set) => ({
  premiumUnlocked: false,
  premiumUntil: '-',
  unlockSource: 'Keine Freischaltung aktiv',

  setPremiumUnlock: (premiumUntil, unlockSource) =>
    set({
      premiumUnlocked: true,
      premiumUntil,
      unlockSource,
    }),

  resetPremiumUnlock: () =>
    set({
      premiumUnlocked: false,
      premiumUntil: '-',
      unlockSource: 'Keine Freischaltung aktiv',
    }),
}));