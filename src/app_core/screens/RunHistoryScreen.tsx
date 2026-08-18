// src/app_core/screens/RunHistoryScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  Clock3,
  History,
  Map as MapIcon,
  RotateCcw,
} from 'lucide-react-native';
import {
  STANDARD_WHEEL_SIZE,
  SafetyWheel,
  type SafetyWheelItem,
} from '../components/SafetyWheel';
import { useRunHistory } from '../state/useRunHistory';
import type { RunHistoryEntry } from '../models/ShoeModels';

type RunHistoryScreenProps = {
  onOpenRunDetail: (runId: string) => void;
};

type HistoryLevel =
  | 'recent'
  | 'months'
  | 'weeks'
  | 'days'
  | 'dayRuns';

type MonthGroup = {
  key: string;
  year: number;
  monthIndex: number;
  label: string;
  shortLabel: string;
  runs: RunHistoryEntry[];
};

type WeekGroup = {
  key: string;
  isoYear: number;
  weekNumber: number;
  startTimestamp: number;
  endTimestamp: number;
  runs: RunHistoryEntry[];
};

type DayGroup = {
  key: string;
  timestamp: number;
  label: string;
  runs: RunHistoryEntry[];
};

type CenterModel = {
  top: string;
  primary: string;
  secondary: string;
  action: string;
};

const HISTORY_WHEEL_SIZE = STANDARD_WHEEL_SIZE;

const RECENT_RUN_LIMIT = 7;
const MONTHS_PER_PAGE = 6;

const MONTH_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];

const WEEKDAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.`;
}

function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp);

  return `${pad(date.getDate())}.${pad(
    date.getMonth() + 1,
  )}.${date.getFullYear()} · ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDuration(durationSeconds: number): string {
  const totalSeconds = Math.max(0, Math.round(durationSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${minutes}:${pad(seconds)}`;
}

function formatDistance(distanceKm: number): string {
  return `${distanceKm.toFixed(2)} km`;
}

function sumDistance(runs: RunHistoryEntry[]): number {
  return runs.reduce((sum, run) => sum + run.distanceKm, 0);
}

function createMonthKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function createDayKey(timestamp: number): string {
  const date = new Date(timestamp);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function getIsoWeekInfo(timestamp: number): {
  key: string;
  isoYear: number;
  weekNumber: number;
  startTimestamp: number;
  endTimestamp: number;
} {
  const localDate = new Date(timestamp);

  const utcDate = new Date(
    Date.UTC(
      localDate.getFullYear(),
      localDate.getMonth(),
      localDate.getDate(),
    ),
  );

  const isoDay = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - isoDay);

  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));

  const weekNumber = Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );

  const localWeekday = (localDate.getDay() + 6) % 7;
  const startDate = new Date(
    localDate.getFullYear(),
    localDate.getMonth(),
    localDate.getDate() - localWeekday,
  );

  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);

  return {
    key: `${isoYear}-KW-${pad(weekNumber)}`,
    isoYear,
    weekNumber,
    startTimestamp: startDate.getTime(),
    endTimestamp: endDate.getTime(),
  };
}

function formatWeekRange(week: WeekGroup): string {
  const start = new Date(week.startTimestamp);
  const end = new Date(week.endTimestamp);

  if (start.getMonth() === end.getMonth()) {
    return `${pad(start.getDate())}.–${pad(end.getDate())}. ${
      MONTH_NAMES[end.getMonth()]
    }`;
  }

  return `${pad(start.getDate())}. ${
    MONTH_SHORT_NAMES[start.getMonth()]
  }–${pad(end.getDate())}. ${MONTH_SHORT_NAMES[end.getMonth()]}`;
}

function createMonthGroups(runs: RunHistoryEntry[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();

  for (const run of runs) {
    const date = new Date(run.startedAt);
    const key = createMonthKey(run.startedAt);

    const existing = groups.get(key);

    if (existing) {
      existing.runs.push(run);
      continue;
    }

    groups.set(key, {
      key,
      year: date.getFullYear(),
      monthIndex: date.getMonth(),
      label: `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`,
      shortLabel: `${MONTH_SHORT_NAMES[date.getMonth()]} ${String(
        date.getFullYear(),
      ).slice(-2)}`,
      runs: [run],
    });
  }

  return Array.from(groups.values()).sort((a, b) => {
    return (
      new Date(b.year, b.monthIndex, 1).getTime() -
      new Date(a.year, a.monthIndex, 1).getTime()
    );
  });
}

function createWeekGroups(monthRuns: RunHistoryEntry[]): WeekGroup[] {
  const groups = new Map<string, WeekGroup>();

  for (const run of monthRuns) {
    const info = getIsoWeekInfo(run.startedAt);
    const existing = groups.get(info.key);

    if (existing) {
      existing.runs.push(run);
      continue;
    }

    groups.set(info.key, {
      ...info,
      runs: [run],
    });
  }

  return Array.from(groups.values()).sort(
    (a, b) => b.startTimestamp - a.startTimestamp,
  );
}

function createDayGroups(weekRuns: RunHistoryEntry[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();

  for (const run of weekRuns) {
    const date = new Date(run.startedAt);
    const key = createDayKey(run.startedAt);
    const existing = groups.get(key);

    if (existing) {
      existing.runs.push(run);
      continue;
    }

    groups.set(key, {
      key,
      timestamp: new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      ).getTime(),
      label: `${WEEKDAY_NAMES[date.getDay()]} ${pad(date.getDate())}.`,
      runs: [run],
    });
  }

  return Array.from(groups.values()).sort(
    (a, b) => a.timestamp - b.timestamp,
  );
}

export default function RunHistoryScreen({
  onOpenRunDetail,
}: RunHistoryScreenProps) {
  const runs = useRunHistory((state) => state.runs);

  const sortedRuns = useMemo(
    () => [...runs].sort((a, b) => b.startedAt - a.startedAt),
    [runs],
  );

  const recentRuns = useMemo(
    () => sortedRuns.slice(0, RECENT_RUN_LIMIT),
    [sortedRuns],
  );

  const monthGroups = useMemo(
    () => createMonthGroups(sortedRuns),
    [sortedRuns],
  );

  const [level, setLevel] = useState<HistoryLevel>('recent');
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [monthPage, setMonthPage] = useState(0);

  const totalMonthPages = Math.max(
    1,
    Math.ceil(monthGroups.length / MONTHS_PER_PAGE),
  );

  const monthPageGroups = useMemo(() => {
    const startIndex = monthPage * MONTHS_PER_PAGE;
    return monthGroups.slice(startIndex, startIndex + MONTHS_PER_PAGE);
  }, [monthGroups, monthPage]);

  const selectedMonth =
    monthGroups.find((group) => group.key === selectedMonthKey) ?? null;

  const weeksForSelectedMonth = useMemo(
    () => createWeekGroups(selectedMonth?.runs ?? []),
    [selectedMonth],
  );

  const selectedWeek =
    weeksForSelectedMonth.find((group) => group.key === selectedWeekKey) ??
    null;

  const selectedWeekRuns = useMemo(() => {
    if (!selectedWeek) {
      return [];
    }

    return sortedRuns.filter(
      (run) => getIsoWeekInfo(run.startedAt).key === selectedWeek.key,
    );
  }, [selectedWeek, sortedRuns]);

  const daysForSelectedWeek = useMemo(
    () => createDayGroups(selectedWeekRuns),
    [selectedWeekRuns],
  );

  const selectedDay =
    daysForSelectedWeek.find((group) => group.key === selectedDayKey) ?? null;

  const selectedDayRuns = useMemo(
    () =>
      [...(selectedDay?.runs ?? [])].sort(
        (a, b) => b.startedAt - a.startedAt,
      ),
    [selectedDay],
  );

  const openMonths = useCallback(() => {
    setMonthPage(0);
    setSelectedMonthKey(null);
    setLevel('months');
  }, []);

  const openMonth = useCallback((monthKey: string) => {
    setSelectedMonthKey(monthKey);
    setSelectedWeekKey(null);
    setLevel('weeks');
  }, []);

  const openWeek = useCallback((weekKey: string) => {
    setSelectedWeekKey(weekKey);
    setSelectedDayKey(null);
    setLevel('days');
  }, []);

  const openDay = useCallback(
    (dayKey: string) => {
      const day = daysForSelectedWeek.find((group) => group.key === dayKey);

      if (!day) {
        return;
      }

      if (day.runs.length === 1) {
        onOpenRunDetail(day.runs[0].id);
        return;
      }

      setSelectedDayKey(dayKey);
      setLevel('dayRuns');
    },
    [daysForSelectedWeek, onOpenRunDetail],
  );

  const goBackOneLevel = useCallback(() => {
    if (level === 'dayRuns') {
      setLevel('days');
      return;
    }

    if (level === 'days') {
      setLevel('weeks');
      return;
    }

    if (level === 'weeks') {
      setLevel('months');
      return;
    }

    setLevel('recent');
  }, [level]);

  const wheelItems = useMemo<SafetyWheelItem[]>(() => {
    if (level === 'recent') {
      return [
        ...recentRuns.map((run) => ({
          key: `run-${run.id}`,
          label: formatShortDate(run.startedAt),
          icon: MapIcon,
          action: () => onOpenRunDetail(run.id),
        })),
        {
          key: 'open-months',
          label: 'Monate',
          icon: CalendarRange,
          action: openMonths,
        },
      ];
    }

    if (level === 'months') {
      const items: SafetyWheelItem[] = monthPageGroups.map((month) => ({
        key: `month-${month.key}`,
        label: month.shortLabel,
        icon: CalendarDays,
        action: () => openMonth(month.key),
      }));

      if (monthPage > 0) {
        items.push({
          key: 'newer-months',
          label: 'Neuere',
          icon: RotateCcw,
          action: () => setMonthPage((current) => Math.max(0, current - 1)),
        });
      }

      if (monthPage + 1 < totalMonthPages) {
        items.push({
          key: 'older-months',
          label: 'Ältere',
          icon: History,
          action: () =>
            setMonthPage((current) =>
              Math.min(totalMonthPages - 1, current + 1),
            ),
        });
      }

      return items;
    }

    if (level === 'weeks') {
      return weeksForSelectedMonth.map((week) => ({
        key: `week-${week.key}`,
        label: `KW ${week.weekNumber}`,
        icon: CalendarRange,
        action: () => openWeek(week.key),
      }));
    }

    if (level === 'days') {
      return daysForSelectedWeek.map((day) => ({
        key: `day-${day.key}`,
        label: day.label,
        icon: CalendarDays,
        action: () => openDay(day.key),
      }));
    }

    return selectedDayRuns.map((run) => ({
      key: `day-run-${run.id}`,
      label: formatTime(run.startedAt),
      icon: Clock3,
      action: () => onOpenRunDetail(run.id),
    }));
  }, [
    daysForSelectedWeek,
    level,
    monthPage,
    monthPageGroups,
    onOpenRunDetail,
    openDay,
    openMonth,
    openMonths,
    openWeek,
    recentRuns,
    selectedDayRuns,
    totalMonthPages,
    weeksForSelectedMonth,
  ]);

  useEffect(() => {
    const selectedStillExists = wheelItems.some(
      (item) => item.key === selectedItemKey,
    );

    if (!selectedStillExists) {
      setSelectedItemKey(wheelItems[0]?.key ?? null);
    }
  }, [selectedItemKey, wheelItems]);

  const centerModel = useMemo<CenterModel>(() => {
    if (level === 'recent') {
      if (selectedItemKey === 'open-months') {
        return {
          top: 'ARCHIV',
          primary: `${monthGroups.length} ${
            monthGroups.length === 1 ? 'Monat' : 'Monate'
          }`,
          secondary: `${sortedRuns.length} Läufe gespeichert`,
          action: 'MONATE',
        };
      }

      const run = recentRuns.find(
        (entry) => `run-${entry.id}` === selectedItemKey,
      );

      if (run) {
        return {
          top: formatShortDate(run.startedAt),
          primary: formatDistance(run.distanceKm),
          secondary: formatDuration(run.durationSeconds),
          action: 'ÖFFNEN',
        };
      }
    }

    if (level === 'months') {
      if (
        selectedItemKey === 'newer-months' ||
        selectedItemKey === 'older-months'
      ) {
        return {
          top: 'MONATE',
          primary:
            selectedItemKey === 'newer-months' ? 'Neuere' : 'Ältere',
          secondary: `Seite ${monthPage + 1} von ${totalMonthPages}`,
          action: 'WECHSELN',
        };
      }

      const month = monthPageGroups.find(
        (entry) => `month-${entry.key}` === selectedItemKey,
      );

      if (month) {
        return {
          top: month.label,
          primary: `${month.runs.length} ${
            month.runs.length === 1 ? 'Lauf' : 'Läufe'
          }`,
          secondary: `${sumDistance(month.runs).toFixed(1)} km`,
          action: 'KALENDERWOCHEN',
        };
      }
    }

    if (level === 'weeks') {
      const week = weeksForSelectedMonth.find(
        (entry) => `week-${entry.key}` === selectedItemKey,
      );

      if (week) {
        return {
          top: `KW ${week.weekNumber}`,
          primary: formatWeekRange(week),
          secondary: `${selectedWeekRuns.length || week.runs.length} Läufe`,
          action: 'TAGE',
        };
      }
    }

    if (level === 'days') {
      const day = daysForSelectedWeek.find(
        (entry) => `day-${entry.key}` === selectedItemKey,
      );

      if (day) {
        return {
          top: day.label,
          primary: `${day.runs.length} ${
            day.runs.length === 1 ? 'Lauf' : 'Läufe'
          }`,
          secondary: `${sumDistance(day.runs).toFixed(2)} km`,
          action: day.runs.length === 1 ? 'ÖFFNEN' : 'LÄUFE',
        };
      }
    }

    const run = selectedDayRuns.find(
      (entry) => `day-run-${entry.id}` === selectedItemKey,
    );

    if (run) {
      return {
        top: formatTime(run.startedAt),
        primary: formatDistance(run.distanceKm),
        secondary: formatDuration(run.durationSeconds),
        action: 'ÖFFNEN',
      };
    }

    return {
      top: 'VERLAUF',
      primary: 'Keine Auswahl',
      secondary: '',
      action: '',
    };
  }, [
    daysForSelectedWeek,
    level,
    monthGroups.length,
    monthPage,
    monthPageGroups,
    recentRuns,
    selectedDayRuns,
    selectedItemKey,
    selectedWeekRuns.length,
    sortedRuns.length,
    totalMonthPages,
    weeksForSelectedMonth,
  ]);

  const headerModel = useMemo(() => {
    if (level === 'recent') {
      return {
        title: 'Verlauf',
        subtitle: 'Die letzten 7 Läufe oder ältere Läufe nach Monat.',
      };
    }

    if (level === 'months') {
      return {
        title: 'Monate',
        subtitle: `Seite ${monthPage + 1} von ${totalMonthPages}`,
      };
    }

    if (level === 'weeks') {
      return {
        title: selectedMonth?.label ?? 'Kalenderwochen',
        subtitle: 'Kalenderwoche auswählen.',
      };
    }

    if (level === 'days') {
      return {
        title: selectedWeek ? `KW ${selectedWeek.weekNumber}` : 'Tage',
        subtitle: selectedWeek ? formatWeekRange(selectedWeek) : '',
      };
    }

    return {
      title: selectedDay?.label ?? 'Läufe',
      subtitle: 'Laufzeit auswählen.',
    };
  }, [
    level,
    monthPage,
    selectedDay,
    selectedMonth,
    selectedWeek,
    totalMonthPages,
  ]);

  if (sortedRuns.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>LaufBuddy</Text>
          <Text style={styles.title}>Verlauf</Text>
        </View>

        <View style={styles.emptyCard}>
          <MapIcon size={36} color="#34A6D8" />
          <Text style={styles.emptyTitle}>Noch keine Läufe gespeichert</Text>
          <Text style={styles.emptyText}>
            Nach deinem ersten beendeten Lauf erscheint er hier.
          </Text>
        </View>

        <Text style={styles.screenBackHint}>
          Von links oder rechts wischen: zurück
        </Text>
      </View>
    );
  }

  const wheelIdentity = [
    level,
    monthPage,
    selectedMonthKey,
    selectedWeekKey,
    selectedDayKey,
  ].join('-');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>LaufBuddy</Text>
        <Text style={styles.title}>{headerModel.title}</Text>
        <Text style={styles.subtitle}>{headerModel.subtitle}</Text>

        {level !== 'recent' ? (
          <Pressable style={styles.levelBackButton} onPress={goBackOneLevel}>
            <ChevronLeft size={17} color="#2477A8" />
            <Text style={styles.levelBackText}>Eine Ebene zurück</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.wheelWrapper}>
        <SafetyWheel
          key={wheelIdentity}
          items={wheelItems}
          statusLabel={
            level === 'recent'
              ? 'LETZTE 7 LÄUFE'
              : level === 'months'
                ? 'MONAT AUSWÄHLEN'
                : level === 'weeks'
                  ? 'KALENDERWOCHE'
                  : level === 'days'
                    ? 'TAG AUSWÄHLEN'
                    : 'LAUF AUSWÄHLEN'
          }
          statusSubline={centerModel.top}
          statusColor="#34A6D8"
          secondaryStatusLine={centerModel.secondary}
          bottomHint="Wischen zum Drehen"
          wheelSize={HISTORY_WHEEL_SIZE}
          centerStatusContent={
            <View style={styles.centerContent}>
              <Text style={styles.centerTop}>{centerModel.top}</Text>
              <Text style={styles.centerPrimary}>{centerModel.primary}</Text>
              <Text style={styles.centerSecondary}>
                {centerModel.secondary}
              </Text>
              <Text style={styles.centerAction}>{centerModel.action}</Text>
            </View>
          }
          centerConfirmContent={
            <View style={styles.centerContent}>
              <Text style={styles.centerTop}>{centerModel.top}</Text>
              <Text style={styles.centerPrimary}>{centerModel.primary}</Text>
              <Text style={styles.centerSecondary}>
                {centerModel.secondary}
              </Text>
              <Text style={styles.centerAction}>{centerModel.action}</Text>
            </View>
          }
          centerPressMode="direct"
          onSelectedItemChange={setSelectedItemKey}
        />
      </View>

      <Text style={styles.selectionHint}>
        {level === 'recent'
          ? 'Sieben letzte Läufe plus Monatsarchiv'
          : level === 'months'
            ? 'Monat öffnen, um Kalenderwochen zu sehen'
            : level === 'weeks'
              ? 'Kalenderwoche öffnen, um Lauftage zu sehen'
              : level === 'days'
                ? 'Tag öffnen, um den Lauf zu sehen'
                : formatFullDate(selectedDayRuns[0]?.startedAt ?? Date.now())}
      </Text>

      <Text style={styles.screenBackHint}>
        Von links oder rechts wischen: zurück
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3FAFD',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  header: {
    position: 'absolute',
    top: 70,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  eyebrow: {
    color: '#2477A8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 4,
    textAlign: 'center',
  },
  title: {
    color: '#153243',
    fontSize: 34,
    fontWeight: '900',
  },
  subtitle: {
    color: '#5B6B7A',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
  },
  levelBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  levelBackText: {
    color: '#2477A8',
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 3,
  },
  wheelWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  centerTop: {
    color: '#2477A8',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  centerPrimary: {
    color: '#153243',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 3,
  },
  centerSecondary: {
    color: '#5B6B7A',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 3,
  },
  centerAction: {
    color: '#34A6D8',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
    textAlign: 'center',
    marginTop: 4,
  },
  selectionHint: {
    position: 'absolute',
    bottom: 42,
    left: 20,
    right: 20,
    color: '#5B6B7A',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyCard: {
    width: '100%',
    maxWidth: 410,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(52, 166, 216, 0.24)',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 36,
    marginTop: 50,
  },
  emptyTitle: {
    color: '#153243',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 14,
  },
  emptyText: {
    color: '#5B6B7A',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  screenBackHint: {
    position: 'absolute',
    bottom: 14,
    left: 20,
    right: 20,
    color: '#5B6B7A',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
