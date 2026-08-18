import { create } from 'zustand';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from '../../state/authStore';
import {
  acceptBuddyInvitation,
  closeBuddyRoom,
  createBuddyInvitation,
  startBuddyConnection,
} from '../../services/buddyInvitationService';

type InvitationDocument = {
  acceptedByUid?: string | null;
  roomId?: string | null;
};

type BuddyRole = 'caller' | 'callee' | null;

type BuddyStatusState = {
  // Kept as a UI compatibility field; it is an opaque invitation token, never an ID.
  myBuddyId: string;
  buddyConnected: boolean;
  buddyName: string;
  connectionStatus: string;
  roomId: string | null;
  role: BuddyRole;
  isConnecting: boolean;
  connectedBuddyUid: string | null;
  connectedBuddyEmail: string | null;
  connectedBuddyUsername: string | null;
  connectedBuddyDisplayName: string | null;
  connectedBuddyCode: string | null;
  setBuddyConnected: (buddyConnected: boolean, buddyName?: string) => void;
  setConnectionStatus: (connectionStatus: string) => void;
  initBuddySession: () => Promise<void>;
  createInvitation: () => Promise<string>;
  connectToBuddy: (token: string) => Promise<boolean>;
  connectToSavedBuddy: (buddyUid: string) => Promise<boolean>;
  disconnectBuddy: () => Promise<void>;
  _unsubscribeListener: (() => void) | null;
};

function resetConnectionState() {
  return {
    myBuddyId: '',
    buddyConnected: false,
    buddyName: 'Niemand',
    connectionStatus: 'Bereit für eine Buddy-Einladung.',
    roomId: null,
    role: null as BuddyRole,
    isConnecting: false,
    connectedBuddyUid: null,
    connectedBuddyEmail: null,
    connectedBuddyUsername: null,
    connectedBuddyDisplayName: null,
    connectedBuddyCode: null,
    _unsubscribeListener: null,
  };
}

export const useBuddyStatus = create<BuddyStatusState>((set, get) => ({
  ...resetConnectionState(),

  setBuddyConnected: (buddyConnected, buddyName) => {
    set({ buddyConnected, buddyName: buddyConnected ? buddyName ?? get().buddyName : 'Niemand' });
  },

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  initBuddySession: async () => {
    if (!useAuthStore.getState().user?.uid) {
      set({ connectionStatus: 'Für Buddy-Verbindungen ist eine Anmeldung erforderlich.' });
      return;
    }
    if (!get().buddyConnected && !get().isConnecting) {
      set({ connectionStatus: 'Bereit für eine Buddy-Einladung.' });
    }
  },

  createInvitation: async () => {
    const currentUid = useAuthStore.getState().user?.uid;
    if (!currentUid) throw new Error('Für Buddy-Verbindungen ist eine Anmeldung erforderlich.');

    get()._unsubscribeListener?.();
    set({ isConnecting: true, connectionStatus: 'Sichere Einladung wird erstellt.' });
    try {
      const invitation = await createBuddyInvitation();
      const invitationRef = doc(db, 'buddy_invitations', invitation.invitationId);
      const unsubscribe = onSnapshot(invitationRef, (snapshot) => {
        const data = snapshot.data() as InvitationDocument | undefined;
        if (!data?.roomId || !data.acceptedByUid) return;
        set({
          connectionStatus: 'LaufBuddy-Verknüpfung erstellt.',
          isConnecting: false,
          connectedBuddyUid: data.acceptedByUid,
        });
      }, () => set({ connectionStatus: 'Einladungsstatus konnte nicht abgerufen werden.' }));
      set({
        myBuddyId: invitation.token,
        connectionStatus: 'Einladung ist 24 Stunden gültig.',
        isConnecting: false,
        _unsubscribeListener: unsubscribe,
      });
      return invitation.token;
    } catch (error) {
      set({ connectionStatus: 'Einladung konnte nicht erstellt werden.' });
      throw error;
    } finally {
      set({ isConnecting: false });
    }
  },

  connectToBuddy: async (token) => {
    if (get().isConnecting || get().buddyConnected || !token.trim()) return false;
    set({ isConnecting: true, connectionStatus: 'Sichere Einladung wird geprüft.' });
    try {
      const accepted = await acceptBuddyInvitation(token.trim());
      set({
        connectionStatus: 'LaufBuddy-Verknüpfung erstellt.',
        isConnecting: false,
        connectedBuddyUid: accepted.buddyUid,
      });
      return true;
    } catch (error) {
      set({ isConnecting: false, connectionStatus: error instanceof Error ? error.message : 'Einladung konnte nicht angenommen werden.' });
      return false;
    }
  },

  connectToSavedBuddy: async (buddyUid) => {
    if (get().isConnecting || get().buddyConnected || !buddyUid.trim()) return false;
    set({ isConnecting: true, connectionStatus: 'Buddy-Verbindung wird vorbereitet.' });
    try {
      const connection = await startBuddyConnection(buddyUid.trim());
      set({
        buddyConnected: true,
        buddyName: 'Dein LaufBuddy',
        connectionStatus: 'Verbunden. Audio wird vorbereitet.',
        roomId: connection.roomId,
        role: connection.role,
        isConnecting: false,
        connectedBuddyUid: connection.buddyUid,
      });
      return true;
    } catch (error) {
      set({ isConnecting: false, connectionStatus: error instanceof Error ? error.message : 'Buddy-Verbindung konnte nicht hergestellt werden.' });
      return false;
    }
  },

  disconnectBuddy: async () => {
    const { roomId, _unsubscribeListener } = get();
    _unsubscribeListener?.();
    if (roomId) await closeBuddyRoom(roomId).catch(() => undefined);
    set(resetConnectionState());
  },
}));
