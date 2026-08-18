// src/core/runLaufBuddySmokeChecksToConsole.ts
import { runAllSmokeCheckReports } from './debugScenarioSmokeCheckReports';

export function runLaufBuddySmokeChecksToConsole(): string {
  const report = runAllSmokeCheckReports();
  console.log(report);
  return report;
}

export default runLaufBuddySmokeChecksToConsole;