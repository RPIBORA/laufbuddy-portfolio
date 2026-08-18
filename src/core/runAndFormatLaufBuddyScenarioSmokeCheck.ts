// src/core/runAndFormatLaufBuddyScenarioSmokeCheck.ts
import {
  runLaufBuddyScenarioSmokeCheck,
  type LaufBuddyScenarioSmokeCheckResult,
} from './debugScenarioSmokeChecks';
import type { LaufBuddyDebugScenarioName } from './debugScenarioRunner';

function formatSmokeCheckResult(
  result: LaufBuddyScenarioSmokeCheckResult,
): string {
  const header = `=== LaufBuddy Smoke Check: ${result.scenario} ===`;
  const status = `status: ${result.passed ? 'PASS' : 'FAIL'}`;
  const errors =
    result.errors.length === 0
      ? 'errors: none'
      : ['errors:', ...result.errors.map((error) => `- ${error}`)].join('\n');

  return [header, status, errors, '', result.report].join('\n');
}

export function runAndFormatLaufBuddyScenarioSmokeCheck(
  scenario: LaufBuddyDebugScenarioName,
): string {
    const result = runLaufBuddyScenarioSmokeCheck(scenario);
    return formatSmokeCheckResult(result);
}

export default runAndFormatLaufBuddyScenarioSmokeCheck;