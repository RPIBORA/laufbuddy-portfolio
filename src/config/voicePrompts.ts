import * as Speech from 'expo-speech';
import {
  abandonAudioFocus,
  requestSpeechAudioFocus,
} from '../services/audioFocusControlService';

const voicePromptTexts = {
  helpDetected: 'Hilfe erkannt.',
  contactCallStarting: 'Kontaktanruf wird gestartet.',
  buddyConnectionLostSoloProtectionActive:
    'Buddy-Verbindung verloren. Solo-Schutz aktiv.',
  buddyConnectionRestored: 'Buddy-Verbindung wieder da.',
  runStarted: 'Lauf begonnen.',
  runPaused: 'Lauf pausiert.',
  runResumed: 'Lauf fortgesetzt.',
  runStopped: 'Lauf beendet.',
} as const;

export type VoicePromptKey = keyof typeof voicePromptTexts;

let activeSpeechToken: number | null = null;

const VOICE_LANGUAGE = 'de-DE';
const VOICE_RATE = 1.08;
const VOICE_PITCH = 0.82;

function finishSpeech(
  token: number,
  outcome: 'done' | 'stopped' | 'error',
): void {
  if (token !== activeSpeechToken) {
    console.warn('[voicePrompts] stale completion ignored', {
      speechToken: token,
      activeSpeechToken,
      outcome,
    });
    return;
  }

  activeSpeechToken = null;

  void abandonAudioFocus()
    .then(() => {
      console.info('[voicePrompts] audio focus released', {
        speechToken: token,
        outcome,
      });
    })
    .catch((error: unknown) => {
      console.warn('[voicePrompts] audio focus release failed', {
        speechToken: token,
        outcome,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    });
}

function speakMessage(
  message: string,
  source: 'free_text' | 'prompt_keys',
  promptKeys: string[] = [],
): void {
  const trimmedMessage = message.trim();

  if (trimmedMessage.length === 0) {
    console.warn('[voicePrompts] empty speech skipped', {
      source,
      promptKeys,
    });
    return;
  }

  const speechToken = Date.now();
  const previousSpeechToken = activeSpeechToken;
  const hadActiveSpeech = previousSpeechToken !== null;

  activeSpeechToken = speechToken;

  console.info('[voicePrompts] requested', {
    speechToken,
    previousSpeechToken,
    hadActiveSpeech,
    source,
    promptKeys,
    text: trimmedMessage,
  });

  void (async () => {
    try {
      await requestSpeechAudioFocus();

      console.info('[voicePrompts] audio focus granted', {
        speechToken,
      });
    } catch (error) {
      console.warn('[voicePrompts] audio focus failed', {
        speechToken,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }

    if (hadActiveSpeech) {
      console.info('[voicePrompts] previous speech stop requested', {
        speechToken,
        previousSpeechToken,
      });

      await Speech.stop();

      console.info('[voicePrompts] previous speech stop completed', {
        speechToken,
        previousSpeechToken,
      });
    }

    Speech.speak(trimmedMessage, {
      language: VOICE_LANGUAGE,
      rate: VOICE_RATE,
      pitch: VOICE_PITCH,
      onStart: () => {
        console.info('[voicePrompts] started', {
          speechToken,
          source,
          promptKeys,
          text: trimmedMessage,
        });
      },
      onDone: () => {
        console.info('[voicePrompts] done', {
          speechToken,
          text: trimmedMessage,
        });

        finishSpeech(speechToken, 'done');
      },
      onStopped: () => {
        console.warn('[voicePrompts] stopped', {
          speechToken,
          text: trimmedMessage,
        });

        finishSpeech(speechToken, 'stopped');
      },
      onError: (error) => {
        console.error('[voicePrompts] error', {
          speechToken,
          text: trimmedMessage,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });

        finishSpeech(speechToken, 'error');
      },
    });
  })().catch((error: unknown) => {
    console.error('[voicePrompts] request aborted', {
      speechToken,
      text: trimmedMessage,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  });
}

export const voicePrompts = {
  ...voicePromptTexts,

  speakText(message: string): void {
    speakMessage(message, 'free_text');
  },

  speakMany(promptKeys: VoicePromptKey[]): void {
    const messages = promptKeys
      .map((promptKey) => voicePromptTexts[promptKey])
      .filter((message) => typeof message === 'string' && message.length > 0);

    if (messages.length === 0) {
      return;
    }

    speakMessage(
      messages.join(' '),
      'prompt_keys',
      [...promptKeys],
    );
  },
} as const;