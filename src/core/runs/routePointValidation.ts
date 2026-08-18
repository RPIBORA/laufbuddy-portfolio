import type { RoutePoint } from './runTrackingTypes';

export const MAX_ROUTE_POINT_ACCURACY_METERS = 25;
export const MIN_ROUTE_POINT_DISTANCE_METERS = 5;
export const MIN_ROUTE_POINT_INTERVAL_MS = 1_000;
export const MAX_ROUTE_POINT_SPEED_METERS_PER_SECOND = 8;

function distanceMeters(from: RoutePoint, to: RoutePoint): number {
  const radius = 6_371_000;
  const lat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const lon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const a = Math.sin(lat / 2) ** 2 + Math.cos((from.latitude * Math.PI) / 180) * Math.cos((to.latitude * Math.PI) / 180) * Math.sin(lon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Shared acceptance gate for foreground and background location samples. */
export function isAcceptedRoutePoint(previous: RoutePoint | null, next: RoutePoint): boolean {
  if (
    !Number.isFinite(next.latitude) ||
    next.latitude < -90 ||
    next.latitude > 90 ||
    !Number.isFinite(next.longitude) ||
    next.longitude < -180 ||
    next.longitude > 180 ||
    !Number.isFinite(next.timestamp) ||
    next.timestamp < 0 ||
    next.accuracyMeters === null ||
    !Number.isFinite(next.accuracyMeters) ||
    next.accuracyMeters < 0 ||
    next.accuracyMeters > MAX_ROUTE_POINT_ACCURACY_METERS
  ) return false;
  if (!previous) return true;
  const elapsed = next.timestamp - previous.timestamp;
  if (elapsed < MIN_ROUTE_POINT_INTERVAL_MS) return false;
  const meters = distanceMeters(previous, next);
  return meters >= MIN_ROUTE_POINT_DISTANCE_METERS && meters / (elapsed / 1000) <= MAX_ROUTE_POINT_SPEED_METERS_PER_SECOND;
}
