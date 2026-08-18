import type {
  PainArea,
  RunHistoryEntry,
  RunPurpose,
  ShoeIssueArea,
  ShoeIssueCategory,
  ShoeIssueType,
  ShoeRunFeeling,
} from '../../app_core/models/ShoeModels';

export type UpdateRunFeedbackParams = {
  runPurpose?: RunPurpose;
  shoeComfortRating?: number | null;
  painAfterRun?: boolean | null;
  painArea?: PainArea;
  painIntensity?: number | null;

  shoeRunFeeling?: ShoeRunFeeling | null;
  shoeIssueCategory?: ShoeIssueCategory | null;
  shoeIssueType?: ShoeIssueType | null;
  shoeIssueArea?: ShoeIssueArea | null;

  notes?: string | null;
};

export function applyRunFeedbackToEntry(
  entry: RunHistoryEntry,
  feedback: UpdateRunFeedbackParams,
): RunHistoryEntry {
  const currentFeedback = entry.feedback ?? {
    runPurpose: 'unknown' as RunPurpose,
    shoeComfortRating: null,
    painAfterRun: null,
    painArea: 'none' as PainArea,
    painIntensity: null,
    shoeRunFeeling: null,
    shoeIssueCategory: null,
    shoeIssueType: null,
    shoeIssueArea: null,
  };

  const nextPainAfterRun = feedback.painAfterRun ?? currentFeedback.painAfterRun;

  return {
    ...entry,
    feedback: {
      runPurpose: feedback.runPurpose ?? currentFeedback.runPurpose,
      shoeComfortRating:
        feedback.shoeComfortRating ?? currentFeedback.shoeComfortRating,
      painAfterRun: nextPainAfterRun,
      painArea:
        feedback.painArea ??
        (nextPainAfterRun === false ? 'none' : currentFeedback.painArea),
      painIntensity:
        feedback.painIntensity ??
        (nextPainAfterRun === false ? null : currentFeedback.painIntensity),

      shoeRunFeeling:
        feedback.shoeRunFeeling ?? currentFeedback.shoeRunFeeling ?? null,
      shoeIssueCategory:
        feedback.shoeIssueCategory ?? currentFeedback.shoeIssueCategory ?? null,
      shoeIssueType:
        feedback.shoeIssueType ?? currentFeedback.shoeIssueType ?? null,
      shoeIssueArea:
        feedback.shoeIssueArea ?? currentFeedback.shoeIssueArea ?? null,
    },
    notes: feedback.notes === undefined ? entry.notes : feedback.notes,
  };
}