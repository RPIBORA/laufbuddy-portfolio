import * as Location from 'expo-location';
import type { LocationSubscription, LocationObject } from 'expo-location';
import type { RoutePoint } from '../core/runs/runTrackingTypes';
import { isAcceptedRoutePoint } from '../core/runs/routePointValidation';

export type RunLocationPermissionState = 'granted' | 'denied' | 'undetermined';

export type RunLocationSample = {
  routePoint: RoutePoint;
};

export type RunLocationTrackingOptions = {
  timeIntervalMs?: number;
  distanceIntervalMeters?: number;
  accuracy?: Location.LocationAccuracy;
};

export type RunLocationTrackingCallbacks = {
  onLocationSample: (sample: RunLocationSample) => void;
  onTrackingError?: (error: Error) => void;
};


function mapPermissionStatus(
  status: Location.PermissionStatus,
): RunLocationPermissionState {
  if (status === Location.PermissionStatus.GRANTED) {
    return 'granted';
  }

  if (status === Location.PermissionStatus.DENIED) {
    return 'denied';
  }

  return 'undetermined';
}

function toRoutePoint(location: LocationObject): RoutePoint {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    timestamp: location.timestamp,
    accuracyMeters: location.coords.accuracy ?? null,
    altitudeMeters: location.coords.altitude ?? null,
    headingDegrees: location.coords.heading ?? null,
    speedMetersPerSecond: location.coords.speed ?? null,
  };
}


class RunLocationTrackingService {
  private subscription: LocationSubscription | null = null;
  private lastAcceptedRoutePoint: RoutePoint | null = null;

  async getForegroundPermissionState(): Promise<RunLocationPermissionState> {
    const permissionResponse =
      await Location.getForegroundPermissionsAsync();

    return mapPermissionStatus(permissionResponse.status);
  }

  async requestForegroundPermission(): Promise<RunLocationPermissionState> {
    const permissionResponse =
      await Location.requestForegroundPermissionsAsync();

    return mapPermissionStatus(permissionResponse.status);
  }

  async startTracking(
    callbacks: RunLocationTrackingCallbacks,
    options?: RunLocationTrackingOptions,
  ): Promise<void> {
    this.stopTracking();
    this.lastAcceptedRoutePoint = null;

    const permissionState = await this.getForegroundPermissionState();

    if (permissionState !== 'granted') {
      throw new Error('Standortberechtigung nicht erteilt.');
    }

    this.subscription = await Location.watchPositionAsync(
      {
        accuracy: options?.accuracy ?? Location.Accuracy.BestForNavigation,
        timeInterval: options?.timeIntervalMs ?? 1000,
        distanceInterval: options?.distanceIntervalMeters ?? 3,
        mayShowUserSettingsDialog: true,
      },
      (location) => {
        try {
          const routePoint = toRoutePoint(location);

          if (!isAcceptedRoutePoint(this.lastAcceptedRoutePoint, routePoint)) {
            return;
          }

          this.lastAcceptedRoutePoint = routePoint;

          callbacks.onLocationSample({
            routePoint,
          });
        } catch (error) {
          if (callbacks.onTrackingError) {
            callbacks.onTrackingError(
              error instanceof Error
                ? error
                : new Error('Unbekannter Tracking-Fehler.'),
            );
          }
        }
      },
    );
  }

  stopTracking(): void {
    if (!this.subscription) {
      this.lastAcceptedRoutePoint = null;
      return;
    }

    this.subscription.remove();
    this.subscription = null;
    this.lastAcceptedRoutePoint = null;
  }

  isTracking(): boolean {
    return this.subscription !== null;
  }
}

export const runLocationTrackingService = new RunLocationTrackingService();
