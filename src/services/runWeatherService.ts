// src/services/runWeatherService.ts
import type { RunWeatherSnapshot } from '../app_core/models/ShoeModels';

type OpenMeteoCurrentResponse = {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    precipitation?: number;
    rain?: number;
    snowfall?: number;
    weather_code?: number;
  };
};

export type RunWeatherLocation = {
  latitude: number;
  longitude: number;
};

function mapWeatherCodeToText(weatherCode: number | undefined): string | null {
  if (weatherCode === undefined) {
    return null;
  }

  if (weatherCode === 0) {
    return 'clear';
  }

  if ([1, 2, 3].includes(weatherCode)) {
    return 'cloudy';
  }

  if ([45, 48].includes(weatherCode)) {
    return 'fog';
  }

  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) {
    return 'rain';
  }

  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
    return 'snow';
  }

  if ([95, 96, 99].includes(weatherCode)) {
    return 'thunderstorm';
  }

  return 'unknown';
}

export async function getRunWeatherSnapshot(
  location: RunWeatherLocation,
): Promise<RunWeatherSnapshot> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${location.latitude}` +
    `&longitude=${location.longitude}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,rain,snowfall,weather_code' +
    '&timezone=auto';

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Wetterdaten konnten nicht geladen werden.');
  }

  const data = (await response.json()) as OpenMeteoCurrentResponse;
  const current = data.current;

  const rainAmount = current?.rain ?? 0;
  const snowAmount = current?.snowfall ?? 0;
  const precipitationAmount = current?.precipitation ?? null;

  return {
    weatherType: mapWeatherCodeToText(current?.weather_code),
    temperatureCelsius: current?.temperature_2m ?? null,
    feelsLikeCelsius: current?.apparent_temperature ?? null,
    humidityPercent: current?.relative_humidity_2m ?? null,
    windSpeedKph: current?.wind_speed_10m ?? null,
    precipitationMm: precipitationAmount,
    isRain: rainAmount > 0,
    isSnow: snowAmount > 0,
  };
}