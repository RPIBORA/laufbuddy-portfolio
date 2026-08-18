// src/core/debugTestKit.ts
export {
  debugSubmitDetectedHotword,
  debugTriggerHelpHotword,
} from './debugHotwordActions';

export {
  debugConnectBuddyAudio,
  debugConnectHeadphones,
  debugDisconnectBuddyAudio,
  debugDisconnectHeadphones,
  debugEndSession,
  debugFailBuddyAudio,
  debugMarkAppNotReady,
  debugMarkAppReady,
  debugResetBuddyAudio,
  debugResetLaufBuddyState,
  debugResetBOSEmergency,
  debugResetNormalEmergency,
  debugResetSession,
  debugSetConnectivityDegraded,
  debugSetConnectivityOffline,
  debugSetConnectivityOnline,
  debugStartSession,
  debugTriggerNormalEmergency,
} from './debugStateActions';

export {
  getLaufBuddyDebugSnapshot,
  type LaufBuddyDebugSnapshot,
} from './debugStateSnapshot';

export {
  runLaufBuddyDebugScenario,
  runSoloProtectionReadyScenario,
  runBuddyConnectedScenario,
  runBuddyLostAfterConnectionScenario,
  runNormalEmergencyByHotwordScenario,
  type LaufBuddyDebugScenarioName,
  type LaufBuddyDebugScenarioResult,
} from './debugScenarioRunner';

export {
  formatLaufBuddyDebugSnapshot,
  formatLaufBuddyDebugScenarioResult,
} from './debugScenarioReport';

export {
  runAndFormatLaufBuddyDebugScenario,
} from './runAndFormatLaufBuddyDebugScenario';

export {
  runSoloProtectionReadyScenarioReport,
  runBuddyConnectedScenarioReport,
  runBuddyLostAfterConnectionScenarioReport,
  runNormalEmergencyByHotwordScenarioReport,
} from './debugScenarioReports';

export {
  runLaufBuddyScenarioSmokeCheck,
  type LaufBuddyScenarioSmokeCheckResult,
} from './debugScenarioSmokeChecks';

export {
  runAndFormatLaufBuddyScenarioSmokeCheck,
} from './runAndFormatLaufBuddyScenarioSmokeCheck';

export {
  runAllLaufBuddyScenarioSmokeChecks,
  runAndFormatAllLaufBuddyScenarioSmokeChecks,
} from './runAllLaufBuddyScenarioSmokeChecks';

export {
  runSoloProtectionReadySmokeCheckReport,
  runBuddyConnectedSmokeCheckReport,
  runBuddyLostAfterConnectionSmokeCheckReport,
  runNormalEmergencyByHotwordSmokeCheckReport,
  runAllSmokeCheckReports,
} from './debugScenarioSmokeCheckReports';

export {
  runLaufBuddySmokeChecksToConsole,
} from './runLaufBuddySmokeChecksToConsole';