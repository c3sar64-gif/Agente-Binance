import { OHLCV } from './indicators';

/**
 * Proyección de velas por análogos históricos
 *
 * Busca en el historial los tramos cuyas últimas `window` velas se parecen (en forma) a las
 * actuales y proyecta lo que ocurrió después de ellos. Es una estimación estadística para
 * visualizar, NO una señal de trading validada.
 */

export interface ForecastCandle {
  time: string; // ISO
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ForecastBand {
  time: string; // ISO
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface Forecast {
  method: 'analogs' | 'volatility';
  horizon: number;
  cases: number; // nº de análogos usados (0 en el cono de volatilidad)
  upProbability: number | null; // % de análogos que acabaron por encima del precio base
  basePrice: number;
  baseTime: string;
  candles: ForecastCandle[];
  bands: ForecastBand[];
}

export interface ForecastOptions {
  horizon?: number; // velas a proyectar
  window?: number; // velas que forman el "patrón" a comparar
  neighbors?: number; // nº de análogos
  basePrice?: number; // precio desde el que se proyecta (por defecto, último cierre)
  baseTime: number; // timestamp (ms) de la vela desde la que se proyecta
  stepMs: number; // duración de una vela en ms
}

const TIMEFRAME_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000
};

export function timeframeToMs(timeframe: string): number | null {
  return TIMEFRAME_MS[timeframe] ?? null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function std(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

function median(values: number[]): number {
  return percentile([...values].sort((a, b) => a - b), 0.5);
}

/**
 * Construye la proyección. Devuelve null si los datos no son válidos.
 * `history` debe contener solo velas cerradas, en orden cronológico.
 */
export function buildForecast(history: OHLCV[], options: ForecastOptions): Forecast | null {
  const horizon = options.horizon ?? 12;
  const window = options.window ?? 16;
  const neighbors = options.neighbors ?? 25;

  const candles = history.filter(
    c => [c.open, c.high, c.low, c.close].every(v => Number.isFinite(v) && v > 0)
  );
  if (candles.length < window + 2) return null;

  const basePrice = options.basePrice ?? candles[candles.length - 1].close;
  if (!Number.isFinite(basePrice) || basePrice <= 0) return null;

  const closes = candles.map(c => c.close);
  // returns[i] = rendimiento logarítmico de la vela i respecto a la anterior (returns[0] = 0)
  const returns = closes.map((c, i) => (i === 0 ? 0 : Math.log(c / closes[i - 1])));
  const n = candles.length;
  const stepTime = (s: number) => new Date(options.baseTime + s * options.stepMs).toISOString();

  const query = returns.slice(n - window);
  const querySigma = std(query);

  // Candidatos: tramos que terminan en `end`, con `horizon` velas de futuro conocido
  // y sin solaparse con el tramo actual
  const lastEnd = n - 1 - Math.max(horizon, window);
  const scored: { end: number; distance: number; scale: number }[] = [];
  for (let end = window; end <= lastEnd; end++) {
    const candidate = returns.slice(end - window + 1, end + 1);
    const sigma = std(candidate);
    if (sigma === 0 || querySigma === 0) continue;
    let distance = 0;
    for (let j = 0; j < window; j++) {
      distance += (query[j] / querySigma - candidate[j] / sigma) ** 2;
    }
    scored.push({ end, distance, scale: querySigma / sigma });
  }

  // Elegir los más parecidos evitando tramos casi idénticos (ventanas solapadas)
  scored.sort((a, b) => a.distance - b.distance);
  const minGap = Math.max(2, Math.floor(window / 4));
  const picked: typeof scored = [];
  for (const candidate of scored) {
    if (picked.length >= neighbors) break;
    if (picked.every(p => Math.abs(p.end - candidate.end) >= minGap)) picked.push(candidate);
  }

  if (picked.length < Math.min(8, neighbors)) {
    return volatilityCone(candles, returns, basePrice, horizon, stepTime, options.baseTime);
  }

  // Para cada paso: distribución del cierre relativo y mediana de las mechas
  const closeRatios: number[][] = Array.from({ length: horizon }, () => []);
  const upperWicks: number[][] = Array.from({ length: horizon }, () => []);
  const lowerWicks: number[][] = Array.from({ length: horizon }, () => []);

  for (const { end, scale } of picked) {
    let cumulative = 0;
    for (let s = 1; s <= horizon; s++) {
      const candle = candles[end + s];
      cumulative += returns[end + s] * scale;
      closeRatios[s - 1].push(Math.exp(cumulative));
      const bodyTop = Math.max(candle.open, candle.close);
      const bodyBottom = Math.min(candle.open, candle.close);
      upperWicks[s - 1].push(((candle.high - bodyTop) / candle.close) * scale);
      lowerWicks[s - 1].push(((bodyBottom - candle.low) / candle.close) * scale);
    }
  }

  const forecastCandles: ForecastCandle[] = [];
  const bands: ForecastBand[] = [];
  let previousClose = basePrice;
  for (let s = 0; s < horizon; s++) {
    const sorted = [...closeRatios[s]].sort((a, b) => a - b);
    const close = basePrice * percentile(sorted, 0.5);
    const open = previousClose;
    const high = Math.max(open, close) * (1 + Math.max(0, median(upperWicks[s])));
    const low = Math.min(open, close) * (1 - Math.max(0, median(lowerWicks[s])));
    forecastCandles.push({ time: stepTime(s + 1), open, high, low, close });
    bands.push({
      time: stepTime(s + 1),
      p10: basePrice * percentile(sorted, 0.1),
      p25: basePrice * percentile(sorted, 0.25),
      p50: close,
      p75: basePrice * percentile(sorted, 0.75),
      p90: basePrice * percentile(sorted, 0.9)
    });
    previousClose = close;
  }

  const finalRatios = closeRatios[horizon - 1];
  const upProbability = (finalRatios.filter(r => r > 1).length / finalRatios.length) * 100;

  return {
    method: 'analogs',
    horizon,
    cases: picked.length,
    upProbability,
    basePrice,
    baseTime: new Date(options.baseTime).toISOString(),
    candles: forecastCandles,
    bands
  };
}

/**
 * Sin historial suficiente: cono de volatilidad sin dirección (mediana plana)
 */
function volatilityCone(
  candles: OHLCV[],
  returns: number[],
  basePrice: number,
  horizon: number,
  stepTime: (s: number) => string,
  baseTime: number
): Forecast {
  const recent = returns.slice(-Math.min(100, returns.length - 1));
  const sigma = std(recent);
  const recentCandles = candles.slice(-20);
  const avgRange = recentCandles.reduce((s, c) => s + (c.high - c.low) / c.close, 0) / recentCandles.length;

  const z10 = 1.2816;
  const z25 = 0.6745;
  const forecastCandles: ForecastCandle[] = [];
  const bands: ForecastBand[] = [];
  for (let s = 1; s <= horizon; s++) {
    const spread = sigma * Math.sqrt(s);
    forecastCandles.push({
      time: stepTime(s),
      open: basePrice,
      close: basePrice,
      high: basePrice * (1 + avgRange / 2),
      low: basePrice * (1 - avgRange / 2)
    });
    bands.push({
      time: stepTime(s),
      p10: basePrice * Math.exp(-z10 * spread),
      p25: basePrice * Math.exp(-z25 * spread),
      p50: basePrice,
      p75: basePrice * Math.exp(z25 * spread),
      p90: basePrice * Math.exp(z10 * spread)
    });
  }

  return {
    method: 'volatility',
    horizon,
    cases: 0,
    upProbability: null,
    basePrice,
    baseTime: new Date(baseTime).toISOString(),
    candles: forecastCandles,
    bands
  };
}

export default { buildForecast, timeframeToMs };
