import AsyncStorage from '@react-native-async-storage/async-storage';
import { canSyncScopedData, createScopedStorage } from './localDataScopeLogic';

let activeUid: string | null = null;
export const scopedStorage = createScopedStorage(AsyncStorage, () => activeUid);
export function activateLocalDataScope(uid: string | null): void { activeUid = uid; }
export function getActiveLocalDataScopeUid(): string | null { return activeUid; }
export function isActiveLocalDataOwner(uid: string | null | undefined): boolean { return !!uid && uid === activeUid; }
export function canSyncActiveLocalData(
  localOwnerUid: string | null | undefined,
  firebaseUid: string | null | undefined,
): boolean {
  return canSyncScopedData(localOwnerUid, activeUid, firebaseUid);
}
