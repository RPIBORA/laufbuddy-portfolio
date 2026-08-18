// src/state/sessionStore.ts
import { create } from 'zustand';
import { Session } from '../models/Session';
import { SessionStatus } from './sessionStatus';

interface SessionStoreState {
  session: Session | null;
  status: SessionStatus;
  startSession: (session: Session, startedAt: string) => void;
  endSession: (endedAt: string) => void;
  resetSession: () => void;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  session: null,
  status: SessionStatus.Idle,

  startSession: (session, startedAt) => {
    if (get().status !== SessionStatus.Idle) {
      return;
    }

    set({
      session: {
        ...session,
        startedAt,
      },
      status: SessionStatus.Active,
    });
  },

  endSession: (endedAt) => {
    if (get().status !== SessionStatus.Active) {
      return;
    }

    const currentSession = get().session;
    if (!currentSession) {
      return;
    }

    set({
      session: {
        ...currentSession,
        endedAt,
      },
      status: SessionStatus.Ended,
    });
  },

  resetSession: () => {
    set({
      session: null,
      status: SessionStatus.Idle,
    });
  },
}));