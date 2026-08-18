export const BUDDY_INVITATION_TIMEOUT_MS = 15_000;

export class BuddyInvitationTimeoutError extends Error {
  constructor() {
    super('Die Einladung konnte nicht rechtzeitig erstellt werden. Bitte prüfe deine Verbindung und versuche es erneut.');
    this.name = 'BuddyInvitationTimeoutError';
  }
}

export function awaitBuddyInvitationResult<T>(
  operation: Promise<T>,
  timeoutMs = BUDDY_INVITATION_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(new BuddyInvitationTimeoutError());
    }, timeoutMs);

    operation.then(
      (result) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolve(result);
      },
      (error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
