import {
  installCellularServiceStateListener,
  startCellularServiceStateMonitoring,
  stopCellularServiceStateMonitoring,
} from '../services/cellularServiceStateService';
import { useConnectivityStore } from '../state/connectivityStore';

export type CellularConnectivityBridgeCleanup = () => void;

export function installCellularConnectivityBridge(): CellularConnectivityBridgeCleanup {
  const cleanupListener = installCellularServiceStateListener((snapshot) => {
    if (snapshot.state === 'unknown') {
      console.log('[CellularConnectivityBridge] Mobilfunkstatus unbekannt, Connectivity bleibt unverändert', snapshot);
      return;
    }

    if (snapshot.hasCellService) {
      useConnectivityStore.getState().setOnline();
      console.log('[CellularConnectivityBridge] Telefonnetz verfügbar -> connectivity online', snapshot);
      return;
    }

    useConnectivityStore.getState().setOffline();
    console.log('[CellularConnectivityBridge] Kein Telefonnetz -> connectivity offline', snapshot);
  });

  void startCellularServiceStateMonitoring().catch((error) => {
    console.warn('[CellularConnectivityBridge] Mobilfunknetz-Monitor konnte nicht gestartet werden', error);
  });

  return () => {
    cleanupListener();

    void stopCellularServiceStateMonitoring().catch((error) => {
      console.warn('[CellularConnectivityBridge] Mobilfunknetz-Monitor konnte nicht gestoppt werden', error);
    });
  };
}

export default installCellularConnectivityBridge;
