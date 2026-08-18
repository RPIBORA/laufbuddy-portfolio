import Vosk from 'react-native-vosk';
import { hotwordConfig } from '../config/hotwordConfig';
import { submitDetectedHotwordToLaufBuddyRuntime } from '../core/laufBuddyRuntimeRegistry';
import { HotwordStatus } from '../state/hotwordStatus';
import { useHotwordStore } from '../state/hotwordStore';
import { useHotwordDebugStore } from '../state/hotwordDebugStore';

type DetectedHotword = 'hilfe';

type RemovableSubscription = {
  remove: () => void;
};

const MODEL_PATH = 'model-de-de';
const SAME_HOTWORD_COOLDOWN_MS = 1500;
const HOTWORD_DEBUG_ENABLED = __DEV__;

const hotwordRecognizer = new Vosk();

let isModelLoaded = false;
let modelLoadPromise: Promise<void> | null = null;
let recognizerStartPromise: Promise<void> | null = null;
let isRecognizerRunning = false;
let lastAcceptedHotword: DetectedHotword | null = null;
let lastAcceptedHotwordAtMs = 0;

function logHotword(event: string, payload?: Record<string, unknown>): void {
  if (!HOTWORD_DEBUG_ENABLED) {
    return;
  }

  console.log('[HotwordRecognition]', event, payload ?? {});
}

function resetRecognizerRuntimeState(): void {
  isModelLoaded = false;
  modelLoadPromise = null;
  recognizerStartPromise = null;
  isRecognizerRunning = false;
  lastAcceptedHotword = null;
  lastAcceptedHotwordAtMs = 0;

  logHotword('resetRecognizerRuntimeState');
}

function shouldRecognizerRun(status: HotwordStatus): boolean {
  return status === HotwordStatus.Listening;
}

function getAllowedHotwords(status: HotwordStatus): DetectedHotword[] {
  if (status === HotwordStatus.Listening) {
    return [hotwordConfig.normalEmergency];
  }

  return [];
}

function normalizeTranscript(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('de')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');
}

function trackHotwordDecision(params: {
  transcriptRaw: string;
  transcriptNormalized: string;
  hotwordStatus: string;
  allowedHotwords: string[];
  detectedHotword: string | null;
  decision: 'accepted' | 'ignored' | 'cooldown_blocked';
  reason: string;
}): void {
  useHotwordDebugStore.getState().addEntry({
    transcriptRaw: params.transcriptRaw,
    transcriptNormalized: params.transcriptNormalized,
    hotwordStatus: params.hotwordStatus,
    allowedHotwords: params.allowedHotwords,
    detectedHotword: params.detectedHotword,
    decision: params.decision,
    reason: params.reason,
  });
}

function detectHotwordFromTranscript(
  transcript: string,
): DetectedHotword | null {
  const hotwordStatus = useHotwordStore.getState().status;
  const allowedHotwords = getAllowedHotwords(hotwordStatus);
  const normalizedTranscript = normalizeTranscript(transcript);

  logHotword('detectHotwordFromTranscript', {
    transcript,
    normalizedTranscript,
    hotwordStatus,
    allowedHotwords,
  });

  if (allowedHotwords.length === 0) {
    trackHotwordDecision({
      transcriptRaw: transcript,
      transcriptNormalized: normalizedTranscript,
      hotwordStatus,
      allowedHotwords,
      detectedHotword: null,
      decision: 'ignored',
      reason: 'no_allowed_hotwords',
    });
    return null;
  }

  if (!normalizedTranscript) {
    trackHotwordDecision({
      transcriptRaw: transcript,
      transcriptNormalized: normalizedTranscript,
      hotwordStatus,
      allowedHotwords,
      detectedHotword: null,
      decision: 'ignored',
      reason: 'empty_transcript',
    });
    return null;
  }

  for (const allowedHotword of allowedHotwords) {
    if (normalizedTranscript === allowedHotword) {
      return allowedHotword;
    }
  }

  trackHotwordDecision({
    transcriptRaw: transcript,
    transcriptNormalized: normalizedTranscript,
    hotwordStatus,
    allowedHotwords,
    detectedHotword: null,
    decision: 'ignored',
    reason: 'no_exact_match',
  });

  return null;
}

function shouldAcceptDetectedHotword(
  detectedHotword: DetectedHotword,
): boolean {
  const nowMs = Date.now();
  const withinCooldown =
    lastAcceptedHotword === detectedHotword &&
    nowMs - lastAcceptedHotwordAtMs < SAME_HOTWORD_COOLDOWN_MS;

  logHotword('shouldAcceptDetectedHotword', {
    detectedHotword,
    lastAcceptedHotword,
    lastAcceptedHotwordAtMs,
    nowMs,
    withinCooldown,
  });

  if (withinCooldown) {
    return false;
  }

  lastAcceptedHotword = detectedHotword;
  lastAcceptedHotwordAtMs = nowMs;
  return true;
}

function submitRecognizedTranscript(transcript: string): void {
  const hotwordStatus = useHotwordStore.getState().status;
  const allowedHotwords = getAllowedHotwords(hotwordStatus);
  const normalizedTranscript = normalizeTranscript(transcript);
  const detectedHotword = detectHotwordFromTranscript(transcript);

  if (!detectedHotword) {
    logHotword('submitRecognizedTranscript:ignored', {
      transcript,
    });
    return;
  }

  if (!shouldAcceptDetectedHotword(detectedHotword)) {
    trackHotwordDecision({
      transcriptRaw: transcript,
      transcriptNormalized: normalizedTranscript,
      hotwordStatus,
      allowedHotwords,
      detectedHotword,
      decision: 'cooldown_blocked',
      reason: 'same_hotword_cooldown',
    });

    logHotword('submitRecognizedTranscript:cooldown-blocked', {
      detectedHotword,
    });
    return;
  }

  trackHotwordDecision({
    transcriptRaw: transcript,
    transcriptNormalized: normalizedTranscript,
    hotwordStatus,
    allowedHotwords,
    detectedHotword,
    decision: 'accepted',
    reason: 'exact_match',
  });

  logHotword('submitRecognizedTranscript:accepted', {
    detectedHotword,
  });

  submitDetectedHotwordToLaufBuddyRuntime(detectedHotword);
}

async function ensureModelLoaded(): Promise<void> {
  if (isModelLoaded) {
    logHotword('ensureModelLoaded:already-loaded');
    return;
  }

  if (modelLoadPromise) {
    logHotword('ensureModelLoaded:await-existing-promise');
    await modelLoadPromise;
    return;
  }

  logHotword('ensureModelLoaded:start', {
    modelPath: MODEL_PATH,
  });

  modelLoadPromise = hotwordRecognizer
    .loadModel(MODEL_PATH)
    .then(() => {
      isModelLoaded = true;
      logHotword('ensureModelLoaded:success');
    })
    .finally(() => {
      modelLoadPromise = null;
      logHotword('ensureModelLoaded:finally');
    });

  await modelLoadPromise;
}

async function startRecognizerIfNeeded(): Promise<void> {
  logHotword('startRecognizerIfNeeded:enter', {
    isRecognizerRunning,
    hasStartPromise: recognizerStartPromise !== null,
    hotwordStatus: useHotwordStore.getState().status,
  });

  if (isRecognizerRunning) {
    logHotword('startRecognizerIfNeeded:skip-already-running');
    return;
  }

  if (recognizerStartPromise) {
    logHotword('startRecognizerIfNeeded:await-existing-promise');
    await recognizerStartPromise;
    return;
  }

  if (!shouldRecognizerRun(useHotwordStore.getState().status)) {
    logHotword('startRecognizerIfNeeded:skip-status-not-runnable', {
      hotwordStatus: useHotwordStore.getState().status,
    });
    return;
  }

  recognizerStartPromise = (async () => {
    await ensureModelLoaded();

    logHotword('startRecognizerIfNeeded:calling-vosk-start', {
      grammarMode: 'off',
    });

    await hotwordRecognizer.start();

    isRecognizerRunning = true;
    logHotword('startRecognizerIfNeeded:started');
  })().finally(() => {
    recognizerStartPromise = null;
    logHotword('startRecognizerIfNeeded:finally');
  });

  await recognizerStartPromise;
}

async function stopRecognizerIfNeeded(): Promise<void> {
  logHotword('stopRecognizerIfNeeded:enter', {
    isRecognizerRunning,
    hasStartPromise: recognizerStartPromise !== null,
  });

  if (recognizerStartPromise) {
    try {
      await recognizerStartPromise;
    } catch (error) {
      logHotword('stopRecognizerIfNeeded:start-promise-error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!isRecognizerRunning) {
    logHotword('stopRecognizerIfNeeded:skip-not-running');
    return;
  }

  try {
    await hotwordRecognizer.stop();
    logHotword('stopRecognizerIfNeeded:stopped');
  } finally {
    isRecognizerRunning = false;
    logHotword('stopRecognizerIfNeeded:finally');
  }
}

async function unloadRecognizerIfNeeded(): Promise<void> {
  logHotword('unloadRecognizerIfNeeded:enter');

  hotwordRecognizer.unload();

  logHotword('unloadRecognizerIfNeeded:done');
}

function syncRecognizerWithHotwordStatus(): void {
  const hotwordStatus = useHotwordStore.getState().status;

  logHotword('syncRecognizerWithHotwordStatus', {
    hotwordStatus,
    isRecognizerRunning,
  });

  if (shouldRecognizerRun(hotwordStatus)) {
    void startRecognizerIfNeeded();
    return;
  }

  void stopRecognizerIfNeeded();
}

export function startHotwordRecognitionListener(): () => void {
  logHotword('startHotwordRecognitionListener:start');

  const recognizerSubscriptions: RemovableSubscription[] = [
    hotwordRecognizer.onResult((transcript: string) => {
      logHotword('event:onResult', { transcript });
      submitRecognizedTranscript(transcript);
    }),
    hotwordRecognizer.onFinalResult((transcript: string) => {
      logHotword('event:onFinalResult', { transcript });
      submitRecognizedTranscript(transcript);
    }),
    hotwordRecognizer.onError((error: unknown) => {
      logHotword('event:onError', {
        error: error instanceof Error ? error.message : String(error),
      });
      isRecognizerRunning = false;
      syncRecognizerWithHotwordStatus();
    }),
    hotwordRecognizer.onTimeout(() => {
      logHotword('event:onTimeout');
      isRecognizerRunning = false;
      syncRecognizerWithHotwordStatus();
    }),
  ];

  const unsubscribeHotwordStore = useHotwordStore.subscribe(() => {
    logHotword('hotwordStore:changed', {
      hotwordStatus: useHotwordStore.getState().status,
    });
    syncRecognizerWithHotwordStatus();
  });

  syncRecognizerWithHotwordStatus();

  return () => {
    logHotword('startHotwordRecognitionListener:cleanup');

    unsubscribeHotwordStore();

    recognizerSubscriptions.forEach((subscription) => {
      subscription.remove();
    });

    void (async () => {
      try {
        await stopRecognizerIfNeeded();
        await unloadRecognizerIfNeeded();
      } finally {
        resetRecognizerRuntimeState();
      }
    })();
  };
}

export default startHotwordRecognitionListener;