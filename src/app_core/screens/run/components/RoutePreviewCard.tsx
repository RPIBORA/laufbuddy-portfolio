// src/app_core/screens/run/components/RoutePreviewCard.tsx
import React from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import type { RunPauseEntry, RunRoutePointSnapshot } from '../../../models/ShoeModels';

type RoutePreviewCardProps = {
  routePoints?: RunRoutePointSnapshot[];
  pauses?: RunPauseEntry[];
};

type PreviewPoint = {
  x: number;
  y: number;
};

type PausePreviewPoint = PreviewPoint & {
  id: string;
  pauseIndex: number;
};

const PREVIEW_HEIGHT = 180;
const POINT_SIZE = 6;
const START_END_SIZE = 10;
const PAUSE_POINT_SIZE = 16;
const LINE_THICKNESS = 3;

function hasEnoughRoutePoints(routePoints: RunRoutePointSnapshot[]): boolean {
  return routePoints.length >= 2;
}

function createPreviewPoints(
  routePoints: RunRoutePointSnapshot[],
  width: number,
  height: number,
): PreviewPoint[] {
  const latitudes = routePoints.map((point) => point.latitude);
  const longitudes = routePoints.map((point) => point.longitude);

  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  const latitudeRange = maxLatitude - minLatitude || 0.000001;
  const longitudeRange = maxLongitude - minLongitude || 0.000001;

  const padding = 18;
  const drawableWidth = Math.max(1, width - padding * 2);
  const drawableHeight = Math.max(1, height - padding * 2);

  return routePoints.map((point) => {
    const normalizedX = (point.longitude - minLongitude) / longitudeRange;
    const normalizedY = (point.latitude - minLatitude) / latitudeRange;

    return {
      x: padding + normalizedX * drawableWidth,
      y: padding + (1 - normalizedY) * drawableHeight,
    };
  });
}

function createPreviewPointFromGeo(
  latitude: number,
  longitude: number,
  routePoints: RunRoutePointSnapshot[],
  width: number,
  height: number,
): PreviewPoint {
  const latitudes = routePoints.map((point) => point.latitude);
  const longitudes = routePoints.map((point) => point.longitude);

  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  const latitudeRange = maxLatitude - minLatitude || 0.000001;
  const longitudeRange = maxLongitude - minLongitude || 0.000001;

  const padding = 18;
  const drawableWidth = Math.max(1, width - padding * 2);
  const drawableHeight = Math.max(1, height - padding * 2);

  const normalizedX = (longitude - minLongitude) / longitudeRange;
  const normalizedY = (latitude - minLatitude) / latitudeRange;

  return {
    x: padding + normalizedX * drawableWidth,
    y: padding + (1 - normalizedY) * drawableHeight,
  };
}

function createPausePreviewPoints(
  pauses: RunPauseEntry[],
  routePoints: RunRoutePointSnapshot[],
  width: number,
  height: number,
): PausePreviewPoint[] {
  const pausePreviewPoints: PausePreviewPoint[] = [];

  pauses.forEach((pause, index) => {
    if (pause.location === null) {
      return;
    }

    const previewPoint = createPreviewPointFromGeo(
      pause.location.latitude,
      pause.location.longitude,
      routePoints,
      width,
      height,
    );

    pausePreviewPoints.push({
      ...previewPoint,
      id: pause.id,
      pauseIndex: index + 1,
    });
  });

  return pausePreviewPoints;
}

function calculateSegmentStyle(from: PreviewPoint, to: PreviewPoint) {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const angle = Math.atan2(deltaY, deltaX);

  return {
    left: from.x,
    top: from.y - LINE_THICKNESS / 2,
    width: length,
    transform: [{ rotate: `${angle}rad` }],
  };
}

export default function RoutePreviewCard({
  routePoints = [],
  pauses = [],
}: RoutePreviewCardProps) {
  const [previewWidth, setPreviewWidth] = React.useState(0);

  const handleLayout = (event: LayoutChangeEvent) => {
    setPreviewWidth(event.nativeEvent.layout.width);
  };

  const canDrawRoute =
    previewWidth > 0 && hasEnoughRoutePoints(routePoints);

  const previewPoints = canDrawRoute
    ? createPreviewPoints(routePoints, previewWidth, PREVIEW_HEIGHT)
    : [];

  const pausePreviewPoints = canDrawRoute
    ? createPausePreviewPoints(pauses, routePoints, previewWidth, PREVIEW_HEIGHT)
    : [];

  const startPoint = previewPoints[0] ?? null;
  const endPoint = previewPoints[previewPoints.length - 1] ?? null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Strecke</Text>

      <View style={styles.previewBox} onLayout={handleLayout}>
        {!canDrawRoute ? (
          <Text style={styles.emptyText}>
            Noch keine gespeicherte GPS-Spur vorhanden.
          </Text>
        ) : (
          <>
            {previewPoints.slice(1).map((point, index) => {
              const previousPoint = previewPoints[index];

              return (
                <View
                  key={`segment-${index}`}
                  style={[
                    styles.segment,
                    calculateSegmentStyle(previousPoint, point),
                  ]}
                />
              );
            })}

            {previewPoints.map((point, index) => (
              <View
                key={`point-${index}`}
                style={[
                  styles.point,
                  {
                    left: point.x - POINT_SIZE / 2,
                    top: point.y - POINT_SIZE / 2,
                  },
                ]}
              />
            ))}

            {pausePreviewPoints.map((point) => (
              <View
                key={`pause-${point.id}`}
                style={[
                  styles.pausePoint,
                  {
                    left: point.x - PAUSE_POINT_SIZE / 2,
                    top: point.y - PAUSE_POINT_SIZE / 2,
                  },
                ]}
              >
                <Text style={styles.pausePointText}>{point.pauseIndex}</Text>
              </View>
            ))}

            {startPoint !== null && (
              <View
                style={[
                  styles.startPoint,
                  {
                    left: startPoint.x - START_END_SIZE / 2,
                    top: startPoint.y - START_END_SIZE / 2,
                  },
                ]}
              />
            )}

            {endPoint !== null && (
              <View
                style={[
                  styles.endPoint,
                  {
                    left: endPoint.x - START_END_SIZE / 2,
                    top: endPoint.y - START_END_SIZE / 2,
                  },
                ]}
              />
            )}
          </>
        )}
      </View>

      <Text style={styles.metaText}>
        GPS-Punkte: {routePoints.length} · Pausen: {pauses.length}
      </Text>

      <Text style={styles.hintText}>
        Vorschau ohne Kartenanbieter. Nur gespeicherte GPS-Spur.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#121920',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2b3542',
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  previewBox: {
    height: PREVIEW_HEIGHT,
    backgroundColor: '#0b1016',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#263241',
  },
  emptyText: {
    color: '#7f8896',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginTop: 76,
  },
  segment: {
    position: 'absolute',
    height: LINE_THICKNESS,
    backgroundColor: '#2a7fff',
    borderRadius: LINE_THICKNESS,
    transformOrigin: 'left center',
  },
  point: {
    position: 'absolute',
    width: POINT_SIZE,
    height: POINT_SIZE,
    borderRadius: POINT_SIZE / 2,
    backgroundColor: '#7fb3ff',
  },
  startPoint: {
    position: 'absolute',
    width: START_END_SIZE,
    height: START_END_SIZE,
    borderRadius: START_END_SIZE / 2,
    backgroundColor: '#1f8f5f',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  endPoint: {
    position: 'absolute',
    width: START_END_SIZE,
    height: START_END_SIZE,
    borderRadius: START_END_SIZE / 2,
    backgroundColor: '#c44536',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  pausePoint: {
    position: 'absolute',
    width: PAUSE_POINT_SIZE,
    height: PAUSE_POINT_SIZE,
    borderRadius: PAUSE_POINT_SIZE / 2,
    backgroundColor: '#f4c95d',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausePointText: {
    color: '#101418',
    fontSize: 9,
    fontWeight: '900',
  },
  metaText: {
    color: '#b0b7c3',
    fontSize: 13,
    marginTop: 10,
  },
  hintText: {
    color: '#7f8896',
    fontSize: 12,
    marginTop: 4,
  },
});