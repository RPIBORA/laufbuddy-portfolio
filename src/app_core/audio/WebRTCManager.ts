import {
  RTCPeerConnection,
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  addDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getFirebaseAuth } from '../../services/firebaseAuthService';
import {
  pauseNativeHotwordForWebRtc,
  resumeNativeHotwordAfterWebRtc,
} from '../../services/laufBuddyHotwordControlService';
import { useBuddyAudioStore } from '../../state/buddyAudioStore';

type IceCandidateEventLike = {
  candidate: {
    toJSON: () => unknown;
  } | null;
};

type PeerConnectionWithRuntimeEvents = RTCPeerConnection & {
  ontrack: (() => void) | null;
  onicecandidate: ((event: IceCandidateEventLike) => void) | null;
  onconnectionstatechange: (() => void) | null;
  oniceconnectionstatechange: (() => void) | null;
  connectionState?: string;
  iceConnectionState?: string;
  currentRemoteDescription?: unknown;
};

export class WebRTCManager {
  peerConnection: RTCPeerConnection | null = null;
  localStream: MediaStream | null = null;
  roomId: string | null = null;

  private isCleaningUp = false;
  private firestoreUnsubscribers: Array<() => void> = [];

  private configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  async startLocalAudio() {
    if (this.localStream || this.peerConnection) {
      await this.cleanup();
    }

    try {
      await pauseNativeHotwordForWebRtc();

      const audioConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true,
          googAudioMirroring: false,
        },
        video: false,
      } as unknown as Parameters<typeof mediaDevices.getUserMedia>[0];

      this.localStream = await mediaDevices.getUserMedia(audioConstraints);
      console.log('🚀 Aggressives Audio-Filtering aktiviert (Optimiert für Outdoor)');
      return this.localStream;
    } catch (error) {
      console.error('❌ Fehler beim Mikrofon-Zugriff:', error);
      await resumeNativeHotwordAfterWebRtc().catch(() => undefined);
      useBuddyAudioStore.getState().setAudioError(
        error instanceof Error ? error.message : 'Mikrofon konnte nicht geöffnet werden.',
      );
      return null;
    }
  }

  setupPeerConnection() {
    this.peerConnection = new RTCPeerConnection(this.configuration);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, this.localStream!);
      });
    }

    const peerConnectionWithEvents =
      this.peerConnection as PeerConnectionWithRuntimeEvents;

    peerConnectionWithEvents.ontrack = () => {
      console.log('🎧 Audio vom Buddy empfangen!');
    };

    peerConnectionWithEvents.onconnectionstatechange = () => {
      this.handleConnectionStateChange('connectionState');
    };

    peerConnectionWithEvents.oniceconnectionstatechange = () => {
      this.handleConnectionStateChange('iceConnectionState');
    };

    return this.peerConnection;
  }

  private handleConnectionStateChange(source: string): void {
    if (!this.peerConnection) {
      return;
    }

    const peerConnectionWithEvents =
      this.peerConnection as PeerConnectionWithRuntimeEvents;

    const connectionState = peerConnectionWithEvents.connectionState;
    const iceConnectionState = peerConnectionWithEvents.iceConnectionState;

    console.log('🔊 WebRTC Verbindungsstatus geändert', {
      source,
      connectionState,
      iceConnectionState,
    });

    const shouldReleaseMicrophone =
      connectionState === 'failed' ||
      connectionState === 'disconnected' ||
      connectionState === 'closed' ||
      iceConnectionState === 'failed' ||
      iceConnectionState === 'disconnected' ||
      iceConnectionState === 'closed';

    if (!shouldReleaseMicrophone) {
      if (connectionState === 'connected') {
        useBuddyAudioStore.getState().setConnected(this.roomId ?? 'unknown');
      }
      return;
    }

    void this.cleanup();
  }

  async createCall(customRoomId: string) {
    this.setupPeerConnection();

    if (!this.peerConnection) {
      await resumeNativeHotwordAfterWebRtc();
      return null;
    }

    const peerConnectionWithEvents =
      this.peerConnection as PeerConnectionWithRuntimeEvents;

    const roomRef = doc(db, 'rooms', customRoomId);
    this.roomId = customRoomId;
    useBuddyAudioStore.getState().startAudioSession(customRoomId);

    const callerCandidatesCollection = collection(roomRef, 'callerCandidates');

    peerConnectionWithEvents.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = event.candidate.toJSON() as Record<string, unknown>;
        const authorUid = getFirebaseAuth().currentUser?.uid;
        if (!authorUid) return;
        void addDoc(callerCandidatesCollection, {
          authorUid,
          candidate: typeof candidate.candidate === 'string' ? candidate.candidate : '',
          sdpMid: typeof candidate.sdpMid === 'string' ? candidate.sdpMid : null,
          sdpMLineIndex: typeof candidate.sdpMLineIndex === 'number' ? candidate.sdpMLineIndex : null,
          usernameFragment: typeof candidate.usernameFragment === 'string' ? candidate.usernameFragment : null,
        });
      }
    };

    const offer = await this.peerConnection.createOffer({});
    await this.peerConnection.setLocalDescription(offer);

    const roomWithOffer = {
      offer: { type: offer.type, sdp: offer.sdp },
    };

    await updateDoc(roomRef, roomWithOffer);

    this.firestoreUnsubscribers.push(onSnapshot(roomRef, async (snapshot) => {
      const data = snapshot.data();

      if (data?.closedAt) {
        void this.cleanup();
        return;
      }

      if (
        !peerConnectionWithEvents.currentRemoteDescription &&
        data &&
        data.answer
      ) {
        const rtcSessionDescription = new RTCSessionDescription(data.answer);
        await this.peerConnection?.setRemoteDescription(rtcSessionDescription);
      }
    }));

    const calleeCandidatesCollection = collection(roomRef, 'calleeCandidates');

    this.firestoreUnsubscribers.push(onSnapshot(calleeCandidatesCollection, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          void this.peerConnection?.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    }));

    return this.roomId;
  }

  async joinCall(roomId: string) {
    this.setupPeerConnection();

    if (!this.peerConnection) {
      await resumeNativeHotwordAfterWebRtc();
      return;
    }

    const peerConnectionWithEvents =
      this.peerConnection as PeerConnectionWithRuntimeEvents;

    this.roomId = roomId;
    useBuddyAudioStore.getState().startAudioSession(roomId);

    const roomRef = doc(db, 'rooms', roomId);
    const roomSnapshot = await getDoc(roomRef);

    if (!roomSnapshot.exists()) {
      console.error('❌ Raum existiert nicht oder ist nicht freigegeben!');
      await this.cleanup();
      return;
    }

    const calleeCandidatesCollection = collection(roomRef, 'calleeCandidates');

    peerConnectionWithEvents.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = event.candidate.toJSON() as Record<string, unknown>;
        const authorUid = getFirebaseAuth().currentUser?.uid;
        if (!authorUid) return;
        void addDoc(calleeCandidatesCollection, {
          authorUid,
          candidate: typeof candidate.candidate === 'string' ? candidate.candidate : '',
          sdpMid: typeof candidate.sdpMid === 'string' ? candidate.sdpMid : null,
          sdpMLineIndex: typeof candidate.sdpMLineIndex === 'number' ? candidate.sdpMLineIndex : null,
          usernameFragment: typeof candidate.usernameFragment === 'string' ? candidate.usernameFragment : null,
        });
      }
    };

    let offer = roomSnapshot.data().offer;
    if (!offer) {
      offer = await new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          reject(new Error('Das Angebot des Buddys ist nicht rechtzeitig verfügbar.'));
        }, 30_000);
        const unsubscribe = onSnapshot(roomRef, (snapshot) => {
          const data = snapshot.data();
          if (data?.closedAt) {
            clearTimeout(timeout);
            unsubscribe();
            reject(new Error('Der Buddy-Raum wurde geschlossen.'));
            return;
          }
          if (data?.offer) {
            clearTimeout(timeout);
            unsubscribe();
            resolve(data.offer);
          }
        }, (error) => {
          clearTimeout(timeout);
          unsubscribe();
          reject(error);
        });
      });
    }
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(offer),
    );

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    const roomWithAnswer = {
      answer: { type: answer.type, sdp: answer.sdp },
    };

    await updateDoc(roomRef, roomWithAnswer);

    this.firestoreUnsubscribers.push(onSnapshot(roomRef, (snapshot) => {
      if (snapshot.data()?.closedAt) void this.cleanup();
    }));

    const callerCandidatesCollection = collection(roomRef, 'callerCandidates');

    this.firestoreUnsubscribers.push(onSnapshot(callerCandidatesCollection, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          void this.peerConnection?.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    }));
  }

  async cleanup() {
    if (this.isCleaningUp) {
      return;
    }

    this.isCleaningUp = true;

    try {
      for (const unsubscribe of this.firestoreUnsubscribers) {
        unsubscribe();
      }
      this.firestoreUnsubscribers = [];

      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }

      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => track.stop());
        this.localStream = null;
      }

      await resumeNativeHotwordAfterWebRtc();
      useBuddyAudioStore.getState().endAudioSession();
    } finally {
      this.isCleaningUp = false;
    }
  }
}

export const buddyWebRTCManager = new WebRTCManager();
