export function createBuddyInteractionController(deps: {
  acceptInvitation: (token: string) => Promise<void>;
  startConnection: (buddyUid: string) => Promise<void>;
  endConnection: () => Promise<void>;
}) {
  let pendingToken: string | null = null;
  let accepting = false;
  let selectedBuddyUid: string | null = null;
  let connecting = false;
  return {
    receiveLink(token: string) { pendingToken = token; },
    pendingToken: () => pendingToken,
    cancelInvitation() { pendingToken = null; },
    async acceptInvitation() {
      if (!pendingToken || accepting) return false;
      accepting = true;
      const token = pendingToken;
      try { await deps.acceptInvitation(token); return true; }
      finally { accepting = false; pendingToken = null; }
    },
    selectBuddy(buddyUid: string) { selectedBuddyUid = buddyUid; },
    cancelConnection() { selectedBuddyUid = null; },
    async confirmConnection() {
      if (!selectedBuddyUid || connecting) return false;
      connecting = true;
      const buddyUid = selectedBuddyUid;
      selectedBuddyUid = null;
      try {
        await deps.startConnection(buddyUid);
        return true;
      } finally {
        connecting = false;
      }
    },
    endConnection: () => deps.endConnection(),
  };
}
