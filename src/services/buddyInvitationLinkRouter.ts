import { parseBuddyInvitationLink } from './buddyInvitationLink';

/**
 * Keeps one valid invitation pending until the user explicitly resolves it.
 * This is used by AppEntry for both cold-start URLs and warm URL events.
 */
export function createBuddyInvitationLinkRouter(deps: {
  onInvitation: (token: string) => void;
}) {
  let pendingToken: string | null = null;

  return {
    receiveUrl(url: string): 'received' | 'duplicate' | 'invalid' {
      const token = parseBuddyInvitationLink(url);

      if (token === null) {
        return 'invalid';
      }

      if (token === pendingToken) {
        return 'duplicate';
      }

      pendingToken = token;
      deps.onInvitation(token);
      return 'received';
    },
    pendingToken: () => pendingToken,
    resolveInvitation(token: string | null) {
      if (token === null || pendingToken === token) {
        pendingToken = null;
      }
    },
  };
}
