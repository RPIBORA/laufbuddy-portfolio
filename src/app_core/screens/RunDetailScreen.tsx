// src/app_core/screens/RunDetailScreen.tsx
import React from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type Region,
} from 'react-native-maps';
import {
  Clock,
  CloudSun,
  Footprints,
  Gauge,
  List,
  Map as MapIcon,
  Mountain,
  PauseCircle,
} from 'lucide-react-native';
import {
  STANDARD_WHEEL_SIZE,
  SafetyWheel,
  SafetyWheelItem,
} from '../components/SafetyWheel';
import { useRunHistory } from '../state/useRunHistory';
import { useShoeStatus } from '../state/useShoeStatus';
import type { RunPauseEntry, RunRoutePointSnapshot } from '../models/ShoeModels';

type RunDetailScreenProps = {
  runId: string;
  onBack: () => void;
};

type RunDetailWheelKey =
  | 'time'
  | 'performance'
  | 'pauses'
  | 'shoe'
  | 'route'
  | 'altitude'
  | 'splits'
  | 'context';

type MapCanvasSize = {
  width: number;
  height: number;
};

type MapCanvasPoint = {
  x: number;
  y: number;
};

type PauseMapPoint = MapCanvasPoint & {
  id: string;
  pauseIndex: number;
};

const DETAIL_WHEEL_SIZE = STANDARD_WHEEL_SIZE;
const MAP_PADDING = 34;
const ROUTE_POINT_SIZE = 5;
const ROUTE_START_END_SIZE = 15;
const ROUTE_PAUSE_SIZE = 22;
const ROUTE_LINE_THICKNESS = 4;

type RouteMapCoordinate = {
  latitude: number;
  longitude: number;
};

type PauseMarkerCoordinate = RouteMapCoordinate & {
  id: string;
  pauseIndex: number;
  durationMs: number;
};

function toRouteMapCoordinate(point: RunRoutePointSnapshot): RouteMapCoordinate {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
  };
}

function createRouteInitialRegion(
  routePoints: RunRoutePointSnapshot[],
): Region | null {
  if (routePoints.length === 0) {
    return null;
  }

  const latitudes = routePoints.map((point) => point.latitude);
  const longitudes = routePoints.map((point) => point.longitude);

  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  const latitudeDelta = Math.max((maxLatitude - minLatitude) * 1.8, 0.006);
  const longitudeDelta = Math.max((maxLongitude - minLongitude) * 1.8, 0.006);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta,
    longitudeDelta,
  };
}

function createPauseMarkerCoordinates(
  pauses: RunPauseEntry[],
): PauseMarkerCoordinate[] {
  const markers: PauseMarkerCoordinate[] = [];

  pauses.forEach((pause, index) => {
    if (pause.location === null) {
      return;
    }

    markers.push({
      id: pause.id,
      pauseIndex: index + 1,
      durationMs: pause.durationMs ?? 0,
      latitude: pause.location.latitude,
      longitude: pause.location.longitude,
    });
  });

  return markers;
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0',
  )}`;
}

function formatMilliseconds(totalMs: number): string {
  if (totalMs <= 0) {
    return '00:00';
  }

  return formatSeconds(Math.floor(totalMs / 1000));
}

function formatPace(secondsPerKm: number | null): string {
  if (secondsPerKm === null || secondsPerKm <= 0) {
    return '--:-- min/km';
  }

  const roundedSeconds = Math.round(secondsPerKm);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0',
  )} min/km`;
}

function formatDate(timestamp: number | null): string {
  if (timestamp === null) {
    return '-';
  }

  return new Date(timestamp).toLocaleString('de-DE');
}

function formatTime(timestamp: number | null): string {
  if (timestamp === null) {
    return '-';
  }

  return new Date(timestamp).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNullableNumber(
  value: number | null,
  suffix: string,
  decimals = 1,
): string {
  if (value === null) {
    return '-';
  }

  return `${value.toFixed(decimals)} ${suffix}`;
}

function formatBool(value: boolean | null): string {
  if (value === null) {
    return '-';
  }

  return value ? 'Ja' : 'Nein';
}

function formatRunModeForUser(runMode?: string | null): string {
  if (runMode === 'Gemeinsamer Lauf' || runMode === 'Gemeinsamer Lauf vorbereitet') {
    return 'Mit Buddy';
  }

  if (runMode === 'Solo-Lauf') {
    return 'Alleine';
  }

  return 'Nicht erkannt';
}

function createMapPointFromGeo(
  latitude: number,
  longitude: number,
  routePoints: RunRoutePointSnapshot[],
  mapSize: MapCanvasSize,
): MapCanvasPoint {
  const latitudes = routePoints.map((point) => point.latitude);
  const longitudes = routePoints.map((point) => point.longitude);

  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  const latitudeRange = maxLatitude - minLatitude || 0.000001;
  const longitudeRange = maxLongitude - minLongitude || 0.000001;

  const drawableWidth = Math.max(1, mapSize.width - MAP_PADDING * 2);
  const drawableHeight = Math.max(1, mapSize.height - MAP_PADDING * 2);

  const normalizedX = (longitude - minLongitude) / longitudeRange;
  const normalizedY = (latitude - minLatitude) / latitudeRange;

  return {
    x: MAP_PADDING + normalizedX * drawableWidth,
    y: MAP_PADDING + (1 - normalizedY) * drawableHeight,
  };
}

function createMapPoints(
  routePoints: RunRoutePointSnapshot[],
  mapSize: MapCanvasSize,
): MapCanvasPoint[] {
  return routePoints.map((point) =>
    createMapPointFromGeo(point.latitude, point.longitude, routePoints, mapSize),
  );
}

function createPauseMapPoints(
  pauses: RunPauseEntry[],
  routePoints: RunRoutePointSnapshot[],
  mapSize: MapCanvasSize,
): PauseMapPoint[] {
  return pauses
    .filter((pause) => pause.location !== null)
    .map((pause, index) => ({
      ...createMapPointFromGeo(
        pause.location!.latitude,
        pause.location!.longitude,
        routePoints,
        mapSize,
      ),
      id: pause.id,
      pauseIndex: index + 1,
    }));
}

function calculateSegmentStyle(from: MapCanvasPoint, to: MapCanvasPoint) {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const angle = Math.atan2(deltaY, deltaX);

  return {
    left: from.x,
    top: from.y - ROUTE_LINE_THICKNESS / 2,
    width: length,
    transform: [{ rotate: `${angle}rad` }],
  };
}

function formatShoeFeeling(value?: string | null): string {
  if (value === 'good') {
    return 'gut';
  }

  if (value === 'okay') {
    return 'okay';
  }

  if (value === 'bad') {
    return 'schlecht';
  }

  return '-';
}

export default function RunDetailScreen({
  runId,
}: RunDetailScreenProps) {
  const run = useRunHistory((state) =>
    state.runs.find((entry) => entry.id === runId),
  );
  const shoes = useShoeStatus((state) => state.shoes);
  const correctRunShoe = useRunHistory((state) => state.correctRunShoe);
  const [isWheelVisible, setWheelVisible] = React.useState(true);
  const [isDetailOverlayVisible, setDetailOverlayVisible] = React.useState(false);
  const [isShoePickerVisible, setShoePickerVisible] = React.useState(false);
  const [activeDetailKey, setActiveDetailKey] =
    React.useState<RunDetailWheelKey>('time');
  const [mapSize, setMapSize] = React.useState<MapCanvasSize>({
    width: 0,
    height: 0,
  });

  const detailSectionOrder = React.useMemo(() => {
    const allSections: RunDetailWheelKey[] = [
      'time',
      'performance',
      'pauses',
      'shoe',
      'route',
      'altitude',
      'splits',
      'context',
    ];

    return [
      activeDetailKey,
      ...allSections.filter((sectionKey) => sectionKey !== activeDetailKey),
    ];
  }, [activeDetailKey]);

  const detailWheelItems: SafetyWheelItem[] = React.useMemo(
    () => [
      {
        key: 'time',
        label: 'Zeit',
        icon: Clock,
        action: () => setDetailOverlayVisible(true),
      },
      {
        key: 'performance',
        label: 'Leistung',
        icon: Gauge,
        action: () => setDetailOverlayVisible(true),
      },
      {
        key: 'pauses',
        label: 'Pausen',
        icon: PauseCircle,
        action: () => setDetailOverlayVisible(true),
      },
      {
        key: 'shoe',
        label: 'Schuh',
        icon: Footprints,
        action: () => setDetailOverlayVisible(true),
      },
      {
        key: 'route',
        label: 'Strecke',
        icon: MapIcon,
        action: () => setDetailOverlayVisible(true),
      },
      {
        key: 'altitude',
        label: 'Höhe',
        icon: Mountain,
        action: () => setDetailOverlayVisible(true),
      },
      {
        key: 'splits',
        label: 'Abschnitte',
        icon: List,
        action: () => setDetailOverlayVisible(true),
      },
      {
        key: 'context',
        label: 'Kontext',
        icon: CloudSun,
        action: () => setDetailOverlayVisible(true),
      },
    ],
    [],
  );

  if (!run) {
    return (
      <View style={styles.container}>
        <Text style={styles.notFoundText}>Lauf nicht gefunden</Text>
      </View>
    );
  }

  const pauses = run.pauses ?? [];
  const pauseCount = run.pauseSummary?.pauseCount ?? pauses.length;
  const totalPauseDurationMs =
    run.pauseSummary?.totalPauseDurationMs ??
    pauses.reduce((sum, pause) => sum + (pause.durationMs ?? 0), 0);
  const routePoints = run.route.routePoints ?? [];
  const routeCoordinates = routePoints.map(toRouteMapCoordinate);
  const mapInitialRegion = createRouteInitialRegion(routePoints);
  const pauseMarkerCoordinates = createPauseMarkerCoordinates(pauses);
  const firstRouteCoordinate = routeCoordinates[0] ?? null;
  const lastRouteCoordinate =
    routeCoordinates[routeCoordinates.length - 1] ?? null;
  const hasRoute = mapSize.width > 0 && mapSize.height > 0 && routePoints.length >= 2;
  const mapPoints = hasRoute ? createMapPoints(routePoints, mapSize) : [];
  const pauseMapPoints = hasRoute
    ? createPauseMapPoints(pauses, routePoints, mapSize)
    : [];
  const startPoint = mapPoints[0] ?? null;
  const endPoint = mapPoints[mapPoints.length - 1] ?? null;

  function handleMapLayout(event: LayoutChangeEvent) {
    setMapSize({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
  }

  function handleSelectedWheelItemChange(itemKey: string) {
    if (
      itemKey === 'time' ||
      itemKey === 'performance' ||
      itemKey === 'pauses' ||
      itemKey === 'shoe' ||
      itemKey === 'route' ||
      itemKey === 'altitude' ||
      itemKey === 'splits' ||
      itemKey === 'context'
    ) {
      setActiveDetailKey(itemKey);
    }
  }

  function renderCenterContent() {
    if (activeDetailKey === 'time') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>ZEIT</Text>
          <Text style={styles.centerValue}>{formatSeconds(run.durationSeconds)}</Text>
          <Text style={styles.centerText}>Start {formatTime(run.startedAt)}</Text>
          <Text style={styles.centerText}>Ende {formatTime(run.endedAt)}</Text>
        </View>
      );
    }

    if (activeDetailKey === 'performance') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>LEISTUNG</Text>
          <Text style={styles.centerValue}>{run.distanceKm.toFixed(2)} km</Text>
          <Text style={styles.centerText}>{formatPace(run.averagePaceSecondsPerKm)}</Text>
          <Text style={styles.centerText}>
            Ø {formatNullableNumber(run.performance.averageSpeedKph, 'km/h')}
          </Text>
        </View>
      );
    }

    if (activeDetailKey === 'pauses') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>PAUSEN</Text>
          <Text style={styles.centerValue}>{pauseCount}</Text>
          <Text style={styles.centerText}>
            {formatMilliseconds(totalPauseDurationMs)} gesamt
          </Text>
          <Text style={styles.centerText}>auf Route markiert</Text>
        </View>
      );
    }

    if (activeDetailKey === 'shoe') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>SCHUH</Text>
          <Text style={styles.centerValue} numberOfLines={2}>
            {run.shoe.shoeName}
          </Text>
          <Text style={styles.centerText}>
            {formatNullableNumber(run.shoe.shoeKmAtRunStart, 'km')}
          </Text>
          <Text style={styles.centerText}>
            Gefühl {formatShoeFeeling(run.feedback.shoeRunFeeling)}
          </Text>
        </View>
      );
    }

    if (activeDetailKey === 'route') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>STRECKE</Text>
          <Text style={styles.centerValue}>{routePoints.length}</Text>
          <Text style={styles.centerText}>GPS-Punkte</Text>
          <Text style={styles.centerText}>Start/Ziel sichtbar</Text>
        </View>
      );
    }

    if (activeDetailKey === 'altitude') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>HÖHE</Text>
          <Text style={styles.centerValue}>
            +{formatNullableNumber(run.route.elevationGainMeters, 'm', 0)}
          </Text>
          <Text style={styles.centerText}>
            -{formatNullableNumber(run.route.elevationLossMeters, 'm', 0)}
          </Text>
          <Text style={styles.centerText}>
            Max {formatNullableNumber(run.route.maxAltitudeMeters, 'm', 0)}
          </Text>
        </View>
      );
    }

    if (activeDetailKey === 'splits') {
      return (
        <View style={styles.centerPanel}>
          <Text style={styles.centerEyebrow}>ABSCHNITTE</Text>
          <Text style={styles.centerValue}>{run.splits.length}</Text>
          <Text style={styles.centerText}>Kilometer</Text>
          <Text style={styles.centerText}>antippen für Details</Text>
        </View>
      );
    }

    return (
      <View style={styles.centerPanel}>
        <Text style={styles.centerEyebrow}>KONTEXT</Text>
        <Text style={styles.centerValue}>
          {formatRunModeForUser(run.safety.runMode)}
        </Text>
        <Text style={styles.centerText}>
          {run.context.weather.weatherType ?? 'Wetter unbekannt'}
        </Text>
        <Text style={styles.centerText}>
          {formatNullableNumber(run.context.weather.temperatureCelsius, '°C')}
        </Text>
      </View>
    );
  }

  function handleCorrectRunShoe(newShoeId: string) {
    correctRunShoe(run.id, newShoeId);
    setShoePickerVisible(false);
  }

  function renderDetailSection(sectionKey: RunDetailWheelKey) {
    if (sectionKey === 'time') {
      return (
        <DetailSection title="Zeit">
          <DetailRow label="Start" value={formatDate(run.startedAt)} />
          <DetailRow label="Ende" value={formatDate(run.endedAt)} />
          <DetailRow label="Dauer" value={formatSeconds(run.durationSeconds)} />
        </DetailSection>
      );
    }

    if (sectionKey === 'performance') {
      return (
        <DetailSection title="Leistung">
          <DetailRow label="Distanz" value={`${run.distanceKm.toFixed(3)} km`} />
          <DetailRow label="Pace" value={formatPace(run.averagePaceSecondsPerKm)} />
          <DetailRow
            label="Ø Geschwindigkeit"
            value={formatNullableNumber(run.performance.averageSpeedKph, 'km/h')}
          />
          <DetailRow
            label="Max. Geschwindigkeit"
            value={formatNullableNumber(run.performance.maxSpeedKph, 'km/h')}
          />
        </DetailSection>
      );
    }

    if (sectionKey === 'pauses') {
      return (
        <DetailSection title="Pausen">
          <DetailRow label="Anzahl" value={String(pauseCount)} />
          <DetailRow label="Gesamt" value={formatMilliseconds(totalPauseDurationMs)} />

          {pauses.length === 0 ? (
            <Text style={styles.detailMutedText}>Keine Pausen gespeichert.</Text>
          ) : (
            pauses.map((pause, index) => (
              <View key={pause.id} style={styles.detailPill}>
                <Text style={styles.detailPillTitle}>
                  Pause {index + 1} · {pause.label}
                </Text>
                <Text style={styles.detailPillText}>
                  Dauer: {formatMilliseconds(pause.durationMs ?? 0)}
                </Text>
                <Text style={styles.detailPillText}>
                  Ort: {pause.location === null ? 'nicht gespeichert' : 'auf der Strecke markiert'}
                </Text>
              </View>
            ))
          )}
        </DetailSection>
      );
    }

    if (sectionKey === 'shoe') {
      return (
        <DetailSection title="Schuh">
          <Pressable
            style={styles.editableDetailRow}
            onPress={() => setShoePickerVisible((isVisible) => !isVisible)}
          >
            <Text style={styles.detailRowLabel}>Schuh</Text>
            <Text style={styles.detailRowValue}>{run.shoe.shoeName}</Text>
          </Pressable>

          {isShoePickerVisible ? (
            <View style={styles.shoePickerList}>
              {shoes.map((shoe) => {
                const isActiveRunShoe = shoe.id === run.shoe.shoeId;

                return (
                  <Pressable
                    key={shoe.id}
                    style={[
                      styles.shoePickerOption,
                      isActiveRunShoe && styles.shoePickerOptionActive,
                    ]}
                    onPress={() => handleCorrectRunShoe(shoe.id)}
                  >
                    <Text style={styles.shoePickerOptionText}>{shoe.name}</Text>
                    <Text style={styles.shoePickerMetaText}>
                      {formatNullableNumber(shoe.currentKm, 'km')} · {shoe.status}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <DetailRow
            label="Schuh-km beim Start"
            value={formatNullableNumber(run.shoe.shoeKmAtRunStart, 'km')}
          />
          <DetailRow
            label="Schuhgefühl"
            value={formatShoeFeeling(run.feedback.shoeRunFeeling)}
          />
          <DetailRow
            label="Schuhnote"
            value={
              run.feedback.shoeComfortRating === null
                ? '-'
                : String(run.feedback.shoeComfortRating)
            }
          />
          <DetailRow
            label="Druck/Reibung/Ziehen"
            value={formatBool(run.feedback.painAfterRun)}
          />
        </DetailSection>
      );
    }

    if (sectionKey === 'route') {
      return (
        <DetailSection title="Strecke">
          <DetailRow label="GPS-Punkte" value={String(routePoints.length)} />
          <DetailRow label="Distanz Route" value={`${run.distanceKm.toFixed(3)} km`} />
          <DetailRow label="Pausenpunkte" value={String(pauseMarkerCoordinates.length)} />
        </DetailSection>
      );
    }

    if (sectionKey === 'altitude') {
      return (
        <DetailSection title="Höhe">
          <DetailRow
            label="Min. Höhe"
            value={formatNullableNumber(run.route.minAltitudeMeters, 'm', 0)}
          />
          <DetailRow
            label="Max. Höhe"
            value={formatNullableNumber(run.route.maxAltitudeMeters, 'm', 0)}
          />
          <DetailRow
            label="Bergauf"
            value={formatNullableNumber(run.route.elevationGainMeters, 'm', 0)}
          />
          <DetailRow
            label="Bergab"
            value={formatNullableNumber(run.route.elevationLossMeters, 'm', 0)}
          />
        </DetailSection>
      );
    }

    if (sectionKey === 'splits') {
      return (
        <DetailSection title="Abschnitte">
          {run.splits.length === 0 ? (
            <Text style={styles.detailMutedText}>
              Noch keine Abschnitte gespeichert.
            </Text>
          ) : (
            run.splits.map((split) => (
              <View key={split.splitIndex} style={styles.detailPill}>
                <Text style={styles.detailPillTitle}>KM {split.splitIndex}</Text>
                <Text style={styles.detailPillText}>
                  Dauer: {formatSeconds(split.durationSeconds)}
                </Text>
                <Text style={styles.detailPillText}>
                  Pace: {formatPace(split.paceSecondsPerKm)}
                </Text>
              </View>
            ))
          )}
        </DetailSection>
      );
    }

    return (
      <DetailSection title="Körper & Kontext">
        <DetailRow label="Laufmodus" value={formatRunModeForUser(run.safety.runMode)} />
        <DetailRow
          label="Wetter"
          value={run.context.weather.weatherType ?? 'unbekannt'}
        />
        <DetailRow
          label="Temperatur"
          value={formatNullableNumber(run.context.weather.temperatureCelsius, '°C')}
        />
        <DetailRow
          label="Wind"
          value={formatNullableNumber(run.context.weather.windSpeedKph, 'km/h')}
        />
      </DetailSection>
    );
  }

  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={styles.header}>
        <Text style={styles.eyebrow}>LaufBuddy</Text>
        <Text style={styles.title}>Laufdetails</Text>
        <Text style={styles.subtitle}>{formatDate(run.startedAt)}</Text>
      </View>

      <View style={styles.mapLayer}>
        {mapInitialRegion !== null ? (
          <MapView
            style={styles.nativeMap}
            provider={PROVIDER_GOOGLE}
            initialRegion={mapInitialRegion}
            mapType="standard"
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={true}
            showsTraffic={false}
            toolbarEnabled={false}
            zoomEnabled={true}
            scrollEnabled={true}
            rotateEnabled={true}
            pitchEnabled={true}
            onPress={() => setWheelVisible((isVisible) => !isVisible)}
            onPanDrag={() => setWheelVisible(false)}
          >
            {routeCoordinates.length >= 2 ? (
              <Polyline
                coordinates={routeCoordinates}
                strokeColor="#34A6D8"
                strokeWidth={5}
                geodesic={true}
              />
            ) : null}

            {pauseMarkerCoordinates.map((pauseMarker) => (
              <Marker
                key={`pause-${pauseMarker.id}`}
                coordinate={pauseMarker}
                title={`Pause ${pauseMarker.pauseIndex}`}
                description={formatMilliseconds(pauseMarker.durationMs)}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.nativePauseMarker}>
                  <Text style={styles.nativePauseMarkerText}>
                    {pauseMarker.pauseIndex}
                  </Text>
                </View>
              </Marker>
            ))}

            {firstRouteCoordinate !== null ? (
              <Marker
                coordinate={firstRouteCoordinate}
                title="Start"
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.nativeStartMarker} />
              </Marker>
            ) : null}

            {lastRouteCoordinate !== null ? (
              <Marker
                coordinate={lastRouteCoordinate}
                title="Ziel"
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.nativeEndMarker} />
              </Marker>
            ) : null}
          </MapView>
        ) : (
          <Pressable
            style={styles.emptyMapFallback}
            onPress={() => setWheelVisible((isVisible) => !isVisible)}
          />
        )}
      </View>

      {isWheelVisible ? (
        <View pointerEvents="box-none" style={styles.wheelOverlay}>
          <SafetyWheel
            items={detailWheelItems}
            statusLabel="Laufdetails"
            statusSubline={formatDate(run.startedAt)}
            statusColor="#34A6D8"
            secondaryStatusLine="Kreis tippen: alles anzeigen"
            bottomHint="Wischen zum Drehen"
            wheelSize={DETAIL_WHEEL_SIZE}
            centerStatusContent={renderCenterContent()}
            centerConfirmContent={renderCenterContent()}
            centerPressMode="direct"
            onSelectedItemChange={handleSelectedWheelItemChange}
          />
        </View>
      ) : null}

      {isDetailOverlayVisible ? (
        <View style={styles.detailOverlay}>
          <Pressable
            style={styles.detailBackdrop}
            onPress={() => setDetailOverlayVisible(false)}
          />
          <View style={styles.detailSheet}>
            <ScrollView
              contentContainerStyle={styles.detailSheetContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.detailBadge}>LAUFDETAILS</Text>
              <Text style={styles.detailTitle}>{formatDate(run.startedAt)}</Text>

              {detailSectionOrder.map((sectionKey) => (
                <React.Fragment key={sectionKey}>
                  {renderDetailSection(sectionKey)}
                </React.Fragment>
              ))}

              <Pressable
                style={styles.closeDetailButton}
                onPress={() => setDetailOverlayVisible(false)}
              >
                <Text style={styles.closeDetailButtonText}>Zur Karte</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={styles.detailRowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3FAFD',
  },
  mapLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  nativeMap: {
    ...StyleSheet.absoluteFillObject,
  },
  emptyMapFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  nativePauseMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#153243',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  nativePauseMarkerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  nativeStartMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#153243',
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  nativeEndMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#34A6D8',
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  mapBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#EAF8FC',
  },
  routeSegment: {
    position: 'absolute',
    height: ROUTE_LINE_THICKNESS,
    borderRadius: 999,
    backgroundColor: '#34A6D8',
  },
  routePoint: {
    position: 'absolute',
    width: ROUTE_POINT_SIZE,
    height: ROUTE_POINT_SIZE,
    borderRadius: ROUTE_POINT_SIZE / 2,
    backgroundColor: 'rgba(21, 50, 67, 0.36)',
  },
  startEndPoint: {
    position: 'absolute',
    width: ROUTE_START_END_SIZE,
    height: ROUTE_START_END_SIZE,
    borderRadius: ROUTE_START_END_SIZE / 2,
    backgroundColor: '#153243',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  endPoint: {
    backgroundColor: '#34A6D8',
  },
  pausePoint: {
    position: 'absolute',
    width: ROUTE_PAUSE_SIZE,
    height: ROUTE_PAUSE_SIZE,
    borderRadius: ROUTE_PAUSE_SIZE / 2,
    backgroundColor: '#f4c95d',
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausePointText: {
    color: '#101418',
    fontSize: 10,
    fontWeight: '900',
  },
  emptyRouteState: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyRouteText: {
    color: '#153243',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  wheelOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPanel: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  centerEyebrow: {
    color: '#5B6B7A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
    marginBottom: 6,
  },
  centerValue: {
    color: '#153243',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
  },
  centerText: {
    color: '#5B6B7A',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 16,
  },
  detailOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  detailBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(21, 50, 67, 0.22)',
  },
  detailSheet: {
    maxHeight: '82%',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 34,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    overflow: 'hidden',
  },
  detailSheetContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  detailBadge: {
    alignSelf: 'flex-start',
    color: '#34A6D8',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  detailTitle: {
    color: '#153243',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 18,
  },
  detailSection: {
    borderRadius: 24,
    backgroundColor: 'rgba(243, 250, 253, 0.95)',
    padding: 14,
    marginBottom: 12,
  },
  detailSectionTitle: {
    color: '#153243',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  editableDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    marginBottom: 8,
  },
  detailRowLabel: {
    color: '#5B6B7A',
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
  },
  detailRowValue: {
    color: '#153243',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
    flex: 1,
  },
  detailMutedText: {
    color: '#5B6B7A',
    fontSize: 13,
    fontWeight: '800',
  },
  shoePickerList: {
    borderRadius: 20,
    backgroundColor: '#ffffff',
    padding: 8,
    marginBottom: 10,
  },
  shoePickerOption: {
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    backgroundColor: 'rgba(243, 250, 253, 0.95)',
  },
  shoePickerOptionActive: {
    borderWidth: 2,
    borderColor: '#34A6D8',
  },
  shoePickerOptionText: {
    color: '#153243',
    fontSize: 14,
    fontWeight: '900',
  },
  shoePickerMetaText: {
    color: '#5B6B7A',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  detailPill: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  detailPillTitle: {
    color: '#153243',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 4,
  },
  detailPillText: {
    color: '#5B6B7A',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  closeDetailButton: {
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: '#34A6D8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  closeDetailButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  notFoundText: {
    color: '#153243',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 120,
  },
  header: {
    position: 'absolute',
    top: 70,
    left: 46,
    right: 46,
    zIndex: 3,
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(243, 250, 253, 0.84)',
    borderWidth: 1,
    borderColor: 'rgba(36, 119, 168, 0.16)',
  },
  eyebrow: {
    color: '#2477A8',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3,
    textAlign: 'center',
  },
  title: {
    marginTop: 1,
    color: '#153243',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 1,
    color: '#5B6B7A',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
