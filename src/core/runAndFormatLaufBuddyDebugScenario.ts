// src/core/runAndFormatLaufBuddyDebugScenario.ts
import {
  runLaufBuddyDebugScenario,
  type LaufBuddyDebugScenarioName,
} from './debugScenarioRunner';
import { formatLaufBuddyDebugScenarioResult } from './debugScenarioReport';

export function runAndFormatLaufBuddyDebugScenario(
  scenario: LaufBuddyDebugScenarioName,
): string {
  const result = runLaufBuddyDebugScenario(scenario);
  return formatLaufBuddyDebugScenarioResult(result);
}

export default runAndFormatLaufBuddyDebugScenario;