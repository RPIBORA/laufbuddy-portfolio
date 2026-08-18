import { createBuddyInvitationLink, parseBuddyInvitationLink } from './buddyInvitationLink';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const token = 'ab+/= token';
const httpsLink = createBuddyInvitationLink(token);
assert(httpsLink === 'https://laufbuddy-v2.web.app/connect?token=ab%2B%2F%3D%20token', 'Firebase Hosting token encoding failed');
assert(parseBuddyInvitationLink(httpsLink) === token, 'Firebase Hosting link parsing failed');
assert(parseBuddyInvitationLink('https://www.laufbuddy.app/connect?token=TOKEN') === 'TOKEN', 'future custom-domain link parsing failed');
assert(parseBuddyInvitationLink('https://laufbuddy-v2.web.app/connect?token=ab%2B%2F%3D%20token') === token, 'URL-encoded token parsing failed');
assert(parseBuddyInvitationLink('laufbuddy://connect?invitation=TOKEN') === 'TOKEN', 'legacy invitation parsing failed');
assert(parseBuddyInvitationLink('laufbuddy://connect?token=TOKEN') === 'TOKEN', 'legacy token parsing failed');
assert(parseBuddyInvitationLink('https://other.example/connect?token=TOKEN') === null, 'wrong host accepted');
assert(parseBuddyInvitationLink('https://not-laufbuddy-v2.web.app/connect?token=TOKEN') === null, 'similar host accepted');
assert(parseBuddyInvitationLink('https://www.laufbuddy.app/other?token=TOKEN') === null, 'wrong path accepted');
assert(parseBuddyInvitationLink('https://www.laufbuddy.app/reconnect?token=TOKEN') === null, 'partial connect path accepted');
assert(parseBuddyInvitationLink('https://laufbuddy-v2.web.app/connect?invitation=TOKEN') === null, 'legacy HTTPS parameter accepted');
assert(parseBuddyInvitationLink('https://laufbuddy-v2.web.app/connect?token=TOKEN&extra=value') === null, 'additional HTTPS parameter accepted');
assert(parseBuddyInvitationLink('https://laufbuddy-v2.web.app/connect?token=FIRST&token=SECOND') === null, 'duplicate HTTPS token accepted');
assert(parseBuddyInvitationLink('laufbuddy://connect?token=TOKEN&extra=value') === null, 'additional legacy parameter accepted');
assert(parseBuddyInvitationLink('laufbuddy://connect?token=') === null, 'empty token accepted');
assert(parseBuddyInvitationLink('laufbuddy://connect?invitation=') === null, 'empty legacy invitation accepted');
