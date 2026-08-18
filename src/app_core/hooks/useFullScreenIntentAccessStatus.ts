import { AppState } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  getFullScreenIntentAccessStatus,
  type FullScreenIntentAccessStatus,
} from '../../services/fullScreenIntentAccessService';

export function useFullScreenIntentAccessStatus(): FullScreenIntentAccessStatus | null {
  const [status, setStatus] = useState<FullScreenIntentAccessStatus | null>(null);

  const refresh = useCallback(() => {
    void getFullScreenIntentAccessStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    refresh();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        refresh();
      }
    });

    return () => subscription.remove();
  }, [refresh]);

  return status;
}
