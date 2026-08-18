export type InvitationState = {
  inviterUid: string;
  expiresAtMs: number;
  acceptedAtMs: number | null;
};

export const BUDDY_INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

export function createInvitationExpirationMs(createdAtMs: number): number {
  return createdAtMs + BUDDY_INVITATION_TTL_MS;
}

export type InvitationAcceptanceError =
  | 'self-acceptance'
  | 'already-accepted'
  | 'expired';

export function isValidInvitationToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function validateInvitationAcceptance(params: {
  invitation: InvitationState;
  acceptingUid: string;
  nowMs: number;
}): InvitationAcceptanceError | null {
  if (params.invitation.inviterUid === params.acceptingUid) {
    return 'self-acceptance';
  }

  if (params.invitation.acceptedAtMs !== null) {
    return 'already-accepted';
  }

  if (params.invitation.expiresAtMs <= params.nowMs) {
    return 'expired';
  }

  return null;
}
