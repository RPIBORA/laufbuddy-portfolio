// src/app_core/state/useRunHistory.ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  PainArea,
  RunHistoryEntry,
  RunPauseEntry,
  RunPauseSummary,
  RunPurpose,
  RunRoutePointSnapshot,
  RunSplitEntry,
  ShoeIssueArea,
  ShoeIssueCategory,
  ShoeIssueType,
  ShoeRunFeeling,
  SurfaceType,
} from '../models/ShoeModels';
import {
  applyRunFeedbackToEntry,
  UpdateRunFeedbackParams,
} from '../../core/runs/runFeedbackUpdate';
import { useBodyProfile } from './useBodyProfile';
import { useShoeStatus } from './useShoeStatus';
import { queueRunHistoryFirestoreSync } from '../../services/runHistoryFirestoreSyncService';
import {
  getActiveLocalDataScopeUid,
  scopedStorage,
} from '../../services/localDataScopeService';

export type AddRunParams = {
  runId?: string;
  distanceKm: number;
  durationSeconds: number;
  shoeId: string;

  startedAt?: number | null;
  endedAt?: number | null;
  averagePaceSecondsPerKm?: number | null;
  splits?: RunSplitEntry[];

  pauseSummary?: RunPauseSummary;
  pauses?: RunPauseEntry[];

  routeDistanceKm?: number | null;
  routeFingerprint?: string | null;
  routeGroupId?: string | null;
  routePoints?: RunRoutePointSnapshot[];
  startLatitude?: number | null;
  startLongitude?: number | null;
  endLatitude?: number | null;
  endLongitude?: number | null;
  elevationGainMeters?: number | null;
  elevationLossMeters?: number | null;
  maxAltitudeMeters?: number | null;
  minAltitudeMeters?: number | null;
  climbIntensity?: number | null;
  descentIntensity?: number | null;
  flatRatio?: number | null;
  surfaceType?: SurfaceType;

  timeOfDay?: string | null;
  weekday?: number | null;

  weatherType?: string | null;
  temperatureCelsius?: number | null;
  feelsLikeCelsius?: number | null;
  humidityPercent?: number | null;
  windSpeedKph?: number | null;
  precipitationMm?: number | null;
  isRain?: boolean | null;
  isSnow?: boolean | null;

  runMode?: string;
  buddyConnectedRatio?: number | null;
  headsetConnectedRatio?: number | null;

  averageSpeedKph?: number | null;
  maxSpeedKph?: number | null;

  stepsTotal?: number | null;
  averageCadenceSpm?: number | null;
  maxCadenceSpm?: number | null;

  averageHeartRateBpm?: number | null;
  maxHeartRateBpm?: number | null;

  bodyWeightKgAtRunStart?: number | null;

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

type RunHistoryState = {
  runs: RunHistoryEntry[];
  resetForAccountScope: () => void;
  addRun: (params: AddRunParams) => Promise<RunHistoryEntry>;
  updateRunFeedback: (runId: string, feedback: UpdateRunFeedbackParams) => void;
  correctRunShoe: (runId: string, newShoeId: string) => void;
};

const RUN_HISTORY_STORAGE_KEY = 'laufbuddy_run_history_v1';
let runHistoryStorageWrite: Promise<void> = Promise.resolve();

const runHistoryStorage = {
  getItem: (name: string) => scopedStorage.getItem(name),
  setItem: (name: string, value: string) => {
    const storageForOwner = scopedStorage.forUid(
      getActiveLocalDataScopeUid(),
    );
    const operation = runHistoryStorageWrite
      .catch(() => undefined)
      .then(() => storageForOwner.setItem(name, value));

    runHistoryStorageWrite = operation;
    return operation;
  },
  removeItem: (name: string) => scopedStorage
    .forUid(getActiveLocalDataScopeUid())
    .removeItem(name),
};

const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
};

function normalizeRunDistanceKm(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return 0;
  }

  return distanceKm;
}

function recalculateShoeMileageSnapshots(
  runs: RunHistoryEntry[],
  affectedShoeIds: string[],
): RunHistoryEntry[] {
  const affectedShoeIdSet = new Set(affectedShoeIds);

  const orderedRuns = runs
    .filter((run) => affectedShoeIdSet.has(run.shoe.shoeId))
    .slice()
    .sort((left, right) => {
      const timestampDifference = left.startedAt - right.startedAt;

      if (timestampDifference !== 0) {
        return timestampDifference;
      }

      return left.id.localeCompare(right.id);
    });

  const accumulatedKmByShoeId = new Map<string, number>();
  const mileageAtStartByRunId = new Map<string, number>();

  orderedRuns.forEach((run) => {
    const shoeId = run.shoe.shoeId;
    const currentKm = accumulatedKmByShoeId.get(shoeId) ?? 0;

    mileageAtStartByRunId.set(
      run.id,
      Number(currentKm.toFixed(2)),
    );

    accumulatedKmByShoeId.set(
      shoeId,
      currentKm + normalizeRunDistanceKm(run.distanceKm),
    );
  });

  return runs.map((run) => {
    const shoeKmAtRunStart = mileageAtStartByRunId.get(run.id);

    if (shoeKmAtRunStart === undefined) {
      return run;
    }

    return {
      ...run,
      shoe: {
        ...run.shoe,
        shoeKmAtRunStart,
      },
    };
  });
}

function syncShoeUsageFromRuns(
  runs: RunHistoryEntry[],
  affectedShoeIds: string[],
): void {
  const shoeState = useShoeStatus.getState();

  Array.from(new Set(affectedShoeIds)).forEach((shoeId) => {
    const shoeExists = shoeState.shoes.some((shoe) => shoe.id === shoeId);

    if (!shoeExists) {
      return;
    }

    const shoeRuns = runs
      .filter((run) => run.shoe.shoeId === shoeId)
      .slice()
      .sort((left, right) => left.startedAt - right.startedAt);

    const currentKm = shoeRuns.reduce(
      (sum, run) => sum + normalizeRunDistanceKm(run.distanceKm),
      0,
    );

    shoeState.setShoeUsageStats(shoeId, {
      currentKm,
      runsCount: shoeRuns.length,
      firstRunAt: shoeRuns[0]?.startedAt ?? null,
      lastRunAt: shoeRuns[shoeRuns.length - 1]?.startedAt ?? null,
    });
  });
}

function calculateAveragePaceSecondsPerKm(
  durationSeconds: number,
  distanceKm: number,
): number | null {
  if (distanceKm <= 0) {
    return null;
  }

  return Math.round(durationSeconds / distanceKm);
}

function createTimeOfDay(startedAt: number): string {
  const hour = new Date(startedAt).getHours();

  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';

  return 'evening';
}

function calculateShoeAgeDaysAtRunStart(
  shoeCreatedAt: number,
  startedAt: number,
): number {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.floor((startedAt - shoeCreatedAt) / millisecondsPerDay));
}

export const useRunHistory = create<RunHistoryState>()(
  persist(
    (set, get) => ({
      runs: [],
      resetForAccountScope: () => set({ runs: [] }),

      addRun: async ({
        runId,
        distanceKm,
        durationSeconds,
        shoeId,

        startedAt = Date.now(),
        endedAt = Date.now(),
        averagePaceSecondsPerKm = calculateAveragePaceSecondsPerKm(
          durationSeconds,
          distanceKm,
        ),
        splits = [],

        pauseSummary = {
          pauseCount: 0,
          totalPauseDurationMs: 0,
        },
        pauses = [],

        routeDistanceKm = distanceKm,
        routeFingerprint = null,
        routeGroupId = null,
        routePoints = [],
        startLatitude = null,
        startLongitude = null,
        endLatitude = null,
        endLongitude = null,
        elevationGainMeters = null,
        elevationLossMeters = null,
        maxAltitudeMeters = null,
        minAltitudeMeters = null,
        climbIntensity = null,
        descentIntensity = null,
        flatRatio = null,
        surfaceType = 'unknown',

        timeOfDay = createTimeOfDay(startedAt),
        weekday = new Date(startedAt).getDay(),

        weatherType = null,
        temperatureCelsius = null,
        feelsLikeCelsius = null,
        humidityPercent = null,
        windSpeedKph = null,
        precipitationMm = null,
        isRain = null,
        isSnow = null,

        runMode = 'Solo-Lauf',
        buddyConnectedRatio = null,
        headsetConnectedRatio = null,

        averageSpeedKph = null,
        maxSpeedKph = null,

        stepsTotal = null,
        averageCadenceSpm = null,
        maxCadenceSpm = null,

        averageHeartRateBpm = null,
        maxHeartRateBpm = null,

        bodyWeightKgAtRunStart = useBodyProfile.getState().currentWeightKg,

        runPurpose = 'unknown',
        shoeComfortRating = null,
        painAfterRun = null,
        painArea = 'none',
        painIntensity = null,

        shoeRunFeeling = null,
        shoeIssueCategory = null,
        shoeIssueType = null,
        shoeIssueArea = null,

        notes = null,
      }) => {
        const shoe = useShoeStatus
          .getState()
          .shoes.find((entry) => entry.id === shoeId);

        if (!shoe) {
          throw new Error('Der ausgewählte Laufschuh wurde nicht gefunden.');
        }

        const existingRun = runId
          ? get().runs.find((entry) => entry.id === runId) ?? null
          : null;

        if (existingRun) {
          set({ runs: get().runs });
          await runHistoryStorageWrite;
          return existingRun;
        }

        const newRun: RunHistoryEntry = {
          id: runId ?? generateId(),

          startedAt,
          endedAt,
          durationSeconds,

          distanceKm,
          averagePaceSecondsPerKm,
          splits,

          pauseSummary,
          pauses,

          shoe: {
            shoeId,
            shoeName: shoe.name,
            shoeBrand: shoe.brand,
            shoeModel: shoe.model,
            shoeKmAtRunStart: shoe.currentKm,
            shoeAgeDaysAtRunStart: calculateShoeAgeDaysAtRunStart(
              shoe.createdAt,
              startedAt,
            ),
          },

          route: {
            routeDistanceKm,
            routeFingerprint,
            routeGroupId,
            routePoints,
            startLatitude,
            startLongitude,
            endLatitude,
            endLongitude,
            elevationGainMeters,
            elevationLossMeters,
            maxAltitudeMeters,
            minAltitudeMeters,
            climbIntensity,
            descentIntensity,
            flatRatio,
            surfaceType,
          },

          context: {
            timeOfDay,
            weekday,
            weather: {
              weatherType,
              temperatureCelsius,
              feelsLikeCelsius,
              humidityPercent,
              windSpeedKph,
              precipitationMm,
              isRain,
              isSnow,
            },
          },

          safety: {
            runMode,
            buddyConnectedRatio,
            headsetConnectedRatio,
          },

          performance: {
            averageSpeedKph,
            maxSpeedKph,
            stepsTotal,
            averageCadenceSpm,
            maxCadenceSpm,
            averageHeartRateBpm,
            maxHeartRateBpm,
          },

          body: {
            bodyWeightKgAtRunStart,
          },

          feedback: {
            runPurpose,
            shoeComfortRating,
            painAfterRun,
            painArea,
            painIntensity,
            shoeRunFeeling,
            shoeIssueCategory,
            shoeIssueType,
            shoeIssueArea,
          },

          notes,
        };

        console.log('[RunHistory] Neuer Lauf gespeichert:', {
          runId: newRun.id,
          distanceKm: newRun.distanceKm,
          durationSeconds: newRun.durationSeconds,
          routePointsCount: newRun.route.routePoints?.length ?? 0,
          hasStart: newRun.route.startLatitude !== null && newRun.route.startLongitude !== null,
          hasEnd: newRun.route.endLatitude !== null && newRun.route.endLongitude !== null,
        });

        const nextRuns = recalculateShoeMileageSnapshots(
          [newRun, ...get().runs],
          [shoeId],
        );

        set({
          runs: nextRuns,
        });

        await runHistoryStorageWrite;

        syncShoeUsageFromRuns(nextRuns, [shoeId]);

        const storedNewRun = nextRuns.find((entry) => entry.id === newRun.id) ?? newRun;
        queueRunHistoryFirestoreSync(storedNewRun);
        return storedNewRun;
      },

      updateRunFeedback: (runId, feedback) => {
        const nextRuns = get().runs.map((entry) =>
          entry.id === runId ? applyRunFeedbackToEntry(entry, feedback) : entry,
        );

        set({
          runs: nextRuns,
        });

        const updatedRun = nextRuns.find((entry) => entry.id === runId) ?? null;

        if (updatedRun) {
          queueRunHistoryFirestoreSync(updatedRun);
        }
      },

      correctRunShoe: (runId, newShoeId) => {
        const state = get();
        const run = state.runs.find((entry) => entry.id === runId);

        if (!run || run.shoe.shoeId === newShoeId) {
          return;
        }

        const shoeState = useShoeStatus.getState();
        const newShoe = shoeState.shoes.find(
          (entry) => entry.id === newShoeId,
        );

        if (!newShoe) {
          return;
        }

        const oldShoeId = run.shoe.shoeId;

        const runsWithCorrectedShoe = state.runs.map((entry) =>
          entry.id === runId
            ? {
                ...entry,
                shoe: {
                  shoeId: newShoeId,
                  shoeName: newShoe.name,
                  shoeBrand: newShoe.brand,
                  shoeModel: newShoe.model,
                  shoeKmAtRunStart: null,
                  shoeAgeDaysAtRunStart: calculateShoeAgeDaysAtRunStart(
                    newShoe.createdAt,
                    entry.startedAt,
                  ),
                },
              }
            : entry,
        );

        const correctedRuns = recalculateShoeMileageSnapshots(
          runsWithCorrectedShoe,
          [oldShoeId, newShoeId],
        );

        set({
          runs: correctedRuns,
        });

        syncShoeUsageFromRuns(
          correctedRuns,
          [oldShoeId, newShoeId],
        );

        const previousRunsById = new Map(
          state.runs.map((entry) => [entry.id, JSON.stringify(entry)]),
        );

        correctedRuns.forEach((entry) => {
          const previousSerializedRun = previousRunsById.get(entry.id);

          if (previousSerializedRun !== JSON.stringify(entry)) {
            queueRunHistoryFirestoreSync(entry);
          }
        });
      },
    }),
    {
      name: RUN_HISTORY_STORAGE_KEY,
      storage: createJSONStorage(() => runHistoryStorage),
      partialize: (state) => ({
        runs: state.runs,
      }),
    },
  ),
);
