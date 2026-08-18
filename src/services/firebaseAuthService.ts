// src/services/firebaseAuthService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import * as firebaseAuthModule from 'firebase/auth';
import {
  Auth,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import {
  Firestore,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { app } from '../app_core/firebase';
import { User } from '../models/User';

export interface RegisterWithEmailParams {
  email: string;
  password: string;
}

export interface LoginWithEmailParams {
  email: string;
  password: string;
}

export type AuthStateListener = (user: User | null) => void;

type FirebaseAuthModuleWithReactNativePersistence = typeof firebaseAuthModule & {
  getReactNativePersistence?: (storage: typeof AsyncStorage) => unknown;
};

function createFirebaseAuth(): Auth {
  try {
    const authModule =
      firebaseAuthModule as FirebaseAuthModuleWithReactNativePersistence;

    if (!authModule.getReactNativePersistence) {
      return getAuth(app);
    }

    return initializeAuth(app, {
      persistence: authModule.getReactNativePersistence(AsyncStorage),
    } as unknown as Parameters<typeof initializeAuth>[1]);
  } catch (error) {
    return getAuth(app);
  }
}

const auth: Auth = createFirebaseAuth();
const firestore: Firestore = getFirestore(app);

const GOOGLE_WEB_CLIENT_ID =
  "862089167524-rkn78tjhg68absgogefkrof7td773psi.apps.googleusercontent.com";

let googleSignInConfigured = false;

function ensureGoogleSignInConfigured(): void {
  if (googleSignInConfigured) {
    return;
  }

  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });

  googleSignInConfigured = true;
}

function normalizeUsername(username: string | null | undefined): string | null {
  if (!username) {
    return null;
  }

  const trimmedUsername = username.trim();

  if (!trimmedUsername) {
    return null;
  }

  return trimmedUsername;
}

function normalizeBuddyCode(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim().toUpperCase();

  if (!trimmedValue) {
    return null;
  }

  return trimmedValue;
}

function generateBuddyCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'LB-';

  for (let i = 0; i < 6; i += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return code;
}

function mapFirebaseUser(
  firebaseUser: FirebaseUser,
  username: string | null = null,
  buddyCode: string | null = null,
): User {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    username,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    phoneNumber: firebaseUser.phoneNumber,
    buddyCode,
  };
}

function buildUserProfilePayload(firebaseUser: FirebaseUser) {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    phoneNumber: firebaseUser.phoneNumber,
  };
}

async function getStoredUserProfileFields(
  uid: string,
): Promise<{ username: string | null; buddyCode: string | null }> {
  const userSnapshot = await getDoc(doc(firestore, 'users', uid));

  if (!userSnapshot.exists()) {
    return {
      username: null,
      buddyCode: null,
    };
  }

  const data = userSnapshot.data();

  return {
    username: normalizeUsername(data.username),
    buddyCode: normalizeBuddyCode(data.buddyCode),
  };
}

async function syncFirestoreUserDocument(
  firebaseUser: FirebaseUser,
  options: { isNewUser: boolean },
): Promise<{ username: string | null; buddyCode: string | null }> {
  const userRef = doc(firestore, 'users', firebaseUser.uid);
  const userSnapshot = await getDoc(userRef);
  const existingData = userSnapshot.exists() ? userSnapshot.data() : null;
  const existingUsername = normalizeUsername(existingData?.username);
  const existingBuddyCode = normalizeBuddyCode(existingData?.buddyCode);
  const nextBuddyCode = existingBuddyCode ?? generateBuddyCode();

  const payload: Record<string, unknown> = {
    ...buildUserProfilePayload(firebaseUser),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    buddyCode: nextBuddyCode,
  };

  const hasCreatedAt = !!existingData?.createdAt;
  const hasUsernameField =
    !!existingData &&
    Object.prototype.hasOwnProperty.call(existingData, 'username');

  if (options.isNewUser || !hasCreatedAt) {
    payload.createdAt = serverTimestamp();
  }

  if (!hasUsernameField) {
    payload.username = null;
  }

  await setDoc(userRef, payload, { merge: true });

  return {
    username: existingUsername,
    buddyCode: nextBuddyCode,
  };
}

async function buildUserFromFirebase(firebaseUser: FirebaseUser): Promise<User> {
  const { username, buddyCode } = await getStoredUserProfileFields(
    firebaseUser.uid,
  );

  return mapFirebaseUser(firebaseUser, username, buddyCode);
}

export function getFirebaseAuth(): Auth {
  return auth;
}

export function subscribeToAuthState(
  listener: AuthStateListener,
): () => void {
  return onAuthStateChanged(auth, (firebaseUser) => {
    if (!firebaseUser) {
      listener(null);
      return;
    }

    void buildUserFromFirebase(firebaseUser)
      .then((user) => {
        listener(user);
      })
      .catch(() => {
        listener(mapFirebaseUser(firebaseUser, null, null));
      });
  });
}

export async function registerWithEmail(
  params: RegisterWithEmailParams,
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(
    auth,
    params.email,
    params.password,
  );

  const { username, buddyCode } = await syncFirestoreUserDocument(
    credential.user,
    {
      isNewUser: true,
    },
  );

  return mapFirebaseUser(credential.user, username, buddyCode);
}

export async function loginWithEmail(
  params: LoginWithEmailParams,
): Promise<User> {
  const credential = await signInWithEmailAndPassword(
    auth,
    params.email,
    params.password,
  );

  const { username, buddyCode } = await syncFirestoreUserDocument(
    credential.user,
    {
      isNewUser: false,
    },
  );

  return mapFirebaseUser(credential.user, username, buddyCode);
}

export async function requestPasswordReset(email: string): Promise<void> {
  auth.languageCode = 'de';
  await sendPasswordResetEmail(auth, email);
}

export async function loginWithGoogle(): Promise<User> {
  ensureGoogleSignInConfigured();

  await GoogleSignin.hasPlayServices({
    showPlayServicesUpdateDialog: true,
  });

  const googleSignInResponse = await GoogleSignin.signIn();

  if (!isSuccessResponse(googleSignInResponse)) {
    throw new Error("Google-Anmeldung wurde abgebrochen.");
  }

  const idToken = googleSignInResponse.data.idToken;

  if (!idToken) {
    throw new Error("Google-Anmeldung konnte kein ID-Token liefern.");
  }

  const credential = GoogleAuthProvider.credential(idToken);
  const firebaseCredential = await signInWithCredential(auth, credential);

  const { username, buddyCode } = await syncFirestoreUserDocument(
    firebaseCredential.user,
    {
      isNewUser: false,
    },
  );

  return mapFirebaseUser(firebaseCredential.user, username, buddyCode);
}

export async function updateCurrentUserUsername(
  username: string,
): Promise<User> {
  const firebaseUser = auth.currentUser;

  if (!firebaseUser) {
    throw new Error('Kein eingeloggter User gefunden.');
  }

  const normalizedUsername = normalizeUsername(username);
  const { buddyCode } = await getStoredUserProfileFields(firebaseUser.uid);

  await setDoc(
    doc(firestore, 'users', firebaseUser.uid),
    {
      username: normalizedUsername,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return mapFirebaseUser(firebaseUser, normalizedUsername, buddyCode);
}

export async function signOutCurrentUser(): Promise<void> {
  await signOut(auth);
}
