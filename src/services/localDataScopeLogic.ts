export type KeyValueStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };

export function createScopedStorage(storage: KeyValueStorage, getUid: () => string | null) {
  const scopedKey = (uid: string | null, name: string) =>
    uid ? `laufbuddy.user.${uid}.${name}` : null;
  const createStorageForUid = (uid: string | null) => ({
    getItem: (name: string) => {
      const key = scopedKey(uid, name);
      return key ? storage.getItem(key) : Promise.resolve(null);
    },
    setItem: (name: string, value: string) => {
      const key = scopedKey(uid, name);
      return key ? storage.setItem(key, value) : Promise.resolve();
    },
    removeItem: (name: string) => {
      const key = scopedKey(uid, name);
      return key ? storage.removeItem(key) : Promise.resolve();
    },
  });

  return {
    getItem: (name: string) => createStorageForUid(getUid()).getItem(name),
    setItem: (name: string, value: string) =>
      createStorageForUid(getUid()).setItem(name, value),
    removeItem: (name: string) => createStorageForUid(getUid()).removeItem(name),
    forUid: (uid: string | null) => createStorageForUid(uid),
  };
}

export function canSyncScopedData(
  localOwnerUid: string | null | undefined,
  activeScopeUid: string | null | undefined,
  firebaseUid: string | null | undefined,
): boolean {
  return !!localOwnerUid && localOwnerUid === activeScopeUid && localOwnerUid === firebaseUid;
}
