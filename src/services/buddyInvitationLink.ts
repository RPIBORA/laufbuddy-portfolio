const BUDDY_INVITATION_HOST = 'laufbuddy-v2.web.app';
const SUPPORTED_HTTPS_HOSTS = new Set([
  BUDDY_INVITATION_HOST,
  'www.laufbuddy.app',
]);

function hasExactlyOneQueryParameter(searchParams: URLSearchParams): boolean {
  let parameterCount = 0;

  searchParams.forEach(() => {
    parameterCount += 1;
  });

  return parameterCount === 1;
}

export function createBuddyInvitationLink(token: string): string {
  return `https://${BUDDY_INVITATION_HOST}/connect?token=${encodeURIComponent(token)}`;
}

export function parseBuddyInvitationLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hasOnlyOneQueryParameter = hasExactlyOneQueryParameter(parsed.searchParams);
    const isHttpsLink =
      parsed.protocol === 'https:' &&
      SUPPORTED_HTTPS_HOSTS.has(parsed.hostname) &&
      parsed.pathname === '/connect' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.port === '' &&
      hasOnlyOneQueryParameter;
    const isLegacyLink =
      parsed.protocol === 'laufbuddy:' &&
      parsed.hostname === 'connect' &&
      (parsed.pathname === '' || parsed.pathname === '/') &&
      hasOnlyOneQueryParameter;

    if (isHttpsLink) {
      return parsed.searchParams.get('token')?.trim() || null;
    }

    if (isLegacyLink) {
      return (
        parsed.searchParams.get('token')?.trim() ||
        parsed.searchParams.get('invitation')?.trim() ||
        null
      );
    }

    return null;
  } catch {
    return null;
  }
}
