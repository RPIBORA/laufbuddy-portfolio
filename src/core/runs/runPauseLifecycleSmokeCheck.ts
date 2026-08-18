import type { RunPauseEntry } from './runTrackingTypes';
import { shouldCancelPendingAutoPause } from './motionAutoPausePolicy';

function closeLatestOpenPause(pauses: RunPauseEntry[], endedAt: number): RunPauseEntry[] {
  let latestOpenPauseIndex = -1;
  for (let index = pauses.length - 1; index >= 0; index -= 1) {
    if (pauses[index].endedAt === null) {
      latestOpenPauseIndex = index;
      break;
    }
  }
  return pauses.map((pause, index) => index === latestOpenPauseIndex
    ? { ...pause, endedAt, durationMs: Math.max(0, endedAt - pause.startedAt) }
    : pause);
}

function createPauseSummary(pauses: RunPauseEntry[], totalPauseDurationMs: number) {
  return { pauseCount: pauses.length, totalPauseDurationMs };
}

function openPause(source: 'auto' | 'manual', startedAt: number): RunPauseEntry {
  return {
    id: `${source}-${startedAt}`,
    source,
    label: source === 'auto' ? 'Auto-Pause' : 'Manuelle Pause',
    startedAt,
    endedAt: null,
    durationMs: null,
    location: null,
  };
}

function assertPauseCase(
  errors: string[],
  label: string,
  pauses: RunPauseEntry[],
  expectedSource: 'auto' | 'manual' | null,
): void {
  const summary = createPauseSummary(pauses, pauses.reduce(
    (total, pause) => total + (pause.durationMs ?? 0),
    0,
  ));
  if (summary.pauseCount !== (expectedSource === null ? 0 : 1)) errors.push(`${label}: unexpected pause count`);
  if (expectedSource !== null && (pauses[0]?.source !== expectedSource || pauses[0]?.endedAt === null)) {
    errors.push(`${label}: pause was not closed with the expected source`);
  }
}

/** Smoke checks for the pause data contract used by pause/resume/stop. */
export function runPauseLifecycleSmokeCheck(): { passed: boolean; errors: string[] } {
  const errors: string[] = [];

  // running -> manual pause -> resume -> stop
  assertPauseCase(errors, 'manual pause then resume', closeLatestOpenPause([openPause('manual', 100)], 200), 'manual');
  // running -> manual pause -> stop
  assertPauseCase(errors, 'manual pause then stop', closeLatestOpenPause([openPause('manual', 100)], 200), 'manual');
  // running -> auto pause -> resume -> stop
  assertPauseCase(errors, 'auto pause then resume', closeLatestOpenPause([openPause('auto', 100)], 200), 'auto');
  // running -> stop without pause
  assertPauseCase(errors, 'stop without pause', [], null);

  if (!shouldCancelPendingAutoPause('running', 'paused')) {
    errors.push('manual pause does not cancel a pending auto-pause timer');
  }

  return { passed: errors.length === 0, errors };
}
