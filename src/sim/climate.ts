import { WeatherType } from './types';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface SeasonClimateInfo {
  seasonName: 'Summer' | 'Autumn' | 'Winter' | 'Spring';
  dateLabel: string;
  sunriseHour: number;
  sunsetHour: number;
  baseDayTempC: number;
  baseNightTempC: number;
}

/**
 * Computes Southern Hemisphere (Oamaru, 45.1°S) astronomical daylight and seasonal temperature for dayOfYear (1..365).
 */
export function getSeasonClimateInfo(dayOfYear: number): SeasonClimateInfo {
  const day = Math.max(1, Math.min(365, Math.round(dayOfYear)));

  // Convert dayOfYear to Month & Day
  let rem = day;
  let monthIdx = 0;
  while (monthIdx < 11 && rem > MONTH_DAYS[monthIdx]) {
    rem -= MONTH_DAYS[monthIdx];
    monthIdx++;
  }
  const dateLabel = `${rem} ${MONTH_NAMES[monthIdx]}`;

  // Southern Hemisphere seasons: Dec-Feb Summer, Mar-May Autumn, Jun-Aug Winter, Sep-Nov Spring
  let seasonName: SeasonClimateInfo['seasonName'] = 'Spring';
  if (monthIdx === 11 || monthIdx <= 1) seasonName = 'Summer';
  else if (monthIdx >= 2 && monthIdx <= 4) seasonName = 'Autumn';
  else if (monthIdx >= 5 && monthIdx <= 7) seasonName = 'Winter';

  // Southern Hemisphere solstice: longest day ~Dec 21 (day 355), shortest day ~Jun 21 (day 172)
  const seasonalCos = Math.cos(((day - 355) / 365) * Math.PI * 2); // +1 in Summer, -1 in Winter

  // Oamaru daylight spans ~8.8 hrs in mid-winter (08:05–16:55) to ~15.4 hrs in mid-summer (05:45–21:10)
  const halfDaylight = 6.05 + seasonalCos * 1.65;
  const solarNoon = 12.65;
  const sunriseHour = solarNoon - halfDaylight;
  const sunsetHour = solarNoon + halfDaylight;

  const baseDayTempC = 14.2 + seasonalCos * 6.4; // ~20.6°C Summer, ~7.8°C Winter
  const baseNightTempC = 6.8 + seasonalCos * 5.2; // ~12.0°C Summer, ~1.6°C Winter

  return {
    seasonName,
    dateLabel,
    sunriseHour,
    sunsetHour,
    baseDayTempC,
    baseNightTempC,
  };
}

export function computeAmbientTempC(dayOfYear: number, timeHour: number, weather: WeatherType): number {
  const info = getSeasonClimateInfo(dayOfYear);
  // Peak warmth around 14:30, coldest around 05:30
  const diurnal = Math.sin(((timeHour - 8.5) / 24) * Math.PI * 2);
  let temp = (info.baseDayTempC + info.baseNightTempC) * 0.5 + diurnal * (info.baseDayTempC - info.baseNightTempC) * 0.5;

  if (weather === 'cloudy') temp -= 1.6;
  else if (weather === 'rainy') temp -= 2.8;
  else if (weather === 'windy') temp -= 2.1;
  else if (weather === 'snowy') temp = Math.min(temp - 4.5, 1.5);

  return Math.round(temp * 10) / 10;
}

/**
 * Returns normalized seasonal probabilities for [sunny, cloudy, rainy, snowy, windy] in Oamaru, NZ.
 */
export function getWeatherWeights(dayOfYear: number, timeHour: number): Record<WeatherType, number> {
  const info = getSeasonClimateInfo(dayOfYear);
  const isAfternoon = timeHour >= 11 && timeHour <= 18;
  const isColdHour = timeHour <= 8 || timeHour >= 19.5;

  if (info.seasonName === 'Summer') {
    return {
      sunny: isAfternoon ? 0.54 : 0.48,
      cloudy: 0.24,
      rainy: 0.10,
      snowy: 0.0,
      windy: isAfternoon ? 0.12 : 0.08,
    };
  }
  if (info.seasonName === 'Autumn') {
    return {
      sunny: 0.30,
      cloudy: 0.35,
      rainy: 0.21,
      snowy: dayOfYear > 135 && isColdHour ? 0.03 : 0.0,
      windy: isAfternoon ? 0.14 : 0.10,
    };
  }
  if (info.seasonName === 'Winter') {
    return {
      sunny: 0.20,
      cloudy: 0.34,
      rainy: 0.22,
      snowy: isColdHour ? 0.20 : 0.10,
      windy: 0.14,
    };
  }
  // Spring (equinoctial winds common in Otago)
  return {
    sunny: 0.26,
    cloudy: 0.30,
    rainy: 0.17,
    snowy: dayOfYear < 262 && isColdHour ? 0.04 : 0.0,
    windy: isAfternoon ? 0.27 : 0.18,
  };
}

/**
 * Deterministically picks likely weather for a given day of year & hour (or advances with seed).
 */
export function pickLikelyWeather(dayOfYear: number, timeHour: number, rollSeed = 0): WeatherType {
  const weights = getWeatherWeights(dayOfYear, timeHour);
  const entries: [WeatherType, number][] = [
    ['sunny', weights.sunny],
    ['cloudy', weights.cloudy],
    ['rainy', weights.rainy],
    ['snowy', weights.snowy],
    ['windy', weights.windy],
  ];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);

  // Pseudo-random deterministic hash from day + hour + rollSeed so scrubbing dates yields realistic variety
  const raw = Math.sin(dayOfYear * 12.9898 + Math.floor(timeHour) * 78.233 + rollSeed * 43.123) * 43758.5453;
  const u = (raw - Math.floor(raw)) * total;

  let acc = 0;
  for (const [wType, w] of entries) {
    acc += w;
    if (u <= acc && w > 0) return wType;
  }
  return 'cloudy';
}
