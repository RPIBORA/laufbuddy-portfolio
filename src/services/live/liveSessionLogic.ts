export const LIVE_CONNECTION_GRACE_MS = 15_000;
export type LiveRunMode = 'Solo-Lauf' | 'Gemeinsamer Lauf' | 'Gemeinsamer Lauf vorbereitet' | 'Kein Lauf aktiv';
export type LiveRunStatus = 'idle' | 'prepared' | 'running' | 'paused' | 'stopping' | 'stopped' | 'failed';

export function isLiveShareAllowed(input: { runMode: LiveRunMode; sessionStatus: LiveRunStatus }): boolean {
  return input.runMode === 'Solo-Lauf'
    && (input.sessionStatus === 'prepared' || input.sessionStatus === 'running' || input.sessionStatus === 'paused');
}
export function createLiveSessionId(bytes: Uint8Array): string {
  if (bytes.length !== 32) throw new Error("Die sichere Sitzungskennung benötigt genau 32 Zufallsbytes.");
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
export type LiveCompanionTransition = 'confirmed' | 'disconnected' | 'restored' | 'ended' | null;
export type LiveCompanionMachine = { initialized: boolean; confirmed: boolean; disconnected: boolean; lastEndedRevision: number };
export function createLiveCompanionMachine(): LiveCompanionMachine { return { initialized: false, confirmed: false, disconnected: false, lastEndedRevision: 0 }; }
export function reduceLiveCompanionState(state: LiveCompanionMachine, input: { confirmed: boolean; connected: boolean; endedRevision: number }): { state: LiveCompanionMachine; transition: LiveCompanionTransition } {
  if (!state.initialized) return { state: { initialized: true, confirmed: input.confirmed, disconnected: input.confirmed && !input.connected, lastEndedRevision: input.endedRevision }, transition: null };
  if (input.endedRevision > state.lastEndedRevision) return { state: { ...state, confirmed: true, disconnected: true, lastEndedRevision: input.endedRevision }, transition: 'ended' };
  if (state.lastEndedRevision > 0) return { state, transition: null };
  if (!state.confirmed && input.confirmed) return { state: { ...state, confirmed: true, disconnected: !input.connected }, transition: 'confirmed' };
  if (!input.confirmed) return { state, transition: null };
  if (!state.disconnected && !input.connected) return { state: { ...state, disconnected: true }, transition: 'disconnected' };
  if (state.disconnected && input.connected) return { state: { ...state, disconnected: false }, transition: 'restored' };
  return { state, transition: null };
}
export function getLiveTransmissionStatus(input: { nowMs: number; lastPositionAtMs: number | null; lastHeartbeatAtMs: number | null }): 'live' | 'gps_lost' | 'data_lost' {
  if (input.lastHeartbeatAtMs === null || input.nowMs - input.lastHeartbeatAtMs >= LIVE_CONNECTION_GRACE_MS) return 'data_lost';
  return input.lastPositionAtMs === null || input.nowMs - input.lastPositionAtMs >= LIVE_CONNECTION_GRACE_MS ? 'gps_lost' : 'live';
}
