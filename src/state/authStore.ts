// src/state/authStore.ts
import { create } from 'zustand';
import { User } from '../models/User';
import { AuthState } from './authState';
import { AuthStatus } from './authStatus';

interface AuthStore extends AuthState {
  beginAuthCheck: () => void;
  markAuthenticated: (user: User) => void;
  markUnauthenticated: () => void;
  signOutLocal: () => void;
  resetAuthState: () => void;
}

const initialAuthState: AuthState = {
  user: null,
  status: AuthStatus.Loading,
};

export const useAuthStore = create<AuthStore>((set) => ({
  ...initialAuthState,

  beginAuthCheck: () => {
    set({
      user: null,
      status: AuthStatus.Loading,
    });
  },

  markAuthenticated: (user) => {
    set({
      user,
      status: AuthStatus.Authenticated,
    });
  },

  markUnauthenticated: () => {
    set({
      user: null,
      status: AuthStatus.Unauthenticated,
    });
  },

  signOutLocal: () => {
    set({
      user: null,
      status: AuthStatus.Unauthenticated,
    });
  },

  resetAuthState: () => {
    set({
      user: null,
      status: AuthStatus.Loading,
    });
  },
}));