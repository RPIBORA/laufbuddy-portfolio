import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../app_core/firebase';
import {
  awaitBuddyInvitationResult,
  BUDDY_INVITATION_TIMEOUT_MS,
} from './buddyInvitationTimeout';

const functions = getFunctions(app, 'us-central1');

type CreateInvitationResult = {
  invitationId: string;
  token: string;
  expiresAtMs: number;
};

type AcceptInvitationResult = {
  roomId: string;
  role: 'callee';
  buddyUid: string;
};

function readableCallableError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Die Buddy-Einladung konnte nicht verarbeitet werden.';
}

export async function createBuddyInvitation(): Promise<CreateInvitationResult> {
  try {
    const callable = httpsCallable<undefined, CreateInvitationResult>(
      functions,
      'createBuddyInvitation',
      { timeout: BUDDY_INVITATION_TIMEOUT_MS },
    );
    return (await awaitBuddyInvitationResult(callable())).data;
  } catch (error) {
    throw new Error(readableCallableError(error));
  }
}

export async function acceptBuddyInvitation(token: string): Promise<AcceptInvitationResult> {
  try {
    const callable = httpsCallable<{ token: string }, AcceptInvitationResult>(
      functions,
      'acceptBuddyInvitation',
    );
    return (await awaitBuddyInvitationResult(callable({ token }))).data;
  } catch (error) {
    throw new Error(readableCallableError(error));
  }
}

export async function startBuddyConnection(buddyUid: string): Promise<{ roomId: string; role: 'caller'; buddyUid: string }> {
  try {
    const callable = httpsCallable<{ buddyUid: string }, { roomId: string; role: 'caller'; buddyUid: string }>(
      functions,
      'startBuddyConnection',
      { timeout: BUDDY_INVITATION_TIMEOUT_MS },
    );
    return (await awaitBuddyInvitationResult(callable({ buddyUid }))).data;
  } catch (error) {
    throw new Error(readableCallableError(error));
  }
}

export async function removeBuddyRelationship(buddyUid: string): Promise<void> {
  try {
    const callable = httpsCallable<{ buddyUid: string }, { removed: boolean }>(
      functions,
      'removeBuddyRelationship',
      { timeout: BUDDY_INVITATION_TIMEOUT_MS },
    );
    await awaitBuddyInvitationResult(callable({ buddyUid }));
  } catch (error) {
    throw new Error(readableCallableError(error));
  }
}

export async function closeBuddyRoom(roomId: string): Promise<void> {
  try {
    const callable = httpsCallable<{ roomId: string }, { closed: boolean }>(
      functions,
      'closeBuddyRoom',
    );
    await callable({ roomId });
  } catch (error) {
    throw new Error(readableCallableError(error));
  }
}
