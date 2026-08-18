export type ReleaseSetupActionStep = {
  key: string;
  isReady: boolean;
};

export type ReleaseSetupActionStatus = {
  steps: ReleaseSetupActionStep[];
  fullScreenIntentAccess: {
    required: boolean;
    granted: boolean;
  };
};

export type ReleaseSetupActionState = {
  hasMissingRuntimePermission: boolean;
  hasMissingEmergencyContact: boolean;
  showFullScreenIntentAccessCard: boolean;
};

export function getReleaseSetupActionState(
  status: ReleaseSetupActionStatus,
): ReleaseSetupActionState {
  return {
    hasMissingRuntimePermission: status.steps.some(
      (step) => step.key !== 'emergencyContact' && !step.isReady,
    ),
    hasMissingEmergencyContact:
      status.steps.find((step) => step.key === 'emergencyContact')?.isReady === false,
    showFullScreenIntentAccessCard:
      status.fullScreenIntentAccess.required &&
      !status.fullScreenIntentAccess.granted,
  };
}
