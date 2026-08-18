// src/services/runProfileSetupStatusService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const RUN_PROFILE_SETUP_DONE_STORAGE_KEY = 'laufbuddy.runProfileSetupDone.v1';

export async function loadRunProfileSetupDone(): Promise<boolean> {
  const storedValue = await AsyncStorage.getItem(RUN_PROFILE_SETUP_DONE_STORAGE_KEY);

  return storedValue === 'done';
}

export async function markRunProfileSetupDone(): Promise<void> {
  await AsyncStorage.setItem(RUN_PROFILE_SETUP_DONE_STORAGE_KEY, 'done');
}
