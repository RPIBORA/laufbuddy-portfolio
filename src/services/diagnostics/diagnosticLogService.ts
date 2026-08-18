// src/services/diagnostics/diagnosticLogService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DiagnosticEventLevel = 'info' | 'warn' | 'error';

export type DiagnosticEventArea =
  | 'app'
  | 'safety'
  | 'hotword'
  | 'headset'
  | 'run'
  | 'buddy'
  | 'audio'
  | 'permission'
  | 'storage'
  | 'ui'
  | 'system';

export type DiagnosticEvent = {
  id: string;
  timestamp: number;
  level: DiagnosticEventLevel;
  area: DiagnosticEventArea;
  event: string;
  message: string;
  details: Record<string, string | number | boolean | null>;
};

export type AddDiagnosticEventParams = {
  level?: DiagnosticEventLevel;
  area: DiagnosticEventArea;
  event: string;
  message: string;
  details?: Record<string, string | number | boolean | null | undefined>;
};

const DIAGNOSTIC_LOG_STORAGE_KEY = 'laufbuddy_diagnostic_log_v1';
const DIAGNOSTIC_SESSION_STORAGE_KEY = 'laufbuddy_diagnostic_session_v1';
const DIAGNOSTIC_PENDING_UNCLEAN_SESSION_STORAGE_KEY =
  'laufbuddy_diagnostic_pending_unclean_session_v1';
const MAX_DIAGNOSTIC_EVENTS = 1000;

let diagnosticWriteQueue: Promise<void> = Promise.resolve();
let activeDiagnosticSessionId: string | null = null;

export type DiagnosticSessionState = {
  sessionId: string;
  startedAt: number;
  lastSeenAt: number;
  cleanShutdown: boolean;
  lastKnownArea: DiagnosticEventArea;
  lastKnownEvent: string;
  lastKnownMessage: string;
};

function createDiagnosticId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

function cleanDetails(
  details: Record<string, string | number | boolean | null | undefined> = {},
): Record<string, string | number | boolean | null> {
  const cleaned: Record<string, string | number | boolean | null> = {};

  Object.entries(details).forEach(([key, value]) => {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  });

  return cleaned;
}

async function readDiagnosticEvents(): Promise<DiagnosticEvent[]> {
  const rawValue = await AsyncStorage.getItem(DIAGNOSTIC_LOG_STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter((entry): entry is DiagnosticEvent => {
      return (
        typeof entry === 'object' &&
        entry !== null &&
        typeof entry.id === 'string' &&
        typeof entry.timestamp === 'number' &&
        typeof entry.level === 'string' &&
        typeof entry.area === 'string' &&
        typeof entry.event === 'string' &&
        typeof entry.message === 'string' &&
        typeof entry.details === 'object' &&
        entry.details !== null
      );
    });
  } catch {
    return [];
  }
}

async function writeDiagnosticEvents(events: DiagnosticEvent[]): Promise<void> {
  const trimmedEvents = events.slice(-MAX_DIAGNOSTIC_EVENTS);
  await AsyncStorage.setItem(
    DIAGNOSTIC_LOG_STORAGE_KEY,
    JSON.stringify(trimmedEvents),
  );
}

async function readSessionState(): Promise<DiagnosticSessionState | null> {
  const rawValue = await AsyncStorage.getItem(DIAGNOSTIC_SESSION_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue);

    if (
      typeof parsedValue === 'object' &&
      parsedValue !== null &&
      typeof parsedValue.sessionId === 'string' &&
      typeof parsedValue.startedAt === 'number' &&
      typeof parsedValue.lastSeenAt === 'number' &&
      typeof parsedValue.cleanShutdown === 'boolean' &&
      typeof parsedValue.lastKnownArea === 'string' &&
      typeof parsedValue.lastKnownEvent === 'string' &&
      typeof parsedValue.lastKnownMessage === 'string'
    ) {
      return parsedValue;
    }

    return null;
  } catch {
    return null;
  }
}

async function writeSessionState(
  sessionState: DiagnosticSessionState,
): Promise<void> {
  await AsyncStorage.setItem(
    DIAGNOSTIC_SESSION_STORAGE_KEY,
    JSON.stringify(sessionState),
  );
}

async function writePendingUncleanSession(
  sessionState: DiagnosticSessionState,
): Promise<void> {
  await AsyncStorage.setItem(
    DIAGNOSTIC_PENDING_UNCLEAN_SESSION_STORAGE_KEY,
    JSON.stringify(sessionState),
  );
}

async function readPendingUncleanSession(): Promise<DiagnosticSessionState | null> {
  const rawValue = await AsyncStorage.getItem(
    DIAGNOSTIC_PENDING_UNCLEAN_SESSION_STORAGE_KEY,
  );

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue);

    if (
      typeof parsedValue === 'object' &&
      parsedValue !== null &&
      typeof parsedValue.sessionId === 'string' &&
      typeof parsedValue.startedAt === 'number' &&
      typeof parsedValue.lastSeenAt === 'number' &&
      typeof parsedValue.cleanShutdown === 'boolean' &&
      typeof parsedValue.lastKnownArea === 'string' &&
      typeof parsedValue.lastKnownEvent === 'string' &&
      typeof parsedValue.lastKnownMessage === 'string'
    ) {
      return parsedValue;
    }

    return null;
  } catch {
    return null;
  }
}

export async function resolvePendingUncleanDiagnosticSession(): Promise<void> {
  await AsyncStorage.removeItem(DIAGNOSTIC_PENDING_UNCLEAN_SESSION_STORAGE_KEY);
}

export function addDiagnosticEvent(
  params: AddDiagnosticEventParams,
): Promise<void> {
  diagnosticWriteQueue = diagnosticWriteQueue.then(async () => {
    const {
      level = 'info',
      area,
      event,
      message,
      details = {},
    } = params;

    try {
      const currentSession = await readSessionState();

      const nextEvent: DiagnosticEvent = {
        id: createDiagnosticId(),
        timestamp: Date.now(),
        level,
        area,
        event,
        message,
        details: {
          ...cleanDetails(details),
          sessionId:
            activeDiagnosticSessionId ??
            currentSession?.sessionId ??
            null,
        },
      };

      const currentEvents = await readDiagnosticEvents();

      await writeDiagnosticEvents([
        ...currentEvents,
        nextEvent,
      ]);

      if (
        currentSession !== null &&
        currentSession.sessionId === activeDiagnosticSessionId
      ) {
        await writeSessionState({
          ...currentSession,
          lastSeenAt: nextEvent.timestamp,
          cleanShutdown: false,
          lastKnownArea: area,
          lastKnownEvent: event,
          lastKnownMessage: message,
        });
      }

      console.log('[DiagnosticLog]', {
        level: nextEvent.level,
        area: nextEvent.area,
        event: nextEvent.event,
        message: nextEvent.message,
        details: nextEvent.details,
      });
    } catch (error) {
      console.log('[DiagnosticLog] Fehler beim Schreiben', {
        event: params.event,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  });

  return diagnosticWriteQueue;
}

type DiagnosticConsoleMethod =
  | 'log'
  | 'info'
  | 'warn'
  | 'error';

type DiagnosticConsoleFunction =
  (...args: unknown[]) => void;

type DiagnosticConsoleSource = {
  prefix: string;
  source: string;
  area: DiagnosticEventArea;
};

const DIAGNOSTIC_CONSOLE_SOURCES:
DiagnosticConsoleSource[] = [
  {
    prefix: '[Core]',
    source: 'CORE',
    area: 'app',
  },
  {
    prefix: '[LaufBuddyRuntime]',
    source: 'RUNTIME',
    area: 'app',
  },
  {
    prefix: '[RunTrackingBridge]',
    source: 'RUN_TRACKING',
    area: 'run',
  },
  {
    prefix: '[RunBackgroundLocation]',
    source: 'BACKGROUND_GPS',
    area: 'run',
  },
  {
    prefix: '[RunLocationTracking]',
    source: 'FOREGROUND_GPS',
    area: 'run',
  },
  {
    prefix: '[voicePrompts]',
    source: 'VOICE',
    area: 'audio',
  },
  {
    prefix: '[AudioFocusControl]',
    source: 'AUDIO_FOCUS',
    area: 'audio',
  },
  {
    prefix: '[LaufBuddyHotwordControl]',
    source: 'HOTWORD_CONTROL',
    area: 'hotword',
  },
  {
    prefix: '[EmergencyCallExecutor]',
    source: 'EMERGENCY_CALL',
    area: 'safety',
  },
];

let activeDiagnosticConsoleWatcherCleanup:
(() => void) | null = null;

function serializeDiagnosticConsoleValue(
  value: unknown,
): string {
  if (value instanceof Error) {
    return JSON.stringify({
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    });
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  try {
    const serializedValue = JSON.stringify(value);

    return typeof serializedValue === 'string'
      ? serializedValue
      : String(value);
  } catch {
    return String(value);
  }
}

function normalizeDiagnosticConsoleEventName(
  value: string,
): string {
  const normalizedValue = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

  return normalizedValue.length > 0
    ? normalizedValue.slice(0, 70)
    : 'EVENT';
}

function resolveDiagnosticConsoleSource(
  firstArgument: unknown,
): DiagnosticConsoleSource | null {
  if (typeof firstArgument !== 'string') {
    return null;
  }

  if (firstArgument.startsWith('[DiagnosticLog]')) {
    return null;
  }

  return (
    DIAGNOSTIC_CONSOLE_SOURCES.find((source) =>
      firstArgument.startsWith(source.prefix),
    ) ?? null
  );
}

export function installDiagnosticConsoleWatcher():
() => void {
  if (activeDiagnosticConsoleWatcherCleanup !== null) {
    return activeDiagnosticConsoleWatcherCleanup;
  }

  const consoleRecord =
    console as unknown as Record<
      DiagnosticConsoleMethod,
      DiagnosticConsoleFunction
    >;

  const methods: DiagnosticConsoleMethod[] = [
    'log',
    'info',
    'warn',
    'error',
  ];

  const originalMethods: Record<
    DiagnosticConsoleMethod,
    DiagnosticConsoleFunction
  > = {
    log: consoleRecord.log,
    info: consoleRecord.info,
    warn: consoleRecord.warn,
    error: consoleRecord.error,
  };

  methods.forEach((method) => {
    consoleRecord[method] = (...args: unknown[]) => {
      originalMethods[method].apply(console, args);

      /*
       * Vor startDiagnosticSession() dürfen keine Ereignisse
       * in die vorherige Sitzung geschrieben werden.
       */
      if (activeDiagnosticSessionId === null) {
        return;
      }

      const source = resolveDiagnosticConsoleSource(args[0]);

      if (source === null) {
        return;
      }

      const firstArgument =
        typeof args[0] === 'string'
          ? args[0]
          : source.prefix;

      const message =
        firstArgument.slice(source.prefix.length).trim() ||
        firstArgument;

      const payload = args
        .slice(1)
        .map(serializeDiagnosticConsoleValue)
        .join(' | ')
        .slice(0, 4000);

      void addDiagnosticEvent({
        level:
          method === 'error'
            ? 'error'
            : method === 'warn'
              ? 'warn'
              : 'info',
        area: source.area,
        event: [
          'WATCH',
          source.source,
          method.toUpperCase(),
          normalizeDiagnosticConsoleEventName(message),
        ].join('_'),
        message,
        details: {
          consoleMethod: method,
          source: source.source,
          payload:
            payload.length > 0
              ? payload
              : null,
        },
      });
    };
  });

  activeDiagnosticConsoleWatcherCleanup = () => {
    methods.forEach((method) => {
      consoleRecord[method] = originalMethods[method];
    });

    activeDiagnosticConsoleWatcherCleanup = null;
  };

  return activeDiagnosticConsoleWatcherCleanup;
}

export async function startDiagnosticSession(): Promise<{
  sessionId: string;
  previousSessionWasClean: boolean;
  previousSession: DiagnosticSessionState | null;
}> {
  const previousSession = await readSessionState();
  const pendingUncleanSession = await readPendingUncleanSession();
  const currentPreviousSessionWasClean = previousSession?.cleanShutdown !== false;
  const previousSessionWasClean =
    currentPreviousSessionWasClean && pendingUncleanSession === null;
  const reportablePreviousSession = pendingUncleanSession ?? previousSession;
  const sessionId = createDiagnosticId();
  const now = Date.now();

  await writeSessionState({
    sessionId,
    startedAt: now,
    lastSeenAt: now,
    cleanShutdown: false,
    lastKnownArea: 'app',
    lastKnownEvent: 'APP_START',
    lastKnownMessage: 'LaufBuddy gestartet',
  });

  activeDiagnosticSessionId = sessionId;

  await addDiagnosticEvent({
    level: previousSessionWasClean ? 'info' : 'warn',
    area: 'app',
    event: previousSessionWasClean
      ? 'APP_START'
      : 'APP_PREVIOUS_SESSION_UNCLEAN',
    message: previousSessionWasClean
      ? 'LaufBuddy gestartet'
      : 'Vorherige Sitzung wurde nicht sauber beendet',
    details: {
      sessionId,
      previousSessionId: reportablePreviousSession?.sessionId ?? null,
      previousLastKnownArea: reportablePreviousSession?.lastKnownArea ?? null,
      previousLastKnownEvent: reportablePreviousSession?.lastKnownEvent ?? null,
      previousLastKnownMessage: reportablePreviousSession?.lastKnownMessage ?? null,
      previousLastSeenAt: reportablePreviousSession?.lastSeenAt ?? null,
    },
  });

  if (pendingUncleanSession !== null) {
    await resolvePendingUncleanDiagnosticSession();
  } else if (!previousSessionWasClean && reportablePreviousSession !== null) {
    await writePendingUncleanSession(reportablePreviousSession);
  }

  return {
    sessionId,
    previousSessionWasClean,
    previousSession: previousSessionWasClean ? null : reportablePreviousSession,
  };
}

export async function markDiagnosticSessionClean(
  reason: string,
): Promise<void> {
  const currentSession = await readSessionState();

  if (currentSession === null) {
    return;
  }

  const now = Date.now();

  await writeSessionState({
    ...currentSession,
    lastSeenAt: now,
    cleanShutdown: true,
    lastKnownArea: 'app',
    lastKnownEvent: 'APP_CLEAN_MARKER',
    lastKnownMessage: reason,
  });

  await addDiagnosticEvent({
    area: 'app',
    event: 'APP_CLEAN_MARKER',
    message: reason,
    details: {
      sessionId: currentSession.sessionId,
    },
  });
}

export async function getDiagnosticEvents(): Promise<DiagnosticEvent[]> {
  return readDiagnosticEvents();
}

export async function clearDiagnosticEvents(): Promise<void> {
  await diagnosticWriteQueue;

  await AsyncStorage.multiRemove([
    DIAGNOSTIC_LOG_STORAGE_KEY,
    DIAGNOSTIC_SESSION_STORAGE_KEY,
    DIAGNOSTIC_PENDING_UNCLEAN_SESSION_STORAGE_KEY,
  ]);
}

export async function createDiagnosticTextReport(): Promise<string> {
  await diagnosticWriteQueue;

  const events = await readDiagnosticEvents();
  const session = await readSessionState();

  const lines = events.map((entry) => {
    return [
      new Date(entry.timestamp).toISOString(),
      entry.level.toUpperCase(),
      entry.area,
      entry.event,
      entry.message,
      JSON.stringify(entry.details),
    ].join(' | ');
  });

  return [
    '===== LaufBuddy Diagnosebericht =====',
    `Erstellt: ${new Date().toISOString()}`,
    `Einträge: ${events.length}`,
    `Aktuelle Session: ${session?.sessionId ?? '-'}`,
    `Letzter Zustand: ${session?.lastKnownEvent ?? '-'}`,
    '',
    'Hinweis: Dieser Bericht enthält technische Stabilitätsdaten.',
    'Keine GPS-Spur, keine Kontakte, keine Telefonnummern und keine Mikrofonaufnahme.',
    'Technische Texte angeforderter Sprachausgaben können enthalten sein.',
    '',
    ...lines,
  ].join('\n');
}
