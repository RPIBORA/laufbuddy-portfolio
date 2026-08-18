// src/state/audioControlStore.ts
import { create } from 'zustand';
import { AudioControlStatus } from './audioControlStatus';

interface AudioControlStoreState {
  status: AudioControlStatus;
  focusHeld: boolean;
  duckingActive: boolean;
  conversationStartedAt: string | null;
  focusReleasedAt: string | null;

  allowMusic: () => void;
  duckMusic: () => void;
  startBuddyConversation: () => void;
  releaseAudioFocus: () => void;
  resetAudioControl: () => void;
}

export const useAudioControlStore = create<AudioControlStoreState>((set) => ({
  status: AudioControlStatus.AudioFocusReleased,
  focusHeld: false,
  duckingActive: false,
  conversationStartedAt: null,
  focusReleasedAt: new Date().toISOString(),

  allowMusic: () => {
    set({
      status: AudioControlStatus.MusicAllowed,
      focusHeld: false,
      duckingActive: false,
    });
  },

  duckMusic: () => {
    set({
      status: AudioControlStatus.MusicDucked,
      focusHeld: true,
      duckingActive: true,
    });
  },

  startBuddyConversation: () => {
    set({
      status: AudioControlStatus.BuddyConversationActive,
      focusHeld: true,
      duckingActive: true,
      conversationStartedAt: new Date().toISOString(),
    });
  },

  releaseAudioFocus: () => {
    set({
      status: AudioControlStatus.AudioFocusReleased,
      focusHeld: false,
      duckingActive: false,
      focusReleasedAt: new Date().toISOString(),
    });
  },

  resetAudioControl: () => {
    set({
      status: AudioControlStatus.AudioFocusReleased,
      focusHeld: false,
      duckingActive: false,
      conversationStartedAt: null,
      focusReleasedAt: null,
    });
  },
}));