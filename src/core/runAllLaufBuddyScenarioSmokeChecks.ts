// src/core/runAllLaufBuddyScenarioSmokeChecks.ts
import type { LaufBuddyDebugScenarioName } from './debugScenarioRunner';
import {
  runLaufBuddyScenarioSmokeCheck,
  type LaufBuddyScenarioSmokeCheckResult,
} from './debugScenarioSmokeChecks';

const DEFAULT_SCENARIOS: LaufBuddyDebugScenarioName[] = [
  'soloProtectionReady',
  'buddyConnected',
  'buddyLostAfterConnection',
  'normalEmergencyByHotword',
];

function formatSingleResult(
  result: LaufBuddyScenarioSmokeCheckResult,
): string {
  const status = result.passed ? 'PASS' : 'FAIL';
  const errors =
    result.errors.length === 0
      ? 'errors: none'
      : ['errors:', ...result.errors.map((error) => `- ${error}`)].join('\n');

  return [
    `=== ${result.scenario} ===`,
    `status: ${status}`,
    errors,
    '',
    result.report,
  ].join('\n');
}

export function runAllLaufBuddyScenarioSmokeChecks(
  scenarios: LaufBuddyDebugScenarioName[] = DEFAULT_SCENARIOS,
): LaufBuddyScenarioSmokeCheckResult[] {
  return scenarios.map((scenario) =>
    runLaufBuddyScenarioSmokeCheck(scenario),
  );
}

export function runAndFormatAllLaufBuddyScenarioSmokeChecks(
  scenarios: LaufBuddyDebugScenarioName[] = DEFAULT_SCENARIOS,
): string {
  const results = runAllLaufBuddyScenarioSmokeChecks(scenarios);
  const passedCount = results.filter((result) => result.passed).length;
  const failedCount = results.length - passedCount;

  return [
    '=== LaufBuddy Smoke Check Summary ===',
    `total: ${results.length}`,
    `passed: ${passedCount}`,
    `failed: ${failedCount}`,
    '',
    ...results.map((result) => formatSingleResult(result)),
  ].join('\n\n');
}

export default runAndFormatAllLaufBuddyScenarioSmokeChecks;