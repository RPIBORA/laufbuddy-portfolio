export interface User {
  uid: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;

  /**
   * Dauerhafter Buddy-Code.
   *
   * Nicht verwechseln mit RUN-XXXX.
   *
   * RUN-XXXX = temporärer Live-Code für aktuellen Lauf.
   * buddyCode = dauerhafte Messenger-artige ID zum Finden/Speichern von Buddies.
   */
  buddyCode: string | null;
}