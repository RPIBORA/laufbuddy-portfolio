// src/app_core/screens/ShoeScreen.tsx
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  BarChart3,
  CheckCircle2,
  Footprints,
  History,
  PlusCircle,
} from 'lucide-react-native';
import {
  SafetyWheel,
  STANDARD_WHEEL_SIZE,
  type SafetyWheelItem,
} from '../components/SafetyWheel';
import { useShoeStatus } from '../state/useShoeStatus';
import { useBodyProfile } from '../state/useBodyProfile';
import { useRunHistory } from '../state/useRunHistory';
import {
  calculateAllShoeStats,
  type ShoeStats,
} from '../../core/runs/shoeStats';

type ShoeScreenProps = {
  onBack: () => void;
};

type ShoePanelKey =
  | 'active'
  | 'shoes'
  | 'add'
  | 'compare'
  | 'runs';

function isShoePanelKey(value: string): value is ShoePanelKey {
  return (
    value === 'active' ||
    value === 'shoes' ||
    value === 'add' ||
    value === 'compare' ||
    value === 'runs'
  );
}

function formatSecondsAsPace(
  secondsPerKm: number | null,
): string {
  if (secondsPerKm === null || secondsPerKm <= 0) {
    return '--:-- min/km';
  }

  const roundedSeconds = Math.round(secondsPerKm);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(
    seconds,
  ).padStart(2, '0')} min/km`;
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return '-';
  }

  return `${Math.round(value * 100)} %`;
}

function formatRunsCount(totalRuns: number): string {
  return totalRuns === 1 ? '1 Lauf' : `${totalRuns} Läufe`;
}

function findHighestShoeStat(
  shoeStatsList: ShoeStats[],
  getValue: (shoeStats: ShoeStats) => number | null,
): ShoeStats | null {
  let bestShoeStats: ShoeStats | null = null;
  let bestValue: number | null = null;

  shoeStatsList.forEach((shoeStats) => {
    const value = getValue(shoeStats);

    if (value === null) {
      return;
    }

    if (bestValue === null || value > bestValue) {
      bestValue = value;
      bestShoeStats = shoeStats;
    }
  });

  return bestShoeStats;
}

function findLowestShoeStat(
  shoeStatsList: ShoeStats[],
  getValue: (shoeStats: ShoeStats) => number | null,
): ShoeStats | null {
  let bestShoeStats: ShoeStats | null = null;
  let bestValue: number | null = null;

  shoeStatsList.forEach((shoeStats) => {
    const value = getValue(shoeStats);

    if (value === null) {
      return;
    }

    if (bestValue === null || value < bestValue) {
      bestValue = value;
      bestShoeStats = shoeStats;
    }
  });

  return bestShoeStats;
}

export default function ShoeScreen({
  onBack: _onBack,
}: ShoeScreenProps) {
  const shoes = useShoeStatus((state) => state.shoes);
  const addShoe = useShoeStatus((state) => state.addShoe);
  const setActiveShoe = useShoeStatus(
    (state) => state.setActiveShoe,
  );

  const runs = useRunHistory((state) => state.runs);
  const correctRunShoe = useRunHistory(
    (state) => state.correctRunShoe,
  );
  const updateRunFeedback = useRunHistory(
    (state) => state.updateRunFeedback,
  );

  const [activePanel, setActivePanel] =
    useState<ShoePanelKey>('active');
  const [newShoeName, setNewShoeName] = useState('');
  const [newMaxKm, setNewMaxKm] = useState('600');
  const profileShoeSizeEu = useBodyProfile((state) => state.shoeSizeEu);
  const [newShoeSize, setNewShoeSize] = useState(profileShoeSizeEu === null ? '' : String(profileShoeSizeEu).replace('.', ','));
  const [saveMessage, setSaveMessage] = useState('');

  const activeShoe =
    shoes.find((shoe) => shoe.status === 'active') ?? null;

  const allShoeStats = useMemo(
    () => calculateAllShoeStats(runs),
    [runs],
  );

  const shoeStatsById = useMemo(
    () =>
      new Map(
        allShoeStats.map((shoeStats) => [
          shoeStats.shoeId,
          shoeStats,
        ]),
      ),
    [allShoeStats],
  );

  const bestGradeShoeStats = useMemo(
    () =>
      findLowestShoeStat(
        allShoeStats,
        (shoeStats) => shoeStats.averageComfortRating,
      ),
    [allShoeStats],
  );

  const fastestShoeStats = useMemo(
    () =>
      findHighestShoeStat(
        allShoeStats,
        (shoeStats) => shoeStats.averageSpeedKph,
      ),
    [allShoeStats],
  );

  const lowestPressureShoeStats = useMemo(
    () =>
      findLowestShoeStat(
        allShoeStats,
        (shoeStats) => shoeStats.painRunRatio,
      ),
    [allShoeStats],
  );

  const activeShoeStats =
    activeShoe === null
      ? null
      : shoeStatsById.get(activeShoe.id) ?? null;

  const wheelItems = useMemo<SafetyWheelItem[]>(
    () => [
      {
        key: 'active',
        label: 'Aktiv',
        icon: CheckCircle2,
        action: () => setActivePanel('active'),
      },
      {
        key: 'shoes',
        label: 'Schuhe',
        icon: Footprints,
        action: () => setActivePanel('shoes'),
      },
      {
        key: 'add',
        label: 'Hinzufügen',
        icon: PlusCircle,
        action: () => setActivePanel('add'),
      },
      {
        key: 'compare',
        label: 'Vergleich',
        icon: BarChart3,
        action: () => setActivePanel('compare'),
      },
      {
        key: 'runs',
        label: 'Läufe',
        icon: History,
        action: () => setActivePanel('runs'),
      },
    ],
    [],
  );

  function handleSelectedWheelItemChange(itemKey: string) {
    if (isShoePanelKey(itemKey)) {
      setActivePanel(itemKey);
    }
  }

  function handleAddShoe() {
    const trimmedName = newShoeName.trim();

    if (!trimmedName) {
      setSaveMessage('Bitte einen Schuhnamen eingeben.');
      return;
    }

    const parsedMaxKm = Number(newMaxKm.replace(',', '.'));
    const maxKm =
      Number.isFinite(parsedMaxKm) && parsedMaxKm > 0
        ? parsedMaxKm
        : 600;

    addShoe({
      name: trimmedName,
      maxKm,
      shoeSize: newShoeSize.trim() || null,
    });

    setNewShoeName('');
    setNewMaxKm('600');
    setNewShoeSize(profileShoeSizeEu === null ? '' : String(profileShoeSizeEu).replace('.', ','));
    setSaveMessage(`${trimmedName} wurde hinzugefügt.`);
  }

  function renderWheelCenterContent() {
    if (activePanel === 'active') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>AKTIVER SCHUH</Text>
          <Text
            style={styles.centerValue}
            numberOfLines={2}
            adjustsFontSizeToFit
          >
            {activeShoe?.name ?? 'Kein Schuh'}
          </Text>
          <Text style={styles.centerText}>
            {activeShoe === null
              ? 'Noch kein Schuh ausgewählt'
              : `${activeShoe.currentKm.toFixed(2)} von ${
                  activeShoe.maxKm
                } km`}
          </Text>
        </View>
      );
    }

    if (activePanel === 'shoes') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>MEINE SCHUHE</Text>
          <Text style={styles.centerValue}>{shoes.length}</Text>
          <Text style={styles.centerText}>
            {shoes.length === 1 ? 'Schuh gespeichert' : 'Schuhe gespeichert'}
          </Text>
        </View>
      );
    }

    if (activePanel === 'add') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>NEUER SCHUH</Text>
          <Text style={styles.centerValue}>+</Text>
          <Text style={styles.centerText}>
            Schuh und Laufleistung eintragen
          </Text>
        </View>
      );
    }

    if (activePanel === 'compare') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>VERGLEICH</Text>
          <Text style={styles.centerValue}>
            {allShoeStats.length}
          </Text>
          <Text style={styles.centerText}>
            {formatRunsCount(runs.length)} ausgewertet
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.centerPanel}>
        <Text style={styles.centerEyebrow}>LAUFKORREKTUR</Text>
        <Text style={styles.centerValue}>{runs.length}</Text>
        <Text style={styles.centerText}>
          gespeicherte Läufe
        </Text>
      </View>
    );
  }

  function renderActivePanel() {
    if (activeShoe === null) {
      return (
        <View style={styles.panelCard}>
          <Text style={styles.panelTitle}>Kein aktiver Schuh</Text>
          <Text style={styles.panelText}>
            Öffne „Meine Schuhe“ und wähle einen Schuh aus.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.panelCard}>
        <Text style={styles.panelEyebrow}>AKTIVER SCHUH</Text>
        <Text style={styles.panelTitle}>{activeShoe.name}</Text>

        <View style={styles.metricGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Laufleistung</Text>
            <Text style={styles.metricValue}>
              {activeShoe.currentKm.toFixed(2)} km
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Läufe</Text>
            <Text style={styles.metricValue}>
              {activeShoeStats?.totalRuns ?? 0}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Ø Pace</Text>
            <Text style={styles.metricValueSmall}>
              {formatSecondsAsPace(
                activeShoeStats?.averagePaceSecondsPerKm ?? null,
              )}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Schuhnote</Text>
            <Text style={styles.metricValue}>
              {activeShoeStats?.averageComfortRating == null
                ? '-'
                : activeShoeStats.averageComfortRating.toFixed(1)}
            </Text>
          </View>
        </View>

        <Text style={styles.panelHint}>
          Geplante Laufleistung: {activeShoe.maxKm} km
        </Text>
      </View>
    );
  }

  function renderShoesPanel() {
    return (
      <View style={styles.panelGroup}>
        <Text style={styles.sectionTitle}>Meine Schuhe</Text>

        {shoes.map((shoe) => {
          const shoeStats =
            shoeStatsById.get(shoe.id) ?? null;
          const isActive = shoe.status === 'active';

          return (
            <View
              key={shoe.id}
              style={[
                styles.panelCard,
                isActive ? styles.activePanelCard : null,
              ]}
            >
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardHeaderText}>
                  <Text style={styles.panelTitle}>{shoe.name}</Text>
                  <Text style={styles.panelText}>
                    {shoe.currentKm.toFixed(2)} von {shoe.maxKm} km
                  </Text>
                </View>

                <Text style={styles.statusBadge}>
                  {isActive ? 'Aktiv' : 'Geparkt'}
                </Text>
              </View>

              <View style={styles.compactStats}>
                <Text style={styles.compactStat}>
                  Läufe: {shoeStats?.totalRuns ?? 0}
                </Text>
                <Text style={styles.compactStat}>
                  Distanz:{' '}
                  {shoeStats?.totalDistanceKm.toFixed(2) ?? '0.00'} km
                </Text>
                <Text style={styles.compactStat}>
                  Ø Pace:{' '}
                  {formatSecondsAsPace(
                    shoeStats?.averagePaceSecondsPerKm ?? null,
                  )}
                </Text>
              </View>

              <Pressable
                disabled={isActive}
                onPress={() => setActiveShoe(shoe.id)}
                style={[
                  styles.primaryButton,
                  isActive ? styles.disabledButton : null,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isActive ? 'Aktiver Schuh' : 'Als aktiv setzen'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    );
  }

  function renderAddPanel() {
    return (
      <View style={styles.panelCard}>
        <Text style={styles.panelEyebrow}>NEUER SCHUH</Text>
        <Text style={styles.panelTitle}>Schuh hinzufügen</Text>

        <TextInput
          value={newShoeName}
          onChangeText={(value) => {
            setNewShoeName(value);
            setSaveMessage('');
          }}
          placeholder="z. B. Salomon Trail"
          placeholderTextColor="#7A8B98"
          style={styles.input}
        />

        <TextInput
          value={newMaxKm}
          onChangeText={(value) => {
            setNewMaxKm(value);
            setSaveMessage('');
          }}
          keyboardType="numeric"
          placeholder="Maximale Laufleistung, z. B. 600"
          placeholderTextColor="#7A8B98"
          style={styles.input}
        />

        <TextInput
          value={newShoeSize}
          onChangeText={(value) => { setNewShoeSize(value); setSaveMessage(''); }}
          keyboardType="decimal-pad"
          placeholder="Schuhgröße (EU)"
          placeholderTextColor="#7A8B98"
          style={styles.input}
        />

        <Pressable
          onPress={handleAddShoe}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            Schuh hinzufügen
          </Text>
        </Pressable>

        {saveMessage ? (
          <Text style={styles.saveMessage}>{saveMessage}</Text>
        ) : null}
      </View>
    );
  }

  function renderComparePanel() {
    if (allShoeStats.length === 0) {
      return (
        <View style={styles.panelCard}>
          <Text style={styles.panelTitle}>
            Noch keine Vergleichsdaten
          </Text>
          <Text style={styles.panelText}>
            Nach dem ersten gespeicherten Lauf erscheinen hier die
            Schuhwerte.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.panelGroup}>
        <Text style={styles.sectionTitle}>Schuhvergleich</Text>

        <View style={styles.panelCard}>
          <Text style={styles.compareLabel}>Beste Schuhnote</Text>
          <Text style={styles.compareValue}>
            {bestGradeShoeStats?.averageComfortRating == null
              ? '-'
              : `${bestGradeShoeStats.shoeName} · ${bestGradeShoeStats.averageComfortRating.toFixed(
                  1,
                )}`}
          </Text>
        </View>

        <View style={styles.panelCard}>
          <Text style={styles.compareLabel}>Schnellster Schuh</Text>
          <Text style={styles.compareValue}>
            {fastestShoeStats?.averageSpeedKph == null
              ? '-'
              : `${fastestShoeStats.shoeName} · ${fastestShoeStats.averageSpeedKph.toFixed(
                  1,
                )} km/h`}
          </Text>
        </View>

        <View style={styles.panelCard}>
          <Text style={styles.compareLabel}>
            Wenig Druck, Reibung oder Ziehen
          </Text>
          <Text style={styles.compareValue}>
            {lowestPressureShoeStats?.painRunRatio == null
              ? '-'
              : `${lowestPressureShoeStats.shoeName} · ${formatPercent(
                  lowestPressureShoeStats.painRunRatio,
                )}`}
          </Text>
        </View>
      </View>
    );
  }

  function renderRunsPanel() {
    if (runs.length === 0) {
      return (
        <View style={styles.panelCard}>
          <Text style={styles.panelTitle}>
            Noch keine Läufe gespeichert
          </Text>
          <Text style={styles.panelText}>
            Nach dem ersten Lauf kannst du hier den Schuh und die
            Bewertung korrigieren.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.panelGroup}>
        <Text style={styles.sectionTitle}>
          Läufe korrigieren
        </Text>

        {runs.map((run) => {
          const runDate = new Date(
            run.startedAt,
          ).toLocaleDateString('de-DE');

          const currentShoe =
            shoes.find(
              (shoe) => shoe.id === run.shoe.shoeId,
            )?.name ?? run.shoe.shoeName;

          return (
            <View key={run.id} style={styles.panelCard}>
              <Text style={styles.panelTitle}>
                {run.distanceKm.toFixed(2)} km · {runDate}
              </Text>

              <Text style={styles.panelText}>
                Aktueller Schuh: {currentShoe}
              </Text>

              <Text style={styles.optionLabel}>
                Schuh für diesen Lauf
              </Text>

              <View style={styles.optionRow}>
                {shoes.map((shoe) => {
                  const isSelected =
                    run.shoe.shoeId === shoe.id;

                  return (
                    <Pressable
                      key={shoe.id}
                      onPress={() =>
                        correctRunShoe(run.id, shoe.id)
                      }
                      style={[
                        styles.optionButton,
                        isSelected
                          ? styles.optionButtonSelected
                          : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          isSelected
                            ? styles.optionButtonTextSelected
                            : null,
                        ]}
                      >
                        {shoe.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.optionLabel}>
                Schuhgefühl 1 bis 5
              </Text>

              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map((rating) => {
                  const isSelected =
                    run.feedback.shoeComfortRating === rating;

                  return (
                    <Pressable
                      key={rating}
                      onPress={() =>
                        updateRunFeedback(run.id, {
                          shoeComfortRating: rating,
                          painAfterRun:
                            rating <= 2
                              ? false
                              : run.feedback.painAfterRun,
                        })
                      }
                      style={[
                        styles.ratingButton,
                        isSelected
                          ? styles.optionButtonSelected
                          : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          isSelected
                            ? styles.optionButtonTextSelected
                            : null,
                        ]}
                      >
                        {rating}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {run.feedback.shoeComfortRating !== null &&
              run.feedback.shoeComfortRating >= 3 ? (
                <>
                  <Text style={styles.optionLabel}>
                    Druck, Reibung oder Ziehen?
                  </Text>

                  <View style={styles.optionRow}>
                    {[false, true].map((hasPain) => {
                      const isSelected =
                        run.feedback.painAfterRun === hasPain;

                      return (
                        <Pressable
                          key={String(hasPain)}
                          onPress={() =>
                            updateRunFeedback(run.id, {
                              painAfterRun: hasPain,
                            })
                          }
                          style={[
                            styles.optionButton,
                            isSelected
                              ? styles.optionButtonSelected
                              : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionButtonText,
                              isSelected
                                ? styles.optionButtonTextSelected
                                : null,
                            ]}
                          >
                            {hasPain ? 'Ja' : 'Nein'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  }

  function renderActiveContent() {
    if (activePanel === 'active') {
      return renderActivePanel();
    }

    if (activePanel === 'shoes') {
      return renderShoesPanel();
    }

    if (activePanel === 'add') {
      return renderAddPanel();
    }

    if (activePanel === 'compare') {
      return renderComparePanel();
    }

    return renderRunsPanel();
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>LaufBuddy</Text>
        <Text style={styles.title}>Schuhe</Text>
        <Text style={styles.subtitle}>
          Deine Schuhe und ihr echtes Gefühl aus deinen Läufen.
        </Text>
      </View>

      <View style={styles.wheelStage}>
        <SafetyWheel
          items={wheelItems}
          statusLabel="Schuhe"
          statusSubline={
            activeShoe?.name ?? 'Noch kein aktiver Schuh'
          }
          statusColor="#34A6D8"
          secondaryStatusLine={`${shoes.length} Schuhe · ${runs.length} Läufe`}
          bottomHint="Wischen zum Drehen"
          wheelSize={STANDARD_WHEEL_SIZE}
          centerStatusContent={renderWheelCenterContent()}
          centerConfirmContent={renderWheelCenterContent()}
          centerPressEnabled={false}
          onSelectedItemChange={
            handleSelectedWheelItemChange
          }
        />
      </View>

      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {renderActiveContent()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3FAFD',
  },
  wheelStage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  header: {
    position: 'absolute',
    top: 70,
    left: 18,
    right: 18,
    alignItems: 'center',
    zIndex: 2,
  },
  headerContent: {
    paddingHorizontal: 18,
    paddingTop: 38,
  },
  panelScroll: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    maxHeight: 180,
    zIndex: 3,
  },
  panelScrollContent: {
    paddingBottom: 4,
  },
  eyebrow: {
    color: '#2477A8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  title: {
    color: '#153243',
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    color: '#5B6B7A',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  wheelWrapper: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 18,
  },
  centerPanel: {
    width: '100%',
    alignItems: 'center',
  },
  centerEyebrow: {
    color: '#2477A8',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
    textAlign: 'center',
  },
  centerValue: {
    color: '#12384D',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
  },
  centerText: {
    color: '#5B6B7A',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 4,
  },
  panelGroup: {
    gap: 12,
  },
  panelCard: {
    width: '100%',
    borderRadius: 26,
    padding: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(36, 119, 168, 0.16)',
    marginBottom: 12,
  },
  activePanelCard: {
    borderWidth: 2,
    borderColor: '#34A6D8',
  },
  panelEyebrow: {
    color: '#2477A8',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 6,
  },
  panelTitle: {
    color: '#12384D',
    fontSize: 19,
    fontWeight: '900',
  },
  panelText: {
    color: '#5B6B7A',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 5,
  },
  panelHint: {
    color: '#2477A8',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 12,
  },
  sectionTitle: {
    color: '#12384D',
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 2,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  metricCard: {
    width: '48%',
    minHeight: 82,
    borderRadius: 20,
    padding: 13,
    backgroundColor: '#EFF6FA',
    justifyContent: 'center',
  },
  metricLabel: {
    color: '#5B6B7A',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  metricValue: {
    color: '#12384D',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 5,
  },
  metricValueSmall: {
    color: '#12384D',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardHeaderText: {
    flex: 1,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#E8F4FA',
    color: '#2477A8',
    fontSize: 11,
    fontWeight: '900',
  },
  compactStats: {
    gap: 5,
    marginTop: 14,
    padding: 13,
    borderRadius: 18,
    backgroundColor: '#EFF6FA',
  },
  compactStat: {
    color: '#4B6170',
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    width: '100%',
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(36, 119, 168, 0.22)',
    backgroundColor: '#F8FBFD',
    color: '#12384D',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 15,
    marginTop: 12,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34A6D8',
    paddingHorizontal: 18,
    marginTop: 14,
  },
  disabledButton: {
    backgroundColor: '#AFC7D4',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  saveMessage: {
    color: '#2477A8',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 12,
  },
  compareLabel: {
    color: '#5B6B7A',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  compareValue: {
    color: '#12384D',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 7,
  },
  optionLabel: {
    color: '#12384D',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 16,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(36, 119, 168, 0.24)',
    backgroundColor: '#EFF6FA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  optionButtonSelected: {
    borderColor: '#34A6D8',
    backgroundColor: '#34A6D8',
  },
  optionButtonText: {
    color: '#2477A8',
    fontSize: 12,
    fontWeight: '900',
  },
  optionButtonTextSelected: {
    color: '#FFFFFF',
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(36, 119, 168, 0.24)',
    backgroundColor: '#EFF6FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
